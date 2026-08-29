import { useGame } from "@/lib/game-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const nodeColors = {
  spine: "bg-noc-purple",
  leaf: "bg-noc-blue",
  tor: "bg-noc-cyan",
  server: "bg-muted",
  storage: "bg-noc-yellow",
  firewall: "bg-noc-red",
  loadbalancer: "bg-noc-green",
};

const statusColors = {
  online: "border-noc-green",
  warning: "border-noc-yellow",
  critical: "border-noc-red",
  offline: "border-muted-foreground",
};

export function TopologyView() {
  const { networkNodes, networkLinks } = useGame();

  if (!networkNodes || networkNodes.length === 0) {
    return (
      <Card className="flex items-center justify-center h-full bg-card/50 backdrop-blur-sm" data-testid="network-topology-empty">
        <p className="text-muted-foreground">No network devices configured</p>
      </Card>
    );
  }

  const getNodePosition = (node: typeof networkNodes[0]) => ({
    left: node.positionX,
    top: node.positionY,
  });

  const getNodeById = (id: string) => networkNodes.find((n) => n.id === id);

  return (
    <Card className="relative h-full bg-card/50 backdrop-blur-sm overflow-hidden" data-testid="network-topology">
      <div className="absolute inset-0 p-4">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider mb-4">
          Network Topology
        </h3>
        
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ top: 40 }}>
          {networkLinks.map((link) => {
            const source = getNodeById(link.sourceId);
            const target = getNodeById(link.targetId);
            if (!source || !target) return null;

            const linkColor =
              link.status === "active"
                ? "stroke-noc-green/50"
                : link.status === "degraded"
                ? "stroke-noc-yellow/50"
                : "stroke-noc-red/50";

            const strokeWidth = Math.max(1, (link.utilization / 100) * 4);

            return (
              <line
                key={link.id}
                x1={source.positionX + 40}
                y1={source.positionY + 20}
                x2={target.positionX + 40}
                y2={target.positionY + 20}
                className={linkColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        <div className="relative" style={{ height: 400 }}>
          {networkNodes.map((node) => {
            const pos = getNodePosition(node);
            return (
              <Tooltip key={node.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`absolute flex flex-col items-center justify-center w-20 h-10 rounded-md border-2 ${
                      nodeColors[node.type]
                    } ${statusColors[node.status]} cursor-pointer hover-elevate transition-all`}
                    style={{ left: pos.left, top: pos.top }}
                    data-testid={`network-node-${node.id}`}
                  >
                    <span className="text-[10px] font-mono font-semibold text-white truncate px-1">
                      {node.name}
                    </span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{node.name}</span>
                      <Badge
                        variant={
                          node.status === "online"
                            ? "secondary"
                            : node.status === "warning"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {node.status.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Type:</span>
                        <span className="font-mono capitalize">{node.type}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Ports:</span>
                        <span className="font-mono">
                          {node.usedPorts}/{node.ports}
                        </span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Throughput:</span>
                        <span className="font-mono">{node.throughput} Gbps</span>
                      </div>
                      {node.packetLoss > 0 && (
                        <div className="flex justify-between gap-4 text-noc-red">
                          <span>Packet Loss:</span>
                          <span className="font-mono">{node.packetLoss}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        <div className="absolute bottom-4 left-4 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${nodeColors.spine}`} />
            <span className="text-muted-foreground">Spine</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${nodeColors.leaf}`} />
            <span className="text-muted-foreground">Leaf</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${nodeColors.tor}`} />
            <span className="text-muted-foreground">ToR</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${nodeColors.firewall}`} />
            <span className="text-muted-foreground">Firewall</span>
          </div>
          <div className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${nodeColors.loadbalancer}`} />
            <span className="text-muted-foreground">LB</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
