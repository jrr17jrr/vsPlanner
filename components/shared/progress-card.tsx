import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ProgressCard({
  title,
  current,
  target,
  subtitle,
  actions,
  className,
}: {
  title: string;
  current: number;
  target: number;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <Card className={cn("p-4", className)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">{title}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="mt-3 flex items-baseline justify-between text-xs text-muted-foreground">
        <span className="text-foreground font-medium tabular-nums">
          {formatCurrency(current)}
        </span>
        <span className="tabular-nums">{formatCurrency(target)}</span>
      </div>
      <Progress value={pct} className="mt-1.5" />
      <p className="mt-1.5 text-right text-xs font-medium text-primary">{pct}%</p>
    </Card>
  );
}
