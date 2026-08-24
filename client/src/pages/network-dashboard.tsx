import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, AreaChart, Area } from "recharts";
import { Network, Activity, Server, Link2 } from "lucide-react";
import { useGame } from "@/lib/game-context";
import { DashboardShell } from "@/pages/dashboard-shell";
import { useSEO } from "@/lib/useSEO";
import { KpiCard, Panel } from "@/pages/dashboard-widgets";

export function NetworkDashboard() {
  // An interactive view of simulated state, not writing. It carries almost
  // no readable content, so it is deliberately kept out of the index
  // rather than competing with the archive as a thin page.
  useSEO({
    title: "Network | Max Doubin",
    description: "Network view of the simulated facility: topology, throughput and link health.",
    canonical: "https://maxdoubin.com/network",
    noindex: true,
  });

  const { networkNodes, networkLinks } = useGame();

  const throughput = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, index) => ({
        name: `M-${11 - index}`,
        inbound: Math.round(40 + Math.random() * 60),
        outbound: Math.round(30 + Math.random() * 50),
      })),
    []
  );

  const latency = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, index) => ({
        name: `S-${index + 1}`,
        ms: Math.round(2 + Math.random() * 8),
      })),
    []
  );

  return (
    <DashboardShell
      title="Network Operations"
      subtitle="Topology overview, throughput trends, and link health."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Nodes" value={networkNodes.length.toString()} icon={<Network className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Links" value={networkLinks.length.toString()} icon={<Link2 className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Utilization" value="78%" icon={<Activity className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Edge Servers" value="56" icon={<Server className="h-4 w-4 text-cyan-300" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Throughput (Gbps)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={throughput}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Line type="monotone" dataKey="inbound" stroke="#22d3ee" strokeWidth={2} />
                <Line type="monotone" dataKey="outbound" stroke="#a855f7" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Latency heatline">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latency}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Area type="monotone" dataKey="ms" stroke="#f97316" fill="rgba(249,115,22,0.3)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </DashboardShell>
  );
}
