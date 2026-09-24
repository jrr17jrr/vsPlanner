import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive";

const STATUS_MAP: Record<string, { label: string; variant: Variant }> = {
  pago: { label: "Pago", variant: "success" },
  pendente: { label: "Pendente", variant: "warning" },
  atrasado: { label: "Atrasado", variant: "destructive" },
  ativo: { label: "Ativo", variant: "success" },
  inativo: { label: "Inativo", variant: "secondary" },
  online: { label: "Online", variant: "success" },
  offline: { label: "Offline", variant: "destructive" },
  em_desenvolvimento: { label: "Em desenvolvimento", variant: "warning" },
  em_andamento: { label: "Em andamento", variant: "warning" },
  aguardando_cliente: { label: "Aguardando cliente", variant: "secondary" },
  concluido: { label: "Concluído", variant: "success" },
  concluida: { label: "Concluída", variant: "success" },
  baixa: { label: "Baixa", variant: "secondary" },
  media: { label: "Média", variant: "warning" },
  alta: { label: "Alta", variant: "destructive" },
  em_dia: { label: "Em dia", variant: "success" },
  agendada: { label: "Agendada", variant: "secondary" },
  realizada: { label: "Realizada", variant: "success" },
  cancelada: { label: "Cancelada", variant: "destructive" },
  cancelado: { label: "Cancelado", variant: "destructive" },
  recebido: { label: "Recebido", variant: "success" },
  parcial: { label: "Parcial", variant: "warning" },
  pausado: { label: "Pausado", variant: "secondary" },
  encerrado: { label: "Encerrado", variant: "outline" },
  desenvolvimento: { label: "Em desenvolvimento", variant: "warning" },
  vencendo: { label: "Vencendo", variant: "warning" },
  expirado: { label: "Expirado", variant: "destructive" },
  transferido: { label: "Transferido", variant: "outline" },
  vence_hoje: { label: "Vence hoje", variant: "warning" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const meta = STATUS_MAP[status] ?? { label: status, variant: "outline" as Variant };
  return (
    <Badge variant={meta.variant} className={cn(className)}>
      {meta.label}
    </Badge>
  );
}
