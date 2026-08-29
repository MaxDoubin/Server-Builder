import { useGame } from "@/lib/game-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Server, Wind, Zap, Thermometer } from "lucide-react";

function getHeatColor(temp: number): string {
  if (temp < 25) return "bg-noc-blue/30 border-noc-blue/50";
  if (temp < 27) return "bg-noc-green/30 border-noc-green/50";
  if (temp < 30) return "bg-noc-yellow/30 border-noc-yellow/50";
  return "bg-noc-red/30 border-noc-red/50";
}

export function FloorMode() {
  const { racks, setSelectedRackId, facilityMetrics } = useGame();

  return (
    <div className="h-full overflow-auto p-4" data-testid="page-floor-mode">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-9">
          <Card className="p-6 bg-card/50 backdrop-blur-sm" data-testid="floor-plan">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                Data Center Floor Plan
              </h3>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-8 h-4 bg-noc-blue/20 border border-noc-blue/30 rounded" />
                  <span className="text-muted-foreground">Cold Aisle</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-8 h-4 bg-noc-red/20 border border-noc-red/30 rounded" />
                  <span className="text-muted-foreground">Hot Aisle</span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute left-0 right-0 h-16 bg-noc-blue/10 border border-dashed border-noc-blue/30 rounded-lg flex items-center justify-center">
                <Wind className="w-5 h-5 text-noc-blue mr-2" />
                <span className="text-xs font-mono text-noc-blue">COLD AISLE - CRAC INTAKE</span>
              </div>

              <div className="pt-20 pb-20">
                <div className="grid grid-cols-6 gap-4">
                  {racks.map((rack) => (
                    <Tooltip key={rack.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setSelectedRackId(rack.id)}
                          className={`aspect-[2/3] rounded-md border-2 ${getHeatColor(
                            rack.inletTemp
                          )} flex flex-col items-center justify-center p-2 hover-elevate active-elevate-2 transition-all`}
                          data-testid={`floor-rack-${rack.id}`}
                        >
                          <Server className="w-8 h-8 text-foreground/70 mb-2" />
                          <span className="font-mono text-sm font-semibold">
                            {rack.name}
                          </span>
                          <div className="flex items-center gap-2 mt-2 text-xs">
                            <div className="flex items-center gap-0.5">
                              <Thermometer className="w-3 h-3" />
                              <span className="font-mono">{rack.inletTemp.toFixed(0)}°</span>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Zap className="w-3 h-3" />
                              <span className="font-mono">
                                {(rack.currentPowerDraw / 1000).toFixed(1)}kW
                              </span>
                            </div>
                          </div>
                          {rack.airflowRestriction > 25 && (
                            <Badge variant="destructive" className="mt-2">
                              Airflow Blocked
                            </Badge>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-1">
                          <p className="font-semibold">{rack.name}</p>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Type:</span>
                            <span className="font-mono">{rack.type.replace("_", " ")}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">U-Space:</span>
                            <span className="font-mono">{rack.totalUs}U</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span className="text-muted-foreground">Power:</span>
                            <span className="font-mono">
                              {(rack.currentPowerDraw / 1000).toFixed(1)} / {(rack.powerCapacity / 1000).toFixed(0)} kW
                            </span>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}

                  {Array.from({ length: 6 - racks.length }).map((_, i) => (
                    <div
                      key={`empty-${i}`}
                      className="aspect-[2/3] rounded-md border-2 border-dashed border-muted flex flex-col items-center justify-center p-2 text-muted-foreground"
                    >
                      <span className="text-xs">Empty Slot</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="absolute left-0 right-0 bottom-0 h-16 bg-noc-red/10 border border-dashed border-noc-red/30 rounded-lg flex items-center justify-center">
                <Wind className="w-5 h-5 text-noc-red mr-2 rotate-180" />
                <span className="text-xs font-mono text-noc-red">HOT AISLE - CRAC EXHAUST</span>
              </div>
            </div>
          </Card>
        </div>

        <div className="col-span-12 lg:col-span-3 space-y-4">
          <Card className="p-4 bg-card/50 backdrop-blur-sm" data-testid="floor-summary">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider mb-4">
              Floor Summary
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Racks</span>
                <span className="font-mono">{racks.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Power</span>
                <span className="font-mono">
                  {(racks.reduce((sum, r) => sum + r.currentPowerDraw, 0) / 1000).toFixed(1)} kW
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Avg Inlet Temp</span>
                <span className="font-mono">
                  {(racks.reduce((sum, r) => sum + r.inletTemp, 0) / racks.length).toFixed(1)}°C
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cooling Load</span>
                <span className="font-mono">
                  {((facilityMetrics.coolingLoad / facilityMetrics.coolingCapacity) * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-card/50 backdrop-blur-sm" data-testid="airflow-status">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider mb-4">
              Airflow Status
            </h3>
            <div className="space-y-2">
              {racks.map((rack) => (
                <div key={rack.id} className="flex items-center justify-between text-sm">
                  <span className="font-mono">{rack.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${
                          rack.airflowRestriction > 25
                            ? "bg-noc-red"
                            : rack.airflowRestriction > 15
                            ? "bg-noc-yellow"
                            : "bg-noc-green"
                        }`}
                        style={{ width: `${rack.airflowRestriction}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs w-8 text-right">
                      {rack.airflowRestriction}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
