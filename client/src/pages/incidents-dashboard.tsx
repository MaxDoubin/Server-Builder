import { useMemo } from "react";
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, LineChart, Line } from "recharts";
import { AlertTriangle, Siren, ClipboardList, Timer } from "lucide-react";
import { useGame } from "@/lib/game-context";
import { DashboardShell } from "@/pages/dashboard-shell";
import { useSEO } from "@/lib/useSEO";
import { KpiCard, Panel } from "@/pages/dashboard-widgets";

export function IncidentsDashboard() {
  // An interactive view of simulated state, not writing. It carries almost
  // no readable content, so it is deliberately kept out of the index
  // rather than competing with the archive as a thin page.
  useSEO({
    title: "Incidents | Max Doubin",
    description: "Incident view of the simulated facility: open alerts, severity and response state.",
    canonical: "https://maxdoubin.com/incidents",
    noindex: true,
  });

  const { incidents } = useGame();

  const severityData = useMemo(
    () => [
      { name: "P1", count: 3 },
      { name: "P2", count: 5 },
      { name: "P3", count: 9 },
      { name: "P4", count: 12 },
    ],
    []
  );

  const responseData = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, index) => ({
        name: `W-${7 - index}`,
        minutes: Math.round(6 + Math.random() * 6),
      })),
    []
  );

  return (
    <DashboardShell
      title="Incident Command"
      subtitle="Severity distribution, response speed, and open incident tracking."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Open Incidents" value={incidents.length.toString()} icon={<AlertTriangle className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Critical" value="3" icon={<Siren className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Runbooks" value="18" icon={<ClipboardList className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Median MTTR" value="11m" icon={<Timer className="h-4 w-4 text-cyan-300" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Severity breakdown">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Bar dataKey="count" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Response time trend">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={responseData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Line type="monotone" dataKey="minutes" stroke="#22d3ee" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </DashboardShell>
  );
}
