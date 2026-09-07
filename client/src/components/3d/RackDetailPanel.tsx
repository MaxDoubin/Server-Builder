import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Thermometer, Zap, Server, HardDrive, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Equipment3D, EmptySlot } from "./Equipment3D";
import { EquipmentPicker } from "./EquipmentPicker";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useGame } from "@/lib/game-context";
import { useToast } from "@/hooks/use-toast";
import type { FacilityCapacity } from "@/lib/capacity";
import type { Rack, Equipment, InstalledEquipment } from "@shared/schema";

interface RackDetailPanelProps {
  rack: Rack;
  onClose: () => void;
  isUnlocked: boolean;
  /**
   * Budget position of the floor, passed through to the picker so it can say
   * before you install something whether the facility has room for it.
   * Optional: the panel still works without it.
   */
  capacity?: FacilityCapacity;
}

function getStatusColor(value: number, thresholds: { good: number; warning: number }) {
  if (value < thresholds.good) return "text-noc-green";
  if (value < thresholds.warning) return "text-noc-yellow";
  return "text-noc-red";
}

export function RackDetailPanel({ rack, onClose, isUnlocked, capacity }: RackDetailPanelProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number>(1);

  const { equipmentCatalog, isStaticMode, removeEquipmentFromRack, addEquipmentToRack } = useGame();
  const { toast } = useToast();
  const [draggedEquipment, setDraggedEquipment] = useState<string | null>(null);

  const removeEquipmentMutation = useMutation({
    mutationFn: async (equipmentInstanceId: string) => {
      const response = await apiRequest("DELETE", `/api/racks/${rack.id}/equipment/${equipmentInstanceId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/racks"] });
    },
  });

  const powerPercent = (rack.currentPowerDraw / rack.powerCapacity) * 100;
  const usedSlots = rack.installedEquipment?.reduce((acc, eq) => acc + (eq.uEnd - eq.uStart + 1), 0) || 0;
  const slotPercent = (usedSlots / rack.totalUs) * 100;

  const getEquipmentForSlot = (uPosition: number): { equipment: Equipment; installed: InstalledEquipment } | null => {
    const installed = rack.installedEquipment?.find(
      (eq) => eq.uStart === uPosition
    );
    if (!installed) return null;
    const equipment = equipmentCatalog.find((eq) => eq.id === installed.equipmentId);
    if (!equipment) return null;
    return { equipment, installed };
  };

  const isSlotOccupied = (uPosition: number): boolean => {
    return rack.installedEquipment?.some(
      (eq) => uPosition >= eq.uStart && uPosition <= eq.uEnd
    ) || false;
  };

  const handleSlotClick = (uPosition: number) => {
    if (!isUnlocked) return;
    setSelectedSlot(uPosition);
    setShowPicker(true);
  };

  const handleDropEquipment = (equipmentId: string, uPosition: number) => {
    const equipment = equipmentCatalog.find((item) => item.id === equipmentId);
    if (!equipment) return;
    if (isStaticMode) {
      addEquipmentToRack(rack.id, equipmentId, uPosition);
      return;
    }
    apiRequest("POST", `/api/racks/${rack.id}/equipment`, { equipmentId, uStart: uPosition })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/racks"] });
      })
      .catch(() => {
        toast({
          title: "Unable to add equipment",
          description: "The service is unavailable. Please retry in a moment.",
          variant: "destructive",
        });
      });
  };

  const renderRackSlots = () => {
    const slots = [];
    let u = 42;
    
    while (u >= 1) {
      const eqData = getEquipmentForSlot(u);
      
      if (eqData) {
        const uHeight = eqData.equipment.uHeight;
        slots.push(
          <div key={u} className="relative group cursor-pointer" onClick={() => handleSlotClick(u)}>
            <Equipment3D
              equipment={eqData.equipment}
              installed={eqData.installed}
              uHeight={uHeight}
            />
            {isUnlocked && (
              <Button
                size="icon"
                variant="destructive"
                className="absolute -right-2 top-1/2 -translate-y-1/2 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isStaticMode) {
                    removeEquipmentFromRack(rack.id, eqData.installed.id);
                    return;
                  }
                  removeEquipmentMutation.mutate(eqData.installed.id);
                }}
                data-testid={`remove-equipment-${eqData.installed.id}`}
                aria-label={`Remove ${eqData.equipment.name} from unit ${u}`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
            <div className="absolute left-0 top-0 -translate-x-full pr-1 text-[10px] font-mono text-muted-foreground">
              {u}
            </div>
          </div>
        );
        u -= uHeight;
      } else if (!isSlotOccupied(u)) {
        slots.push(
          <div key={u} className="relative">
            <EmptySlot
              uPosition={u}
              onClick={() => handleSlotClick(u)}
              onDropEquipment={(equipmentId) => handleDropEquipment(equipmentId, u)}
            />
            <div className="absolute left-0 top-0 -translate-x-full pr-1 text-[10px] font-mono text-muted-foreground">
              {u}
            </div>
          </div>
        );
        u--;
      } else {
        slots.push(
          <div key={u} className="relative">
            <EmptySlot
              uPosition={u}
              onClick={() => handleSlotClick(u)}
              onDropEquipment={(equipmentId) => handleDropEquipment(equipmentId, u)}
            />
            <div className="absolute left-0 top-0 -translate-x-full pr-1 text-[10px] font-mono text-muted-foreground">
              {u}
            </div>
          </div>
        );
        u--;
      }
    }
    
    return slots;
  };

  return (
    <>
      <div className="absolute right-0 top-0 h-full w-[420px] bg-gradient-to-b from-slate-950/95 via-black/95 to-slate-950/95 backdrop-blur-md border-l border-cyan-500/20 shadow-[-20px_0_40px_rgba(0,0,0,0.35)] z-50 flex flex-col" data-testid="rack-detail-panel">
        <div className="flex items-center justify-between p-4 border-b border-cyan-500/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-noc-blue/20">
              <Server className="w-5 h-5 text-noc-blue" />
            </div>
            <div>
              <h2 className="font-display font-bold text-lg">Rack {rack.name}</h2>
              <p className="text-sm text-muted-foreground">Model {rack.type.replace(/_/g, " ")}</p>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            data-testid="button-close-panel"
            aria-label={`Close the details for rack ${rack.name}`}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3 bg-card/50 border border-white/5 shadow-[0_0_20px_rgba(15,23,42,0.4)]">
                <div className="flex items-center gap-2 mb-1">
                  <Thermometer className="w-4 h-4 text-noc-blue" />
                  <span className="text-xs text-muted-foreground">Inlet Air</span>
                </div>
                <p className={`font-mono text-lg ${getStatusColor(rack.inletTemp, { good: 25, warning: 28 })}`}>
                  {rack.inletTemp.toFixed(1)}°C
                </p>
              </Card>
              
              <Card className="p-3 bg-card/50 border border-white/5 shadow-[0_0_20px_rgba(15,23,42,0.4)]">
                <div className="flex items-center gap-2 mb-1">
                  <Thermometer className="w-4 h-4 text-noc-red" />
                  <span className="text-xs text-muted-foreground">Exhaust Air</span>
                </div>
                <p className={`font-mono text-lg ${getStatusColor(rack.exhaustTemp, { good: 35, warning: 40 })}`}>
                  {rack.exhaustTemp.toFixed(1)}°C
                </p>
              </Card>
            </div>

            <Card className="p-3 bg-card/50 border border-white/5 shadow-[0_0_20px_rgba(15,23,42,0.4)]">
              <div className="flex items-center gap-2 mb-2">
                <Zap className={`w-4 h-4 ${getStatusColor(powerPercent, { good: 70, warning: 85 })}`} />
                <span className="text-xs text-muted-foreground">Power Draw</span>
                <span className="ml-auto font-mono text-sm">
                  {rack.currentPowerDraw.toLocaleString()}W / {rack.powerCapacity.toLocaleString()}W
                </span>
              </div>
              <Progress value={powerPercent} className="h-2" />
            </Card>

            <Card className="p-3 bg-card/50 border border-white/5 shadow-[0_0_20px_rgba(15,23,42,0.4)]">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-noc-cyan" />
                <span className="text-xs text-muted-foreground">Rack Capacity</span>
                <span className="ml-auto font-mono text-sm">
                  {usedSlots}U / {rack.totalUs}U
                </span>
              </div>
              <Progress value={slotPercent} className="h-2" />
            </Card>

            <Separator />

            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center justify-between">
                <span>Rack Layout · 42U</span>
                {isUnlocked && (
                  <Badge variant="outline" className="text-xs text-noc-purple border-noc-purple">
                    Click empty slot to add
                  </Badge>
                )}
              </h3>
              
              <div 
                className="relative pl-6 pr-2 py-2 rounded-lg"
                style={{
                  background: 'linear-gradient(180deg, #0a0a12 0%, #050508 100%)',
                  border: '2px solid #1a1a2e',
                  boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
                }}
              >
                <div className="space-y-0.5">
                  {renderRackSlots()}
                </div>

                <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l"
                  style={{
                    background: 'linear-gradient(180deg, #2a2a3a 0%, #1a1a2a 100%)',
                  }}
                />
                <div className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r"
                  style={{
                    background: 'linear-gradient(180deg, #2a2a3a 0%, #1a1a2a 100%)',
                  }}
                />
              </div>
            </div>

            {rack.installedEquipment && rack.installedEquipment.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Equipment Summary
                  </h3>
                  <div className="space-y-2">
                    {rack.installedEquipment.map((installed) => {
                      const equipment = equipmentCatalog.find((eq) => eq.id === installed.equipmentId);
                      if (!equipment) return null;
                      return (
                        <div key={installed.id} className="flex items-center justify-between p-2 rounded-md bg-background/50">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{
                                background: installed.status === "online" ? "#22c55e" : 
                                           installed.status === "warning" ? "#eab308" : "#ef4444",
                              }}
                            />
                            <span className="text-sm">{equipment.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              U{installed.uStart}-{installed.uEnd}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {equipment.powerDraw}W
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {isUnlocked && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Sandbox Catalog (Drag to rack)
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {equipmentCatalog.slice(0, 20).map((equipment) => {
                      const mockInstalled = {
                        id: `preview-${equipment.id}`,
                        equipmentId: equipment.id,
                        uStart: 1,
                        uEnd: equipment.uHeight,
                        status: "online" as const,
                        cpuLoad: 0,
                        memoryUsage: 0,
                        networkActivity: 0,
                      };
                      return (
                        <div
                          key={equipment.id}
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData("equipment-id", equipment.id);
                            setDraggedEquipment(equipment.id);
                          }}
                          onDragEnd={() => setDraggedEquipment(null)}
                          className={`rounded-md border border-white/10 bg-black/40 p-2 transition ${
                            draggedEquipment === equipment.id ? "opacity-60" : "hover:border-cyan-400/60"
                          }`}
                        >
                          <Equipment3D equipment={equipment} installed={mockInstalled} uHeight={equipment.uHeight} />
                          <div className="mt-1 text-[10px] font-mono text-white/70">
                            {equipment.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 text-[10px] text-white/50">
                    Showing 20 of {equipmentCatalog.length} items. Drag onto any empty slot.
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {!isUnlocked && (
          <div className="p-4 border-t border-border bg-muted/30">
            <p className="text-xs text-center text-muted-foreground">
              Enter secret code to unlock editing
            </p>
          </div>
        )}
      </div>

      {showPicker && (
        <EquipmentPicker
          rack={rack}
          selectedSlot={selectedSlot}
          capacity={capacity}
          onClose={() => setShowPicker(false)}
          onSuccess={() => setShowPicker(false)}
        />
      )}
    </>
  );
}
