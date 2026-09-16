"use client";

import { useState } from "react";
import { Plus, HandCoins, Pencil, Trash2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { VendorFormDialog } from "@/components/forms/vendor-form-dialog";
import { SaleFormDialog } from "@/components/forms/sale-form-dialog";
import { ResponsiveTable } from "@/components/shared/responsive-table";
import { vendorStats, sum } from "@/lib/selectors";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Vendor } from "@/types/entities";

export default function VendedoresPage() {
  const { mySpaces } = useAuth();
  const vendors = useDbStore((s) => s.vendors);
  const sales = useDbStore((s) => s.sales);
  const commissions = useDbStore((s) => s.commissions);
  const clients = useDbStore((s) => s.clients);
  const services = useDbStore((s) => s.services);
  const remove = useDbStore((s) => s.remove);
  const update = useDbStore((s) => s.update);

  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | undefined>();
  const [deletingVendor, setDeletingVendor] = useState<Vendor | undefined>();
  const [saleFormOpen, setSaleFormOpen] = useState(false);

  const visionarioSpace = mySpaces.find((s) => s.slug === "visionario-dev");
  if (!visionarioSpace) return null;

  const myVendors = vendors.filter((v) => v.spaceId === visionarioSpace.id);
  const mySales = sales
    .filter((s) => s.spaceId === visionarioSpace.id)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const totalPendente = sum(
    commissions.filter((c) => c.spaceId === visionarioSpace.id && c.status === "pendente").map((c) => c.amount)
  );
  const totalPago = sum(
    commissions.filter((c) => c.spaceId === visionarioSpace.id && c.status === "pago").map((c) => c.amount)
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vendedores"
        description="Equipe comercial, vendas e comissões."
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setSaleFormOpen(true)}>
              <Plus className="h-4 w-4" /> Registrar venda
            </Button>
            <Button size="sm" onClick={() => { setEditingVendor(undefined); setVendorFormOpen(true); }}>
              <Plus className="h-4 w-4" /> Novo vendedor
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Comissões pendentes</p>
          <p className="mt-1 text-lg font-semibold text-warning">{formatCurrency(totalPendente)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Comissões pagas</p>
          <p className="mt-1 text-lg font-semibold text-success">{formatCurrency(totalPago)}</p>
        </Card>
      </div>

      {myVendors.length === 0 ? (
        <EmptyState icon={HandCoins} title="Nenhum vendedor cadastrado" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myVendors.map((vendor) => {
            const stats = vendorStats({ sales, commissions }, vendor.id);
            return (
              <Card key={vendor.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{vendor.name}</p>
                  <StatusBadge status={vendor.status} />
                </div>
                <p className="text-xs text-muted-foreground">Comissão padrão {vendor.defaultCommissionPct}%</p>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Vendas no mês</p>
                    <p className="font-medium text-foreground">{stats.vendasNoMes}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Valor vendido (mês)</p>
                    <p className="font-medium text-foreground">{formatCurrency(stats.valorVendidoMes)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Comissão paga</p>
                    <p className="font-medium text-success">{formatCurrency(stats.comissaoPagaTotal)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Comissão pendente</p>
                    <p className="font-medium text-warning">{formatCurrency(stats.comissaoPendenteTotal)}</p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  {vendor.whatsapp && (
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={`https://wa.me/${vendor.whatsapp}`} target="_blank" rel="noreferrer">
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingVendor(vendor); setVendorFormOpen(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeletingVendor(vendor)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Vendas e comissões</h2>
        {mySales.length === 0 ? (
          <EmptyState title="Nenhuma venda registrada" />
        ) : (
          <ResponsiveTable
            data={mySales}
            columns={[
              { key: "date", header: "Data", render: (s) => formatDate(s.date) },
              { key: "vendor", header: "Vendedor", render: (s) => myVendors.find((v) => v.id === s.vendorId)?.name ?? "—" },
              { key: "client", header: "Cliente", render: (s) => clients.find((c) => c.id === s.clientId)?.name ?? "—" },
              { key: "amount", header: "Valor", render: (s) => formatCurrency(s.amount) },
              {
                key: "commission",
                header: "Comissão",
                render: (s) => {
                  const c = commissions.find((x) => x.saleId === s.id);
                  return c ? `${formatCurrency(c.amount)} (${s.commissionPct}%)` : "—";
                },
              },
              {
                key: "status",
                header: "Status",
                render: (s) => {
                  const c = commissions.find((x) => x.saleId === s.id);
                  return c ? <StatusBadge status={c.status} /> : null;
                },
              },
              {
                key: "actions",
                header: "",
                className: "text-right",
                render: (s) => {
                  const c = commissions.find((x) => x.saleId === s.id);
                  if (!c || c.status === "pago") return null;
                  return (
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          update("commissions", c.id, {
                            status: "pago",
                            paidDate: new Date().toISOString().slice(0, 10),
                          });
                          toast.success("Comissão marcada como paga.");
                        }}
                      >
                        Marcar paga
                      </Button>
                    </div>
                  );
                },
              },
            ]}
            renderMobileCard={(s) => {
              const c = commissions.find((x) => x.saleId === s.id);
              const vendor = myVendors.find((v) => v.id === s.vendorId);
              return (
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{vendor?.name}</p>
                    {c && <StatusBadge status={c.status} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(s.date)} · {clients.find((cl) => cl.id === s.clientId)?.name ?? "—"}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span>{formatCurrency(s.amount)}</span>
                    {c && <span className="text-primary">{formatCurrency(c.amount)}</span>}
                  </div>
                </Card>
              );
            }}
          />
        )}
      </section>

      <VendorFormDialog open={vendorFormOpen} onOpenChange={setVendorFormOpen} vendor={editingVendor} spaceId={visionarioSpace.id} />
      <SaleFormDialog
        open={saleFormOpen}
        onOpenChange={setSaleFormOpen}
        spaceId={visionarioSpace.id}
        vendors={myVendors.filter((v) => v.status === "ativo")}
        clients={clients.filter((c) => c.spaceId === visionarioSpace.id).map((c) => ({ id: c.id, name: c.name }))}
        services={services.filter((s) => s.spaceId === visionarioSpace.id).map((s) => ({ id: s.id, name: s.name }))}
      />
      <ConfirmDialog
        open={!!deletingVendor}
        onOpenChange={(open) => !open && setDeletingVendor(undefined)}
        title="Excluir vendedor?"
        onConfirm={() => deletingVendor && remove("vendors", deletingVendor.id)}
      />
    </div>
  );
}
