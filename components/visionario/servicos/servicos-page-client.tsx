"use client";

import { useState } from "react";
import { Plus, Layers, Pencil } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { ServiceFormDialog } from "@/components/visionario/servicos/service-form-dialog";
import { deleteServiceAction } from "@/lib/supabase/services-actions";
import { formatCurrency } from "@/lib/format";
import type { ClientService, Service } from "@/types/database.types";

const BILLING_LABEL: Record<string, string> = {
  unico: "Cobrança única",
  mensal: "Mensal",
};

export function ServicosPageClient({
  services,
  clientServices,
  permissions,
}: {
  services: Service[];
  clientServices: ClientService[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Service | undefined>();

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Serviços"
        description="Catálogo de serviços oferecidos pela Visionário Dev."
        actions={
          permissions.canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo serviço
            </Button>
          ) : undefined
        }
      />

      {services.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Nenhum serviço cadastrado"
          description={permissions.canCreate ? "Cadastre o primeiro serviço do catálogo." : undefined}
          action={
            permissions.canCreate ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="h-4 w-4" /> Novo serviço
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc) => {
            const clientsUsing = clientServices.filter((cs) => cs.service_id === svc.id).length;
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
                  <span className="font-medium text-foreground">{formatCurrency(svc.default_price)}</span>
                  <span className="text-xs text-muted-foreground">{BILLING_LABEL[svc.billing_type]}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{clientsUsing} cliente(s) usando</p>
                {(permissions.canEdit || permissions.canDelete) && (
                  <div className="mt-3 flex gap-2">
                    {permissions.canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setEditing(svc);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Button>
                    )}
                    {permissions.canDelete && (
                      <ConfirmActionButton
                        label="Excluir"
                        title="Excluir este serviço?"
                        description="Contratações já existentes de clientes não são removidas — se algum cliente ainda tiver este serviço contratado, a exclusão será recusada (desative em vez disso)."
                        confirmLabel="Excluir"
                        onConfirm={() => deleteServiceAction(svc.id)}
                      />
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {(permissions.canCreate || permissions.canEdit) && (
        <ServiceFormDialog open={formOpen} onOpenChange={setFormOpen} service={editing} />
      )}
    </div>
  );
}
