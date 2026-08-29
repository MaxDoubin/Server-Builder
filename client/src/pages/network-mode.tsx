import { useGame } from "@/lib/game-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopologyView } from "@/components/network/topology-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Network, ArrowUpDown, AlertTriangle } from "lucide-react";

export function NetworkMode() {
  const { networkNodes, networkLinks } = useGame();

  const degradedLinks = networkLinks.filter((l) => l.status !== "active");
  const totalThroughput = networkNodes
    .filter((n) => n.type === "spine")
    .reduce((sum, n) => sum + n.throughput, 0);

  return (
    <div className="h-full overflow-hidden p-4" data-testid="page-network-mode">
      <div className="grid grid-cols-12 gap-4 h-full">
        <div className="col-span-12 lg:col-span-8 h-full">
          <TopologyView />
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-4 overflow-auto">
          <Card className="p-4 bg-card/50 backdrop-blur-sm" data-testid="network-summary">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wider mb-4">
              Network Summary
            </h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Devices</span>
                <span className="font-mono">{networkNodes.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active Links</span>
                <span className="font-mono text-noc-green">
                  {networkLinks.filter((l) => l.status === "active").length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Degraded Links</span>
                <span className="font-mono text-noc-yellow">{degradedLinks.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Spine Throughput</span>
                <span className="font-mono">{totalThroughput} Gbps</span>
              </div>
            </div>
          </Card>

          <Card className="flex-1 bg-card/50 backdrop-blur-sm" data-testid="network-devices">
            <div className="p-4 border-b border-border">
              <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
                Network Devices
              </h3>
            </div>
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-2">
                {networkNodes.map((node) => (
                  <div
                    key={node.id}
                    className="p-3 rounded-md border border-border bg-background/50"
                    data-testid={`device-${node.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Network className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{node.name}</span>
                      </div>
                      <Badge
                        variant={
                          node.status === "online"
                            ? "secondary"
                            : node.status === "warning"
                            ? "secondary"
                            : "destructive"
                        }
                      >
                        {node.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span className="capitalize">{node.type}</span>
                      <span className="font-mono">
                        {node.usedPorts}/{node.ports} ports
                      </span>
                    </div>
                    {node.packetLoss > 0 && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-noc-red">
                        <AlertTriangle className="w-3 h-3" />
                        <span>{node.packetLoss}% packet loss</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
}
