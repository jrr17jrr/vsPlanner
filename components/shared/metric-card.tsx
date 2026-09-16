import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function MetricCard({
  label,
  value,
  icon: Icon,
  trend,
  trendLabel,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  trend?: number;
  trendLabel?: string;
  tone?: "default" | "success" | "warning" | "destructive";
  className?: string;
}) {
  const toneClasses: Record<string, string> = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
        )}
      </div>
      <p className={cn("mt-2 text-xl font-semibold tabular-nums", toneClasses[tone])}>
        {value}
      </p>
      {trend !== undefined && (
        <p
          className={cn(
            "mt-1 text-xs",
            trend >= 0 ? "text-success" : "text-destructive"
          )}
        >
          {trend >= 0 ? "+" : ""}
          {trend}% {trendLabel}
        </p>
      )}
    </Card>
  );
}
