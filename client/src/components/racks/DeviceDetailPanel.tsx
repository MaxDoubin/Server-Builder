/**
 * The panel a device slides out into when selected in the elevation.
 *
 * The enlarged faceplate at the top is the same DeviceFaceplate the rack
 * draws, at a bigger unit height, so the panel is literally the device
 * pulled out of the rack rather than a second illustration that could
 * drift from the first. Below it: the role prose, the spec rows, and the
 * vendor link every number traces back to.
 */

import { useId } from "react";
import type { RackDefinition, RackDevice } from "@/lib/rackTypes";
import { KIND_LABELS, portSummary } from "@/lib/racks";
import { DeviceFaceplate } from "./DeviceFaceplate";
import { RackDefs } from "./RackDefs";

const FAMILY_LABELS: Record<RackDevice["family"], string> = {
  router: "Router",
  switch: "Switch",
  server: "Server",
  storage: "Storage",
  firewall: "Firewall",
  pdu: "Power distribution",
  ups: "UPS",
  patch: "Patch panel",
  blank: "Passive",
};

/** "RU 3 to 4" for a 2U device sitting third from the bottom. */
function ruRange(rack: RackDefinition, device: RackDevice): string {
  let top = 0;
  for (const d of rack.devices) {
    if (d.id === device.id) break;
    top += d.u;
  }
  const upper = rack.height - top;
  const lower = upper - device.u + 1;
  return device.u === 1 ? `RU ${upper}` : `RU ${lower} to ${upper}`;
}

function SpecRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[hsl(var(--brand-iron))] py-2.5">
      <dt className="shrink-0 font-techno text-[10px] uppercase tracking-[0.3em] text-[hsl(var(--brand-ash))]">
        {label}
      </dt>
      <dd className="text-right font-mono-tight text-[13px] leading-relaxed text-[hsl(var(--brand-bone))]">
        {children}
      </dd>
    </div>
  );
}

export function DeviceDetailPanel({
  rack,
  device,
  onClose,
}: {
  rack: RackDefinition;
  device: RackDevice;
  onClose: () => void;
}) {
  // Its own def prefix: this SVG is a sibling of the elevation's, and the
  // material ids would otherwise collide across the two.
  const uid = useId().replace(/:/g, "");
  const ports = portSummary(device);
  const litLeds = (device.leds ?? []).filter((l) => l !== "off").length;

  return (
    // Keyed by device id at the call site, so switching devices replays the
    // slide-out entrance. The animation is pure CSS and honours
    // prefers-reduced-motion in index-level styles by never moving far.
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-techno text-[10px] uppercase tracking-[0.4em]" style={{ color: device.accent ?? "hsl(var(--brand-signal))" }}>
            {FAMILY_LABELS[device.family]} · {device.u}U · {ruRange(rack, device)}
          </div>
          <h2 className="mt-2 font-display text-xl font-medium leading-tight tracking-tight text-[hsl(var(--brand-bone))] md:text-2xl">
            {device.vendor === "Generic" ? device.model : `${device.vendor} ${device.model}`}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="relative shrink-0 rounded-full border border-[hsl(var(--brand-iron))] px-3 py-1.5 font-techno text-[10px] uppercase tracking-[0.25em] text-[hsl(var(--brand-ash))] transition-colors before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 hover:border-[hsl(var(--brand-signal))] hover:text-[hsl(var(--brand-bone))]"
        >
          Back to rack
        </button>
      </div>

      {/* The device, pulled out of the rack at detail scale. */}
      <div className="mt-6 overflow-hidden rounded-xl border border-[hsl(var(--brand-iron))] bg-[hsl(220_12%_5%)] p-3">
        <svg viewBox={`0 0 760 ${device.u * 88}`} width="100%" role="img" aria-label={`${device.model} front panel, enlarged`} style={{ display: "block" }}>
          <RackDefs uid={uid} />
          <style>{`.rk-brand{font-family:"Space Grotesk",system-ui,sans-serif;letter-spacing:.1em;text-transform:uppercase}
.rk-portnum{font-family:ui-monospace,monospace}
@keyframes rk-blink{0%,100%{opacity:1}50%{opacity:.3}}
.rk-led-on{animation:rk-blink 1.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){.rk-led-on{animation:none}}`}</style>
          <DeviceFaceplate device={device} width={760} unitH={88} detail uid={uid} />
        </svg>
      </div>

      <p className="mt-6 font-mono-tight text-[14px] leading-relaxed text-[hsl(var(--brand-bone-dim))]">
        {device.role}
      </p>

      <dl className="mt-6">
        <SpecRow label="Power">
          {typeof device.watts === "number" ? (
            `${device.watts}W published maximum`
          ) : device.family === "patch" || device.family === "blank" ? (
            "Passive, draws nothing"
          ) : (
            <span className="text-[hsl(var(--brand-ash))]">Not published by the vendor</span>
          )}
        </SpecRow>
        {ports.length > 0 && (
          <SpecRow label="Front panel">
            {ports
              .map((p) => {
                const name = KIND_LABELS[p.kind] ?? p.kind;
                const lit = p.lit > 0 ? `, ${p.lit} lit` : "";
                return `${p.total} × ${name}${lit}`;
              })
              .join(" · ")}
          </SpecRow>
        )}
        {device.bays && (
          <SpecRow label="Drive bays">
            {`${device.bays.count} × ${device.bays.label}, ${device.bays.occupied} fitted`}
          </SpecRow>
        )}
        {device.leds && device.leds.length > 0 && (
          <SpecRow label="Chassis LEDs">{`${device.leds.length} indicators, ${litLeds} lit`}</SpecRow>
        )}
        {device.url && (
          <SpecRow label="Source">
            <a
              href={device.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--brand-signal))] underline-offset-4 hover:underline"
            >
              Vendor spec page
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </SpecRow>
        )}
      </dl>

      <p className="mt-5 font-mono-tight text-[12px] leading-relaxed text-[hsl(var(--brand-ash))]">
        Link lights, traffic bars and bay fit-out are illustrative: a plausible
        occupancy, drawn the same on every visit. Port counts, rack units and
        wattages are the vendor's published figures.
      </p>
    </div>
  );
}
