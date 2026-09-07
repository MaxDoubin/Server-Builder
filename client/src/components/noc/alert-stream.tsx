import { useGame } from "@/lib/game-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertCircle, AlertTriangle, Info, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const severityConfig = {
  critical: {
    icon: AlertCircle,
    variant: "destructive" as const,
    color: "text-noc-red",
  },
  warning: {
    icon: AlertTriangle,
    variant: "secondary" as const,
    color: "text-noc-yellow",
  },
  info: {
    icon: Info,
    variant: "outline" as const,
    color: "text-noc-blue",
  },
};

export function AlertStream() {
  const { alerts, acknowledgeAlert } = useGame();
  
  if (!alerts || alerts.length === 0) {
    return (
      <Card className="flex flex-col h-full bg-card/50 backdrop-blur-sm" data-testid="alert-stream-empty">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
            Alert Stream
          </h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No active alerts
        </div>
      </Card>
    );
  }

  const sortedAlerts = [...alerts].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <Card className="flex flex-col h-full bg-card/50 backdrop-blur-sm" data-testid="alert-stream">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider">
          Alert Stream
        </h3>
        <Badge variant="secondary" className="font-mono">
          {alerts.filter((a) => !a.acknowledged).length} ACTIVE
        </Badge>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {sortedAlerts.map((alert) => {
            const config = severityConfig[alert.severity];
            const Icon = config.icon;

            return (
              <div
                key={alert.id}
                className={`p-3 rounded-md border ${
                  alert.acknowledged
                    ? "opacity-60 bg-muted/30"
                    : "bg-card"
                }`}
                data-testid={`alert-item-${alert.id}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${config.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={config.variant}>
                        {alert.severity.toUpperCase()}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground">
                        {alert.source}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm mt-1 break-words">{alert.message}</p>
                  </div>
                  {!alert.acknowledged && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => acknowledgeAlert(alert.id)}
                      data-testid={`button-ack-${alert.id}`}
                      aria-label={`Acknowledge the ${alert.severity} alert from ${alert.source}`}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
