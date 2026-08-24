import { useMemo } from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts";
import { Wrench, Boxes, Gauge, Zap } from "lucide-react";
import { useGame } from "@/lib/game-context";
import { DashboardShell } from "@/pages/dashboard-shell";
import { useSEO } from "@/lib/useSEO";
import { KpiCard, Panel } from "@/pages/dashboard-widgets";

export function BuildDashboard() {
  // An interactive view of simulated state, not writing. It carries almost
  // no readable content, so it is deliberately kept out of the index
  // rather than competing with the archive as a thin page.
  useSEO({
    title: "Build | Max Doubin",
    description: "Build view of the simulated facility: capacity, spend and equipment inventory.",
    canonical: "https://maxdoubin.com/build",
    noindex: true,
  });

  const { racks, facilityMetrics } = useGame();
  const rackCount = racks.length;

  const activityData = useMemo(
    () =>
      Array.from({ length: 12 }).map((_, index) => ({
        name: `T-${11 - index}`,
        changes: Math.round(4 + Math.sin(index * 0.6) * 3 + Math.random() * 2),
        selections: Math.round(6 + Math.cos(index * 0.4) * 4 + Math.random() * 2),
      })),
    []
  );

  const powerData = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, index) => ({
        name: `H-${7 - index}`,
        // itLoad is watts. Dividing by 100 gave a number that was neither
        // watts nor kW, and the bars did not line up with the KPI above them.
        kW: Math.round(
          (facilityMetrics.itLoad / 1000) * (0.86 + ((index * 37) % 23) / 100),
        ),
      })),
    [facilityMetrics.itLoad]
  );

  return (
    <DashboardShell
      title="Build Command Center"
      subtitle="Track layout changes, power impacts, and build workflow health."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Active Racks" value={rackCount.toString()} icon={<Boxes className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Build Actions" value="128" icon={<Wrench className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Power Impact" value={`${(facilityMetrics.itLoad / 1000).toFixed(1)} kW`} icon={<Zap className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Layout Health" value="98%" icon={<Gauge className="h-4 w-4 text-cyan-300" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Build activity timeline">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={activityData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Line type="monotone" dataKey="changes" stroke="#22d3ee" strokeWidth={2} />
                <Line type="monotone" dataKey="selections" stroke="#a855f7" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Power impact by hour">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={powerData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Bar dataKey="kW" fill="#38bdf8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </DashboardShell>
  );
}
