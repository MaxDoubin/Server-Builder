import { useGame } from "@/lib/game-context";
import type { Equipment, InstalledEquipment } from "@shared/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Server, Plus, Thermometer, Zap } from "lucide-react";

export function RackView() {
  const { racks, selectedRackId, setSelectedRackId, equipmentCatalog } = useGame();
  const selectedRack = racks.find((r) => r.id === selectedRackId);

  if (!selectedRack) {
    return (
      <Card className="flex flex-col items-center justify-center h-full bg-card/50 backdrop-blur-sm p-8" data-testid="rack-view-empty">
        <Server className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-display text-lg font-semibold">Select a Rack</h3>
        <p className="text-sm text-muted-foreground mt-2 text-center">
          Choose a rack from the thermal overview to view and edit its contents.
        </p>
        <div className="grid grid-cols-3 gap-2 mt-6">
          {racks.map((rack) => (
            <Button
              key={rack.id}
              variant="outline"
              onClick={() => setSelectedRackId(rack.id)}
              className="font-mono"
              data-testid={`button-select-rack-${rack.id}`}
            >
              {rack.name}
            </Button>
          ))}
        </div>
      </Card>
    );
  }

  const usSlots = Array.from({ length: selectedRack.totalUs }, (_, i) => i + 1).reverse();

  /*
    Rack contents, read the way the data model actually stores them.

    This pane used to look occupancy up as `slot.serverId`, a field no rack
    slot has ever carried: a slot is { uPosition, equipmentInstanceId }, and
    `serverId` appears nowhere in the repository. The lookup never matched, so
    the occupied branch was unreachable and every rack drew a column of empty
    Us no matter what was installed in it.

    The real link is rack.installedEquipment joined against the equipment
    catalog, which is what RackDetailPanel does. Equipment spans uStart to
    uEnd, so a 2U box occupies two rows: the row equal to uStart renders the
    device and the rows above it are covered, which keeps the column the same
    height as the U ruler beside it.
  */
  const startsAt = new Map<number, { equipment: Equipment; installed: InstalledEquipment }>();
  const covered = new Set<number>();
  for (const installed of selectedRack.installedEquipment ?? []) {
    const equipment = equipmentCatalog.find((item) => item.id === installed.equipmentId);
    if (!equipment) continue;
    startsAt.set(installed.uStart, { equipment, installed });
    for (let u = installed.uStart; u <= installed.uEnd; u += 1) covered.add(u);
  }

  const STATUS_DOT: Record<InstalledEquipment["status"], string> = {
    online: "bg-noc-green",
    warning: "bg-noc-yellow",
    critical: "bg-destructive",
    offline: "bg-muted-foreground",
  };

  return (
    <Card className="flex flex-col h-full bg-card/50 backdrop-blur-sm" data-testid="rack-view">
      <div className="flex items-center justify-between p-4 border-b border-border gap-2">
        <div className="flex items-center gap-3">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            {selectedRack.name}
          </h3>
          <Badge variant="outline" className="font-mono">
            {selectedRack.type.replace("_", " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Thermometer className="w-3 h-3 text-noc-yellow" />
            <span className="font-mono">{selectedRack.inletTemp.toFixed(1)}°C</span>
          </div>
          <div className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-noc-green" />
            <span className="font-mono">
              {(selectedRack.currentPowerDraw / 1000).toFixed(1)} kW
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <div className="flex gap-2">
          <div className="flex flex-col gap-1 text-[10px] font-mono text-muted-foreground">
            {usSlots.map((u) => (
              <div
                key={u}
                className="h-8 flex items-center justify-end pr-1 w-6"
              >
                {u}U
              </div>
            ))}
          </div>

          <div className="flex-1 border border-border rounded-md bg-background/30 overflow-hidden">
            {usSlots.map((u) => {
              const here = startsAt.get(u);

              // A row inside a multi-U device that is not its first U. The
              // device above already drew itself; this row only holds the
              // height so the column stays aligned with the U ruler.
              if (!here && covered.has(u)) {
                return (
                  <div
                    key={u}
                    className="h-8 border-b border-border/50 bg-primary/5"
                    data-testid={`rack-slot-${u}`}
                    aria-hidden
                  />
                );
              }

              if (here) {
                const { equipment, installed } = here;
                const spanned = installed.uEnd - installed.uStart + 1;
                return (
                  <div
                    key={u}
                    className="h-8 border-b border-border/50 px-2 flex items-center gap-2 bg-primary/10"
                    data-testid={`rack-slot-${u}`}
                    title={`${equipment.name} · ${installed.uStart}U to ${installed.uEnd}U · ${installed.status}`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-none ${STATUS_DOT[installed.status]}`}
                      aria-hidden
                    />
                    <span className="font-mono text-xs truncate">{equipment.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground flex-none">
                      {spanned}U
                      {typeof installed.cpuLoad === "number"
                        ? ` · ${Math.round(installed.cpuLoad)}%`
                        : ""}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={u}
                  className="h-8 border-b border-border/50 px-2 flex items-center justify-center hover-elevate cursor-pointer"
                  data-testid={`rack-slot-${u}`}
                >
                  <Plus className="w-4 h-4 text-muted-foreground/30" />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-muted-foreground">Power: </span>
              <span className="font-mono">
                {(selectedRack.currentPowerDraw / 1000).toFixed(1)} / {(selectedRack.powerCapacity / 1000).toFixed(0)} kW
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Airflow Block: </span>
              <span className={`font-mono ${selectedRack.airflowRestriction > 25 ? "text-noc-yellow" : ""}`}>
                {selectedRack.airflowRestriction}%
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedRackId(null)}
            data-testid="button-close-rack"
          >
            Close
          </Button>
        </div>
      </div>
    </Card>
  );
}
