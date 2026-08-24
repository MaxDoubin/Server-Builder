import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from "recharts";
import { Bell, ShieldAlert, Activity, Clock } from "lucide-react";
import { useGame } from "@/lib/game-context";
import { DashboardShell } from "@/pages/dashboard-shell";
import { useSEO } from "@/lib/useSEO";
import { KpiCard, Panel } from "@/pages/dashboard-widgets";

export function NocDashboard() {
  // An interactive view of simulated state, not writing. It carries almost
  // no readable content, so it is deliberately kept out of the index
  // rather than competing with the archive as a thin page.
  useSEO({
    title: "NOC | Max Doubin",
    description: "Network operations centre view of the simulated facility: alert timeline, uptime and live status.",
    canonical: "https://maxdoubin.com/noc",
    noindex: true,
  });

  const { alerts, facilityMetrics } = useGame();

  const alertTimeline = useMemo(
    () =>
      Array.from({ length: 14 }).map((_, index) => ({
        name: `H-${13 - index}`,
        alerts: Math.round(2 + Math.random() * 6),
      })),
    []
  );

  const uptimeData = useMemo(
    () =>
      Array.from({ length: 8 }).map((_, index) => ({
        name: `D-${7 - index}`,
        uptime: Math.round(96 + Math.random() * 4),
      })),
    []
  );

  return (
    <DashboardShell
      title="NOC Overview"
      subtitle="Monitor alert volume, uptime stability, and response cadence."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Active Alerts" value={alerts.length.toString()} icon={<Bell className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Critical" value={facilityMetrics.criticalAlerts.toString()} icon={<ShieldAlert className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Uptime" value={`${facilityMetrics.uptime.toFixed(2)}%`} icon={<Activity className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Avg Response" value="4.2m" icon={<Clock className="h-4 w-4 text-cyan-300" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Alert volume">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alertTimeline}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Bar dataKey="alerts" fill="#22d3ee" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Uptime trend">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={uptimeData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" domain={[90, 100]} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Area type="monotone" dataKey="uptime" stroke="#10b981" fill="rgba(16,185,129,0.25)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </DashboardShell>
  );
}
