import { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from "recharts";
import { LayoutGrid, Thermometer, Wind, Layers } from "lucide-react";
import { useGame } from "@/lib/game-context";
import { DashboardShell } from "@/pages/dashboard-shell";
import { useSEO } from "@/lib/useSEO";
import { KpiCard, Panel } from "@/pages/dashboard-widgets";

const pieColors = ["#22d3ee", "#a855f7", "#f97316", "#10b981"];

export function FloorDashboard() {
  // An interactive view of simulated state, not writing. It carries almost
  // no readable content, so it is deliberately kept out of the index
  // rather than competing with the archive as a thin page.
  useSEO({
    title: "Floor | Max Doubin",
    description: "Floor view of the simulated facility: rack layout, density and thermal load.",
    canonical: "https://maxdoubin.com/floor",
    noindex: true,
  });

  const { racks } = useGame();
  const rackCount = racks.length;

  const tempData = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, index) => ({
        name: `Zone ${index + 1}`,
        temp: Math.round(22 + Math.sin(index * 0.4) * 4 + Math.random() * 2),
      })),
    []
  );

  const zoneMix = useMemo(
    () => [
      { name: "Cold Aisle", value: 45 },
      { name: "Hot Aisle", value: 30 },
      { name: "Mechanical", value: 15 },
      { name: "Spare", value: 10 },
    ],
    []
  );

  return (
    <DashboardShell
      title="Floor Operations"
      subtitle="Thermal zones, airflow balance, and rack distribution across the floor."
    >
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard label="Total Racks" value={rackCount.toString()} icon={<LayoutGrid className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Avg Temp" value="24°C" icon={<Thermometer className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Airflow Balance" value="92%" icon={<Wind className="h-4 w-4 text-cyan-300" />} />
        <KpiCard label="Active Zones" value="12" icon={<Layers className="h-4 w-4 text-cyan-300" />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Temperature distribution">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tempData}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="name" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Area type="monotone" dataKey="temp" stroke="#22d3ee" fill="rgba(34,211,238,0.25)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Zone utilization">
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={zoneMix} dataKey="value" innerRadius={55} outerRadius={85} paddingAngle={3}>
                  {zoneMix.map((entry, index) => (
                    <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </DashboardShell>
  );
}
