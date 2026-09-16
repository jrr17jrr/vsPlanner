"use client";

import { useState } from "react";
import { Plus, Layers, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { ServiceFormDialog } from "@/components/forms/service-form-dialog";
import { formatCurrency } from "@/lib/format";
import type { Service } from "@/types/entities";

const BILLING_LABEL: Record<string, string> = {
  unico: "Cobrança única",
  mensal: "Mensal",
  anual: "Anual",
};

export default function ServicosPage() {
  const { mySpaces } = useAuth();
  const services = useDbStore((s) => s.services);
  const clientServices = useDbStore((s) => s.clientServices);
  const remove = useDbStore((s) => s.remove);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | undefined>();
  const [deleting, setDeleting] = useState<Service | undefined>();

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");
  if (!visionarioSpace) return null;

  const mine = services.filter((s) => s.spaceId === visionarioSpace.id);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Serviços"
        description="Catálogo de serviços oferecidos pela Visionário Dev."
        actions={
          <Button size="sm" onClick={() => { setEditing(undefined); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Novo serviço
          </Button>
        }
      />

      {mine.length === 0 ? (
        <EmptyState icon={Layers} title="Nenhum serviço cadastrado" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((svc) => {
            const clientsUsing = clientServices.filter((cs) => cs.serviceId === svc.id).length;
            return (
              <Card key={svc.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                  <StatusBadge status={svc.status} />
                </div>
                {svc.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{svc.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-medium text-foreground">{formatCurrency(svc.defaultPrice)}</span>
                  <span className="text-xs text-muted-foreground">{BILLING_LABEL[svc.billingType]}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{clientsUsing} cliente(s) usando</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditing(svc); setFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleting(svc)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ServiceFormDialog open={formOpen} onOpenChange={setFormOpen} service={editing} spaceId={visionarioSpace.id} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title="Excluir serviço?"
        description="Contratações já existentes de clientes não serão removidas."
        onConfirm={() => deleting && remove("services", deleting.id)}
      />
    </div>
  );
}
