import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { WhatsAppButton } from "@/components/visionario/reunioes/whatsapp-button";
import { formatCurrency } from "@/lib/format";
import type { Client } from "@/types/database.types";

export function RealClientCard({
  client,
  monthlyValue,
  serviceNames,
}: {
  client: Client;
  monthlyValue: number;
  serviceNames: string[];
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/visionario/clientes/${client.id}`} className="hover:underline">
            <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
          </Link>
          {client.company && <p className="truncate text-xs text-muted-foreground">{client.company}</p>}
        </div>
        <StatusBadge status={client.status} className="shrink-0" />
      </div>

      {serviceNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {serviceNames.map((name) => (
            <span key={name} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
              {name}
            </span>
          ))}
        </div>
      )}

      {monthlyValue > 0 && (
        <p className="text-sm font-medium text-foreground">{formatCurrency(monthlyValue)}/mês</p>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <WhatsAppButton phone={client.whatsapp || client.phone} />
        <Link
          href={`/visionario/clientes/${client.id}`}
          className="ml-auto text-xs text-primary hover:underline"
        >
          Abrir
        </Link>
      </div>
    </Card>
  );
}
