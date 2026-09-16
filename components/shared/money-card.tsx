import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";

export function MoneyCard({
  label,
  amount,
  icon: Icon,
  tone = "default",
  hint,
  className,
}: {
  label: string;
  amount: number;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "destructive";
  hint?: string;
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
        {formatCurrency(amount)}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
