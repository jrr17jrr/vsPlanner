"use client";

import Link from "next/link";
import { MessageCircle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatCurrency } from "@/lib/format";
import type { Client } from "@/types/entities";

export function ClientCard({
  client,
  monthlyValue,
  serviceNames,
  paymentStatus,
}: {
  client: Client;
  monthlyValue: number;
  serviceNames: string[];
  paymentStatus: "pago" | "pendente" | "atrasado" | null;
}) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{client.name}</p>
          {client.company && (
            <p className="truncate text-xs text-muted-foreground">{client.company}</p>
          )}
        </div>
        <StatusBadge status={client.status} />
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {serviceNames.length > 0 ? serviceNames.join(" + ") : "Sem serviços cadastrados"}
      </p>

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">
          {formatCurrency(monthlyValue)}
          {monthlyValue > 0 && <span className="text-xs text-muted-foreground">/mês</span>}
        </span>
        {paymentStatus && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Pagamento: <StatusBadge status={paymentStatus} />
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2">
        {client.whatsapp && (
          <Button variant="outline" size="sm" className="flex-1" asChild>
            <a
              href={`https://wa.me/${client.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
            </a>
          </Button>
        )}
        <Button variant="secondary" size="sm" className="flex-1" asChild>
          <Link href={`/visionario/clientes/${client.id}`}>
            Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}
