import type { Equipment, InstalledEquipment } from "@shared/schema";

interface Equipment3DProps {
  equipment: Equipment;
  installed: InstalledEquipment;
  uHeight: number;
  onClick?: () => void;
}

function getStatusGlow(status: string): string {
  switch (status) {
    case "online": return "#00ff00";
    case "warning": return "#ffaa00";
    case "critical": return "#ff0000";
    default: return "#666666";
  }
}

function EquipmentFace({ 
  equipment, 
  uHeight, 
  status 
}: { 
  equipment: Equipment; 
  uHeight: number;
  status: string;
}) {
  const height = uHeight * 18;
  const ledColor = equipment.ledColor || "#00ff00";
  const statusGlow = getStatusGlow(status);
  
  const isServer = equipment.type.startsWith("server_");
  const isSwitch = equipment.type.startsWith("switch_");
  const isStorage = equipment.type.startsWith("storage_");
  const isNetwork = equipment.type.startsWith("router_") || equipment.type.startsWith("firewall_");
  
  return (
    <div
      className="relative w-full rounded-sm overflow-hidden"
      style={{
        height: `${height}px`,
        background: `linear-gradient(180deg, 
          ${equipment.color} 0%, 
          color-mix(in srgb, ${equipment.color} 70%, black) 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.1), 
                    inset 0 -1px 0 rgba(0,0,0,0.3),
                    0 2px 4px rgba(0,0,0,0.5)`,
      }}
    >
      {isServer && (
        <>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex gap-1">
            {Array.from({ length: Math.min(equipment.portCount, 4) }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-1.5 rounded-sm"
                style={{
                  background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)',
                  boxShadow: 'inset 0 0 2px rgba(0,255,0,0.3)',
                }}
              />
            ))}
          </div>
          
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <div
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{
                background: statusGlow,
                boxShadow: `0 0 6px ${statusGlow}`,
              }}
            />
            {equipment.ledColor && (
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: ledColor,
                  boxShadow: `0 0 4px ${ledColor}`,
                }}
              />
            )}
          </div>

          {uHeight >= 2 && (
            <div className="absolute left-1/2 -translate-x-1/2 top-1 flex gap-1">
              {Array.from({ length: Math.min(4, uHeight) }).map((_, i) => (
                <div
                  key={i}
                  className="w-4 h-3 rounded-sm"
                  style={{
                    background: 'radial-gradient(circle at center, #1a1a1a 30%, #0a0a0a 100%)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div
                    className="w-full h-full"
                    style={{
                      background: 'repeating-linear-gradient(90deg, transparent, transparent 1px, rgba(0,0,0,0.5) 1px, rgba(0,0,0,0.5) 2px)',
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {equipment.hasFans && uHeight >= 2 && (
            <div className="absolute right-6 bottom-1 flex gap-0.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className="w-3 h-3 rounded-full animate-spin"
                  style={{
                    background: 'radial-gradient(circle at center, #2a2a2a 30%, #0a0a0a 100%)',
                    animationDuration: '0.5s',
                    boxShadow: 'inset 0 0 2px rgba(0,0,0,0.5)',
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {isSwitch && (
        <>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-wrap gap-0.5" style={{ maxWidth: '70%' }}>
            {Array.from({ length: Math.min(equipment.portCount, 24) }).map((_, i) => (
              <div
                key={i}
                className="w-1.5 h-1"
                style={{
                  background: i % 3 === 0 ? '#00ff00' : i % 5 === 0 ? '#ffaa00' : '#0a0a0a',
                  boxShadow: i % 3 === 0 ? '0 0 3px #00ff00' : i % 5 === 0 ? '0 0 3px #ffaa00' : 'none',
                }}
              />
            ))}
          </div>
          
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full animate-pulse"
            style={{
              background: statusGlow,
              boxShadow: `0 0 8px ${statusGlow}`,
            }}
          />
        </>
      )}

      {isStorage && (
        <>
          <div className="absolute inset-x-2 top-1 bottom-1 flex flex-wrap gap-0.5 content-start">
            {Array.from({ length: uHeight * 6 }).map((_, i) => (
              <div
                key={i}
                className="w-3 h-2 rounded-sm"
                style={{
                  background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div
                  className="absolute right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-0.5 rounded-full"
                  style={{
                    background: i % 4 === 0 ? '#0088ff' : '#00ff00',
                    boxShadow: `0 0 2px ${i % 4 === 0 ? '#0088ff' : '#00ff00'}`,
                  }}
                />
              </div>
            ))}
          </div>
          
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
            style={{
              background: equipment.ledColor || '#0088ff',
              boxShadow: `0 0 8px ${equipment.ledColor || '#0088ff'}`,
            }}
          />
        </>
      )}

      {isNetwork && (
        <>
          <div className="absolute left-2 top-1/2 -translate-y-1/2 flex gap-1">
            {Array.from({ length: Math.min(equipment.portCount, 8) }).map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-sm"
                style={{
                  background: '#0a0a0a',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div
                  className="w-1 h-1 rounded-full mx-auto mt-0.5"
                  style={{
                    background: i < 4 ? '#00ff00' : '#ffaa00',
                    boxShadow: `0 0 2px ${i < 4 ? '#00ff00' : '#ffaa00'}`,
                  }}
                />
              </div>
            ))}
          </div>
          
          <div
            className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full animate-pulse"
            style={{
              background: statusGlow,
              boxShadow: `0 0 6px ${statusGlow}`,
            }}
          />
        </>
      )}

      {!isServer && !isSwitch && !isStorage && !isNetwork && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[8px] font-mono text-white/30 truncate px-1">
            {equipment.model}
          </span>
        </div>
      )}

      <div 
        className="absolute inset-x-0 bottom-0 h-0.5"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%)',
        }}
      />
    </div>
  );
}

export function Equipment3D({ equipment, installed, uHeight, onClick }: Equipment3DProps) {
  return (
    <div
      className="w-full cursor-pointer transition-transform hover:scale-[1.02] hover:brightness-110"
      onClick={onClick}
      data-testid={`equipment-${installed.id}`}
    >
      <EquipmentFace equipment={equipment} uHeight={uHeight} status={installed.status} />
    </div>
  );
}

export function EmptySlot({
  uPosition,
  onClick,
  onDropEquipment,
}: {
  uPosition: number;
  onClick?: () => void;
  onDropEquipment?: (equipmentId: string) => void;
}) {
  return (
    <div
      className="w-full h-[18px] cursor-pointer transition-colors hover:bg-noc-cyan/10 border border-dashed border-white/5 hover:border-noc-cyan/30 rounded-sm flex items-center justify-center"
      onClick={onClick}
      onDragOver={(event) => {
        if (onDropEquipment) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!onDropEquipment) return;
        event.preventDefault();
        const equipmentId = event.dataTransfer.getData("equipment-id");
        if (equipmentId) onDropEquipment(equipmentId);
      }}
      data-testid={`empty-slot-${uPosition}`}
    >
      <span className="text-[8px] font-mono text-white/20">{uPosition}U</span>
    </div>
  );
}
