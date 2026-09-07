import { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4 bg-card/60 border border-border">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
    </Card>
  );
}

export function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-4 bg-card/60 border border-border">
      <div className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">
        {title}
      </div>
      {children}
    </Card>
  );
}
