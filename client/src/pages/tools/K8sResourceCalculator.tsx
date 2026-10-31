/**
 * Kubernetes resource calculator.
 *
 * Three inputs feed one result. A quantity inspector shows how Kubernetes
 * reads a single value. Workloads are pods with replicas and containers,
 * each with requests and limits, and every pod gets its QoS class, its
 * effective request and what happens at each limit. A node with its
 * reservations gives the allocatable space, and the fit table says how many
 * pods of each shape land on one node and how many nodes the whole set
 * needs. All arithmetic lives in lib/toolkit/k8s-resource-calculator.
 */

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  MAX_CONTAINERS,
  MAX_WORKLOADS,
  SIMULATION_POD_CAP,
  analyzeNode,
  analyzePod,
  cfsQuotaUs,
  clusterFit,
  exactDecimal,
  fitPod,
  formatCpu,
  formatIec,
  formatSi,
  groupDigits,
  inspectQuantity,
  oomScoreAdj,
  parseQuantity,
  percent,
  printed,
  shortCpu,
  toBytes,
  type ContainerInput,
  type FieldKey,
  type NodeField,
  type NodeInput,
  type PodResult,
  type QosClass,
} from "@/lib/toolkit/k8s-resource-calculator";
import { ToolPanel, ToolResult, ToolShell } from "./ToolShell";

const LABEL_CLASS =
  "font-mono-tight text-[0.625rem] uppercase tracking-[0.32em] text-[hsl(var(--brand-ash))]";
const FIELD_LABEL_CLASS =
  "block font-mono-tight text-[0.625rem] uppercase tracking-[0.16em] text-[hsl(var(--brand-ash))]";
const INPUT_CLASS =
  "mt-3 w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-4 py-3 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none";
const FIELD_CLASS =
  "mt-1.5 min-h-[44px] w-full rounded-lg border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.6)] px-3 py-2 font-mono-tight text-sm text-[hsl(var(--brand-bone))] placeholder:text-[hsl(var(--brand-ash))] focus:border-[hsl(var(--brand-signal))] focus:outline-none aria-[invalid=true]:border-[hsl(var(--brand-danger))]";
const CODE_CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const CHIP_CLASS =
  "inline-flex min-h-[36px] items-center rounded-full border border-[hsl(var(--brand-iron))] px-4 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.18em] text-[hsl(var(--brand-ash))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))]";
const BUTTON_CLASS =
  "inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-4 py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] transition-colors hover:border-[hsl(var(--brand-signal)/0.6)] hover:text-[hsl(var(--brand-bone))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-signal))] disabled:cursor-not-allowed disabled:opacity-50";
const TH_CLASS =
  "py-2 pr-4 font-mono-tight text-[0.625rem] font-normal uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]";
const TD_CLASS = "py-2 pr-4 align-top font-mono-tight text-xs text-[hsl(var(--brand-bone))]";

/* ------------------------------------------------------------------ state */

interface ContainerState extends ContainerInput {
  id: number;
}

interface PodState {
  id: number;
  name: string;
  replicas: string;
  containers: ContainerState[];
}

let idCounter = 0;
const nextId = () => ++idCounter;

function container(
  name: string,
  cpuRequest: string,
  cpuLimit: string,
  memoryRequest: string,
  memoryLimit: string,
  init = false,
): ContainerState {
  return { id: nextId(), name, init, cpuRequest, cpuLimit, memoryRequest, memoryLimit };
}

function workload(name: string, replicas: string, containers: ContainerState[]): PodState {
  return { id: nextId(), name, replicas, containers };
}

const WORKLOAD_EXAMPLES: { label: string; build: () => PodState[] }[] = [
  {
    label: "Mixed",
    build: () => [
      workload("web", "3", [
        container("app", "250m", "1", "256Mi", "512Mi"),
        container("log-shipper", "50m", "100m", "64Mi", "128Mi"),
      ]),
      workload("postgres", "1", [
        container("db", "2", "2", "4Gi", "4Gi"),
        container("init-perms", "100m", "100m", "64Mi", "64Mi", true),
      ]),
      workload("batch", "2", [container("worker", "", "", "", "")]),
    ],
  },
  {
    label: "1G vs 1Gi",
    build: () => [workload("api", "4", [container("app", "500m", "500m", "1G", "1Gi")])],
  },
  {
    label: "Limits only",
    build: () => [workload("cache", "2", [container("redis", "", "1", "", "2Gi")])],
  },
  {
    label: "Init peak",
    build: () => [
      workload("app", "6", [
        container("app", "200m", "500m", "256Mi", "512Mi"),
        container("migrate", "2", "2", "1Gi", "1Gi", true),
      ]),
    ],
  },
  {
    label: "Memory typo",
    build: () => [workload("svc", "2", [container("app", "100m", "", "512m", "")])],
  },
];

const NODE_DEFAULT: NodeInput = {
  cpuCapacity: "4",
  memoryCapacity: "16Gi",
  kubeReservedCpu: "100m",
  kubeReservedMemory: "1Gi",
  systemReservedCpu: "100m",
  systemReservedMemory: "500Mi",
  evictionHardMemory: "100Mi",
  maxPods: "110",
  usedCpu: "200m",
  usedMemory: "256Mi",
  usedPods: "3",
};

const NODE_PRESETS: { label: string; cpu: string; memory: string }[] = [
  { label: "2 vCPU, 4 GiB", cpu: "2", memory: "4Gi" },
  { label: "4 vCPU, 16 GiB", cpu: "4", memory: "16Gi" },
  { label: "16 vCPU, 64 GiB", cpu: "16", memory: "64Gi" },
];

const NODE_FIELDS: { key: NodeField; label: string; placeholder: string }[] = [
  { key: "cpuCapacity", label: "CPU capacity", placeholder: "4" },
  { key: "memoryCapacity", label: "Memory capacity", placeholder: "16Gi" },
  { key: "kubeReservedCpu", label: "kube-reserved CPU", placeholder: "100m" },
  { key: "kubeReservedMemory", label: "kube-reserved memory", placeholder: "1Gi" },
  { key: "systemReservedCpu", label: "system-reserved CPU", placeholder: "100m" },
  { key: "systemReservedMemory", label: "system-reserved memory", placeholder: "500Mi" },
  { key: "evictionHardMemory", label: "Hard eviction threshold", placeholder: "100Mi" },
  { key: "maxPods", label: "Max pods", placeholder: "110" },
  { key: "usedCpu", label: "DaemonSet CPU requests", placeholder: "200m" },
  { key: "usedMemory", label: "DaemonSet memory requests", placeholder: "256Mi" },
  { key: "usedPods", label: "DaemonSet pods", placeholder: "3" },
];

const CONTAINER_FIELDS: { key: FieldKey; label: string; placeholder: string }[] = [
  { key: "cpuRequest", label: "CPU request", placeholder: "250m" },
  { key: "cpuLimit", label: "CPU limit", placeholder: "1" },
  { key: "memoryRequest", label: "Memory request", placeholder: "256Mi" },
  { key: "memoryLimit", label: "Memory limit", placeholder: "512Mi" },
];

const QUANTITY_EXAMPLES = ["500m", "0.5", "1.5Gi", "1G", "129e6", "123Mi", "128974848000m", "1.1Gi"];

const QOS_STYLE: Record<QosClass, string> = {
  Guaranteed: "border-[hsl(var(--brand-signal)/0.6)] text-[hsl(var(--brand-signal))]",
  Burstable: "border-[hsl(var(--brand-amber)/0.6)] text-[hsl(var(--brand-amber))]",
  BestEffort: "border-[hsl(var(--brand-danger)/0.6)] text-[hsl(var(--brand-danger))]",
};

/* ------------------------------------------------------------- components */

function Field({
  id,
  label,
  value,
  onChange,
  error,
  placeholder,
  testId,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
  testId?: string;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        aria-invalid={error ? true : false}
        aria-describedby={error ? `${id}-error` : undefined}
        placeholder={placeholder}
        data-testid={testId}
        className={FIELD_CLASS}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function QosBadge({ qos }: { qos: QosClass }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] ${QOS_STYLE[qos]}`}
    >
      {qos}
    </span>
  );
}

function Notice({ tone, children }: { tone: "danger" | "amber"; children: React.ReactNode }) {
  const cls =
    tone === "danger"
      ? "border-[hsl(var(--brand-danger)/0.5)] bg-[hsl(var(--brand-danger)/0.08)] text-[hsl(var(--brand-danger))]"
      : "border-[hsl(var(--brand-amber)/0.5)] bg-[hsl(var(--brand-amber)/0.08)] text-[hsl(var(--brand-amber))]";
  return <div className={`rounded-lg border p-3 font-mono-tight text-xs leading-relaxed ${cls}`}>{children}</div>;
}

function cpuAtLimit(limitNano: bigint | null): string {
  if (limitNano === null || limitNano === 0n) return "No cap. It can use idle CPU on the node.";
  const milli = (limitNano + 999999n) / 1000000n;
  const quota = cfsQuotaUs(milli);
  const ms = Number(quota) / 1000;
  const floor = milli * 100n < 1000n ? " (raised to the 1 ms minimum quota)" : "";
  return `Throttled after ${ms} ms of CPU time in each 100 ms period${floor}. On cgroup v2, cpu.max is "${quota} 100000".`;
}

function memoryAtLimit(limitNano: bigint | null): string {
  if (limitNano === null || limitNano === 0n) return "No cap. Only node memory pressure stops it.";
  const bytes = toBytes(limitNano);
  return `OOM-killed above ${formatIec(bytes)} (cgroup v2 memory.max ${groupDigits(bytes)}), exit code 137.`;
}

function PodSummary({ pod, nodeMemory }: { pod: PodResult; nodeMemory: bigint | null }) {
  const notes = pod.containers.flatMap((c) => c.notes);
  return (
    <div className="mt-5 space-y-4 border-t border-[hsl(var(--brand-iron)/0.6)] pt-4">
      {pod.errors.length ? (
        <Notice tone="danger">
          <ul className="space-y-1">
            {pod.errors.map((e, i) => (
              <li key={i} className="break-words">
                {e}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {pod.qos ? (
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={LABEL_CLASS}>QoS class</span>
            <QosBadge qos={pod.qos} />
          </div>
          <ul className="mt-2 space-y-1">
            {pod.qosReasons.map((r, i) => (
              <li key={i} className="break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pod.qos ? (
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <ToolResult label="Pod CPU request" value={shortCpu(pod.request.cpuMilli)} />
          <ToolResult label="Pod memory request" value={formatIec(pod.request.memoryBytes)} />
          <ToolResult
            label="Pod CPU limit"
            value={pod.limit.cpuMilli === null ? `none (${pod.limit.cpuUnboundedBy ?? "a container"} has no limit)` : shortCpu(pod.limit.cpuMilli)}
          />
          <ToolResult
            label="Pod memory limit"
            value={
              pod.limit.memoryBytes === null
                ? `none (${pod.limit.memoryUnboundedBy ?? "a container"} has no limit)`
                : formatIec(pod.limit.memoryBytes)
            }
          />
        </div>
      ) : null}

      {pod.qos && (pod.initDominates.cpu || pod.initDominates.memory) ? (
        <p className="font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]">
          The init container {pod.initDominates.cpu ?? pod.initDominates.memory} asks for more{" "}
          {pod.initDominates.cpu && pod.initDominates.memory ? "CPU and memory" : pod.initDominates.cpu ? "CPU" : "memory"}{" "}
          than all the app containers together. Init containers run one at a time before the app starts, so the
          scheduler reserves the larger of the two, and that space sits idle once the init container exits.
        </p>
      ) : null}

      {pod.qos ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-left">
            <caption className="sr-only">What happens at each container&apos;s limits</caption>
            <thead>
              <tr className="border-b border-[hsl(var(--brand-iron))]">
                <th scope="col" className={TH_CLASS}>
                  Container
                </th>
                <th scope="col" className={TH_CLASS}>
                  At the CPU limit
                </th>
                <th scope="col" className={TH_CLASS}>
                  At the memory limit
                </th>
                <th scope="col" className={TH_CLASS}>
                  oom_score_adj
                </th>
              </tr>
            </thead>
            <tbody>
              {pod.containers.map((c, i) => (
                <tr key={i} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                  <td className={`${TD_CLASS} break-all`}>
                    {c.name}
                    {c.init ? <span className="text-[hsl(var(--brand-ash))]"> (init)</span> : null}
                  </td>
                  <td className={`${TD_CLASS} leading-relaxed text-[hsl(var(--brand-bone-dim))]`}>{cpuAtLimit(c.limit.cpu)}</td>
                  <td className={`${TD_CLASS} leading-relaxed text-[hsl(var(--brand-bone-dim))]`}>{memoryAtLimit(c.limit.memory)}</td>
                  <td className={TD_CLASS}>
                    {pod.qos && nodeMemory !== null
                      ? oomScoreAdj(pod.qos, c.request.memory === null ? 0n : toBytes(c.request.memory), nodeMemory)
                      : "n/a"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {notes.length ? (
        <Notice tone="amber">
          <ul className="space-y-1">
            {notes.map((n, i) => (
              <li key={i} className="break-words">
                {n}
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- page */

export function K8sResourceCalculator() {
  const [quantityRaw, setQuantityRaw] = useState("1Gi");
  const [pods, setPods] = useState<PodState[]>(() => WORKLOAD_EXAMPLES[0].build());
  const [node, setNode] = useState<NodeInput>(NODE_DEFAULT);

  const quantity = useMemo(() => parseQuantity(quantityRaw), [quantityRaw]);
  const report = quantity.ok ? inspectQuantity(quantity.value) : null;

  const results = useMemo(() => pods.map((p) => analyzePod(p)), [pods]);
  const nodeResult = useMemo(() => analyzeNode(node), [node]);
  const fits = useMemo(
    () => (nodeResult.ok ? results.map((r) => (r.valid ? fitPod(r, nodeResult) : null)) : []),
    [results, nodeResult],
  );
  const cluster = useMemo(() => (nodeResult.ok ? clusterFit(results, nodeResult) : null), [results, nodeResult]);
  const nodeMemory = nodeResult.capacity.memoryBytes > 0n ? nodeResult.capacity.memoryBytes : null;

  const updatePod = (id: number, change: Partial<Omit<PodState, "id" | "containers">>) =>
    setPods((list) => list.map((p) => (p.id === id ? { ...p, ...change } : p)));
  const updateContainer = (podId: number, cid: number, change: Partial<ContainerInput>) =>
    setPods((list) =>
      list.map((p) =>
        p.id === podId ? { ...p, containers: p.containers.map((c) => (c.id === cid ? { ...c, ...change } : c)) } : p,
      ),
    );
  const addContainer = (podId: number) =>
    setPods((list) =>
      list.map((p) =>
        p.id === podId && p.containers.length < MAX_CONTAINERS
          ? { ...p, containers: [...p.containers, container(`container-${p.containers.length + 1}`, "100m", "", "128Mi", "")] }
          : p,
      ),
    );
  const removeContainer = (podId: number, cid: number) =>
    setPods((list) => list.map((p) => (p.id === podId ? { ...p, containers: p.containers.filter((c) => c.id !== cid) } : p)));
  const addPod = () =>
    setPods((list) =>
      list.length < MAX_WORKLOADS
        ? [...list, workload(`workload-${list.length + 1}`, "1", [container("app", "100m", "500m", "128Mi", "256Mi")])]
        : list,
    );
  const removePod = (id: number) => setPods((list) => list.filter((p) => p.id !== id));
  const setNodeField = (key: NodeField, value: string) => setNode((n) => ({ ...n, [key]: value }));

  const quantityMsgId = "k8s-quantity-message";

  return (
    <ToolShell slug="k8s-resource-calculator">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ToolPanel title="Quantity">
            <label htmlFor="k8s-quantity" className="block font-mono-tight text-sm text-[hsl(var(--brand-bone-dim))]">
              A CPU or memory quantity
            </label>
            <input
              id="k8s-quantity"
              type="text"
              value={quantityRaw}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setQuantityRaw(event.target.value)}
              aria-invalid={!quantity.ok && quantityRaw.trim() !== ""}
              aria-describedby={quantityMsgId}
              placeholder="500m, 1.5Gi, 129e6"
              data-testid="input-quantity"
              className={INPUT_CLASS}
            />
            {!quantity.ok && quantityRaw.trim() !== "" ? (
              <p id={quantityMsgId} role="alert" data-testid="text-quantity-error" className="mt-3 flex gap-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-danger))]">
                <span aria-hidden="true">✕</span>
                <span className="min-w-0 break-words">{quantity.message}</span>
              </p>
            ) : (
              <p id={quantityMsgId} className="mt-3 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                Suffixes m, k, M, G, T, P, E are powers of 1000; Ki, Mi, Gi, Ti, Pi, Ei are powers of 1024; e6 is an
                exponent. Case matters.
              </p>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
                Try
              </span>
              {QUANTITY_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuantityRaw(example)}
                  data-testid={`button-quantity-${example.replace(/[^a-zA-Z0-9]+/g, "-")}`}
                  className={CODE_CHIP_CLASS}
                >
                  {example}
                </button>
              ))}
            </div>
          </ToolPanel>

          <ToolPanel title="How Kubernetes reads it">
            {report ? (
              <div data-testid="output-quantity">
                <ToolResult label="Kubernetes prints" value={printed(report.quantity)} testId="text-printed" />
                <ToolResult label="Exact value" value={report.exact} testId="text-exact" />
                <ToolResult label="Suffix" value={report.suffixMeaning} />
                <ToolResult label="As CPU" value={formatCpu(report.cpuMilli)} testId="text-as-cpu" />
                <ToolResult
                  label="As memory"
                  value={`${groupDigits(report.memoryBytes)} ${report.memoryBytes === 1n ? "byte" : "bytes"}`}
                  testId="text-as-memory"
                />
                <ToolResult label="Binary / decimal" value={`${formatIec(report.memoryBytes)} · ${formatSi(report.memoryBytes)}`} />
                {report.counterpart ? (
                  <p className="mt-4 break-words font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-bone-dim))]" data-testid="text-counterpart">
                    {report.counterpart.text} would be {groupDigits(report.counterpart.bytes)} bytes, which is{" "}
                    {report.counterpart.relation} than {report.quantity.text}. The gap grows with each step: about 2.4% at
                    k and Ki, 7.4% at G and Gi, 10% at T and Ti.
                  </p>
                ) : null}
                {report.cpuNotes.length || report.memoryNotes.length ? (
                  <div className="mt-4 space-y-2">
                    {report.memoryNotes.map((n, i) => (
                      <Notice key={`m${i}`} tone="amber">
                        As memory: {n}
                      </Notice>
                    ))}
                    {report.cpuNotes.map((n, i) => (
                      <Notice key={`c${i}`} tone="amber">
                        As CPU: {n}
                      </Notice>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]" data-testid="output-quantity">
                Enter a quantity to see how it is stored.
              </p>
            )}
          </ToolPanel>
        </div>

        <ToolPanel title="Workloads">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Load
            </span>
            {WORKLOAD_EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => setPods(example.build())}
                data-testid={`button-example-${example.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {example.label}
              </button>
            ))}
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Leave a field blank for unset. A request left blank next to a limit is filled in from the limit, as the API
            server does. Init containers here are the classic run-to-completion kind; sidecar init containers with
            restartPolicy: Always add to the running total instead and are not modeled.
          </p>

          <div className="mt-5 space-y-5">
            {pods.map((p, pi) => {
              const result = results[pi];
              return (
                <section
                  key={p.id}
                  aria-label={`Workload ${p.name || pi + 1}`}
                  className="rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(var(--brand-obsidian)/0.35)] p-4"
                >
                  <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_8rem_auto]">
                    <Field
                      id={`k8s-pod-${p.id}-name`}
                      label="Workload name"
                      value={p.name}
                      onChange={(value) => updatePod(p.id, { name: value })}
                      testId={`input-pod-name-${pi}`}
                    />
                    <Field
                      id={`k8s-pod-${p.id}-replicas`}
                      label="Replicas"
                      value={p.replicas}
                      onChange={(value) => updatePod(p.id, { replicas: value })}
                      error={result.replicasError ?? undefined}
                      testId={`input-pod-replicas-${pi}`}
                    />
                    <button
                      type="button"
                      onClick={() => removePod(p.id)}
                      className={BUTTON_CLASS}
                      aria-label={`Remove workload ${p.name || pi + 1}`}
                      data-testid={`button-remove-pod-${pi}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Remove
                    </button>
                  </div>

                  <div className="mt-4 space-y-3">
                    {p.containers.map((c, ci) => {
                      const cr = result.containers[ci];
                      return (
                        <div key={c.id} className="rounded-lg border border-[hsl(var(--brand-iron)/0.7)] p-3">
                          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                            <Field
                              id={`k8s-c-${c.id}-name`}
                              label={c.init ? "Init container name" : "Container name"}
                              value={c.name}
                              onChange={(value) => updateContainer(p.id, c.id, { name: value })}
                              testId={`input-container-name-${pi}-${ci}`}
                            />
                            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-[hsl(var(--brand-iron))] px-3 py-2 font-mono-tight text-xs text-[hsl(var(--brand-bone-dim))] focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[hsl(var(--brand-signal))]">
                              <input
                                type="checkbox"
                                checked={c.init}
                                onChange={(event) => updateContainer(p.id, c.id, { init: event.target.checked })}
                                data-testid={`checkbox-init-${pi}-${ci}`}
                                className="h-4 w-4 shrink-0 accent-[hsl(var(--brand-signal))]"
                              />
                              Init
                            </label>
                            <button
                              type="button"
                              onClick={() => removeContainer(p.id, c.id)}
                              className={`${BUTTON_CLASS} min-h-[44px]`}
                              aria-label={`Remove container ${c.name || ci + 1} from ${p.name || "this workload"}`}
                              data-testid={`button-remove-container-${pi}-${ci}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                            {CONTAINER_FIELDS.map((f) => (
                              <Field
                                key={f.key}
                                id={`k8s-c-${c.id}-${f.key}`}
                                label={f.label}
                                value={c[f.key]}
                                placeholder={f.placeholder}
                                onChange={(value) => updateContainer(p.id, c.id, { [f.key]: value })}
                                error={cr?.fieldErrors[f.key]}
                                testId={`input-${f.key}-${pi}-${ci}`}
                              />
                            ))}
                          </div>
                          {cr && (cr.defaulted.cpu || cr.defaulted.memory) ? (
                            <p className="mt-2 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                              {cr.defaulted.cpu && cr.defaulted.memory
                                ? "CPU and memory requests"
                                : cr.defaulted.cpu
                                  ? "CPU request"
                                  : "Memory request"}{" "}
                              defaulted to the limit.
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => addContainer(p.id)}
                      disabled={p.containers.length >= MAX_CONTAINERS}
                      className={BUTTON_CLASS}
                      data-testid={`button-add-container-${pi}`}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add container
                    </button>
                    {p.containers.length >= MAX_CONTAINERS ? (
                      <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
                        Up to {MAX_CONTAINERS} containers per workload.
                      </span>
                    ) : null}
                  </div>

                  <PodSummary pod={result} nodeMemory={nodeMemory} />
                </section>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={addPod}
              disabled={pods.length >= MAX_WORKLOADS}
              className={BUTTON_CLASS}
              data-testid="button-add-pod"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add workload
            </button>
            <span className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
              Up to {MAX_WORKLOADS} workloads.
            </span>
          </div>
        </ToolPanel>

        <ToolPanel title="Node">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-tight text-[0.625rem] uppercase tracking-[0.24em] text-[hsl(var(--brand-ash))]">
              Size
            </span>
            {NODE_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => setNode((n) => ({ ...n, cpuCapacity: preset.cpu, memoryCapacity: preset.memory }))}
                data-testid={`button-node-${preset.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                className={CHIP_CLASS}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {NODE_FIELDS.map((f) => (
              <Field
                key={f.key}
                id={`k8s-node-${f.key}`}
                label={f.label}
                value={node[f.key]}
                placeholder={f.placeholder}
                onChange={(value) => setNodeField(f.key, value)}
                error={nodeResult.fieldErrors[f.key]}
                testId={`input-node-${f.key}`}
              />
            ))}
          </div>
          <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
            Allocatable is capacity minus kube-reserved, system-reserved and the hard eviction threshold (memory only
            here). Reservations vary by provider and node size; read yours with kubectl describe node. DaemonSet
            requests come out of every node before your pods do.
          </p>
          {nodeResult.errors.length ? (
            <div className="mt-4">
              <Notice tone="danger">
                <ul className="space-y-1">
                  {nodeResult.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </Notice>
            </div>
          ) : null}
          {nodeResult.ok ? (
            <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-3" data-testid="output-node">
              <ToolResult label="Allocatable CPU" value={shortCpu(nodeResult.allocatable.cpuMilli)} testId="text-alloc-cpu" />
              <ToolResult label="Allocatable memory" value={formatIec(nodeResult.allocatable.memoryBytes)} testId="text-alloc-memory" />
              <ToolResult label="Pod slots" value={nodeResult.allocatable.pods.toString()} />
              <ToolResult label="Free CPU" value={shortCpu(nodeResult.available.cpuMilli)} />
              <ToolResult label="Free memory" value={formatIec(nodeResult.available.memoryBytes)} />
              <ToolResult label="Free pod slots" value={nodeResult.available.pods.toString()} />
            </div>
          ) : null}
        </ToolPanel>

        <ToolPanel title="Fit">
          <div data-testid="output-k8s">
            {!nodeResult.ok ? (
              <p className="font-mono-tight text-sm text-[hsl(var(--brand-ash))]">Fix the node to see how pods fit.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left" data-testid="table-fit">
                    <thead>
                      <tr className="border-b border-[hsl(var(--brand-iron))]">
                        <th scope="col" className={TH_CLASS}>
                          Workload
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          QoS
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Request per pod
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Pods per node
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Limited by
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Replicas
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Nodes alone
                        </th>
                        <th scope="col" className={TH_CLASS}>
                          Limits on a full node
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r, i) => {
                        const f = fits[i];
                        if (!f) {
                          return (
                            <tr key={pods[i]?.id ?? i} className="border-b border-[hsl(var(--brand-iron)/0.5)]">
                              <td className={`${TD_CLASS} break-all`}>{r.name}</td>
                              <td colSpan={7} className={`${TD_CLASS} text-[hsl(var(--brand-danger))]`}>
                                Fix the errors in this workload to fit it.
                              </td>
                            </tr>
                          );
                        }
                        const memPct =
                          f.fullNodeLimits.memoryBytes === null
                            ? null
                            : percent(f.fullNodeLimits.memoryBytes, nodeResult.allocatable.memoryBytes, 0);
                        const cpuPct =
                          f.fullNodeLimits.cpuMilli === null
                            ? null
                            : percent(f.fullNodeLimits.cpuMilli, nodeResult.allocatable.cpuMilli, 0);
                        return (
                          <tr key={pods[i]?.id ?? i} className="border-b border-[hsl(var(--brand-iron)/0.5)] last:border-b-0">
                            <td className={`${TD_CLASS} break-all`}>{r.name}</td>
                            <td className={TD_CLASS}>{r.qos}</td>
                            <td className={TD_CLASS}>
                              {shortCpu(r.request.cpuMilli)} · {formatIec(r.request.memoryBytes)}
                            </td>
                            <td className={`${TD_CLASS} text-[hsl(var(--brand-signal))]`} data-testid={`text-per-node-${i}`}>
                              {f.perNode.toString()}
                            </td>
                            <td className={TD_CLASS}>
                              {f.perNode === 0n ? "does not fit" : f.binding === "pods" ? "pod count" : f.binding}
                            </td>
                            <td className={TD_CLASS}>{r.replicas}</td>
                            <td className={TD_CLASS}>{f.nodesAlone === null ? "none fit" : f.nodesAlone.toString()}</td>
                            <td className={`${TD_CLASS} leading-relaxed`}>
                              {f.perNode === 0n
                                ? "n/a"
                                : `CPU ${cpuPct ?? "unbounded"}, memory ${memPct ?? "unbounded"} of allocatable`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {fits.some(
                  (f) => f && f.fullNodeLimits.memoryBytes !== null && f.fullNodeLimits.memoryBytes > nodeResult.allocatable.memoryBytes,
                ) ? (
                  <div className="mt-4">
                    <Notice tone="amber">
                      On a node filled with one of these shapes, the memory limits add up to more than allocatable. The
                      scheduler only counts requests, so this is allowed. If the pods grow toward their limits at the
                      same time, the kubelet evicts pods under memory pressure, and the kernel OOM killer can act first.
                    </Notice>
                  </div>
                ) : null}

                {cluster ? (
                  <div className="mt-6">
                    <div className={LABEL_CLASS}>All workloads together</div>
                    <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                      <ToolResult label="Pods" value={cluster.totalPods.toString()} testId="text-total-pods" />
                      <ToolResult
                        label="Requests"
                        value={`${shortCpu(cluster.request.cpuMilli)} CPU · ${formatIec(cluster.request.memoryBytes)}`}
                        testId="text-total-requests"
                      />
                      <ToolResult
                        label="Limits"
                        value={`${cluster.limit.cpuMilli === null ? "unbounded" : shortCpu(cluster.limit.cpuMilli)} CPU · ${
                          cluster.limit.memoryBytes === null ? "unbounded" : formatIec(cluster.limit.memoryBytes)
                        }`}
                      />
                      <ToolResult
                        label="Lower bound"
                        value={`${cluster.lowerBound} ${cluster.lowerBound === 1n ? "node" : "nodes"} (by ${
                          cluster.lowerBoundBinding === "pods" ? "pod count" : cluster.lowerBoundBinding
                        })`}
                      />
                      <ToolResult
                        label="Nodes needed"
                        value={cluster.packed === null ? "see below" : `${cluster.packed} ${cluster.packed === 1n ? "node" : "nodes"}`}
                        testId="text-nodes-needed"
                      />
                    </div>
                    <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                      Nodes needed places every pod with first fit decreasing on identical nodes, up to{" "}
                      {groupDigits(BigInt(SIMULATION_POD_CAP))} pods. The lower bound divides the total requests by one
                      node&apos;s free space; real packing can need more, because pods cannot be split across nodes. Neither
                      counts headroom for a node failure or a rolling update.
                    </p>
                    {cluster.unschedulable.length ? (
                      <div className="mt-3">
                        <Notice tone="danger">
                          {cluster.unschedulable.join(", ")}{" "}
                          {cluster.unschedulable.length === 1 ? "requests" : "request"} more than one empty node can give,
                          so the pod would stay Pending with Insufficient cpu or memory. No number of these nodes is
                          enough.
                        </Notice>
                      </div>
                    ) : cluster.packedSkipped ? (
                      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-amber))]">
                        {cluster.packedSkipped}
                      </p>
                    ) : null}
                    {results.some((r) => !r.valid) ? (
                      <p className="mt-3 font-mono-tight text-xs leading-relaxed text-[hsl(var(--brand-ash))]">
                        Workloads with errors are left out of these totals.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </ToolPanel>

        {report && report.quantity.roundedToNano ? (
          <p className="font-mono-tight text-xs text-[hsl(var(--brand-ash))]">
            The quantity above had precision below 1n, the smallest unit Kubernetes keeps, and was rounded up to{" "}
            {exactDecimal(report.quantity.nano)}.
          </p>
        ) : null}
      </div>
    </ToolShell>
  );
}
