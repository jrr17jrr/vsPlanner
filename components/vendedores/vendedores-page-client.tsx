"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, HandCoins, Pencil, Trash2, MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmActionButton } from "@/components/shared/confirm-action-button";
import { ResponsiveTable } from "@/components/shared/responsive-table";
import { VendorFormDialog } from "@/components/vendedores/vendor-form-dialog";
import { SaleFormDialog } from "@/components/vendedores/sale-form-dialog";
import { deleteVendorAction, markCommissionPaidAction } from "@/lib/supabase/vendors-actions";
import { formatCurrency, formatDate, toDateKey, currentMonthKeySaoPaulo } from "@/lib/format";
import type { Client, Commission, Sale, Service, Vendor } from "@/types/database.types";

export function VendedoresPageClient({
  vendors,
  sales,
  commissions,
  clients,
  services,
  permissions,
}: {
  vendors: Vendor[];
  sales: Sale[];
  commissions: Commission[];
  clients: Client[];
  services: Service[];
  permissions: { canCreate: boolean; canEdit: boolean; canDelete: boolean };
}) {
  const [vendorFormOpen, setVendorFormOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<Vendor | undefined>();
  const [saleFormOpen, setSaleFormOpen] = useState(false);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const commissionBySale = useMemo(() => new Map(commissions.map((c) => [c.sale_id, c])), [commissions]);

  const totalPendente = commissions.filter((c) => c.status === "pendente").reduce((s, c) => s + c.amount, 0);
  const totalPago = commissions.filter((c) => c.status === "paga").reduce((s, c) => s + c.amount, 0);

  const currentMonth = currentMonthKeySaoPaulo();

  function vendorStats(vendorId: string) {
    const vendorSales = sales.filter((s) => s.vendor_id === vendorId && s.status !== "cancelada");
    const salesThisMonth = vendorSales.filter((s) => s.sale_date.slice(0, 7) === currentMonth);
    const vendorCommissions = commissions.filter((c) => c.vendor_id === vendorId);
    return {
      salesCount: salesThisMonth.length,
      salesAmount: salesThisMonth.reduce((s, sale) => s + sale.amount, 0),
      commissionPaid: vendorCommissions.filter((c) => c.status === "paga").reduce((s, c) => s + c.amount, 0),
      commissionPending: vendorCommissions.filter((c) => c.status === "pendente").reduce((s, c) => s + c.amount, 0),
    };
  }

  const sortedSales = [...sales].sort((a, b) => b.sale_date.localeCompare(a.sale_date));

  async function markPaid(commissionId: string) {
    const result = await markCommissionPaidAction(commissionId, toDateKey(new Date()));
    if (result.error) toast.error(result.error);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Vendedores"
        description="Equipe comercial, vendas e comissões."
        actions={
          permissions.canCreate ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setSaleFormOpen(true)}>
                <Plus className="h-4 w-4" /> Registrar venda
              </Button>
              <Button size="sm" onClick={() => { setEditingVendor(undefined); setVendorFormOpen(true); }}>
                <Plus className="h-4 w-4" /> Novo vendedor
              </Button>
            </div>
          ) : undefined
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

      {vendors.length === 0 ? (
        <EmptyState icon={HandCoins} title="Nenhum vendedor cadastrado" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vendors.map((vendor) => {
            const stats = vendorStats(vendor.id);
            return (
              <Card key={vendor.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{vendor.name}</p>
                  <StatusBadge status={vendor.status} />
                </div>
                {vendor.contact_name && <p className="text-xs text-muted-foreground">{vendor.contact_name}</p>}

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Vendas no mês</p>
                    <p className="font-medium text-foreground">{stats.salesCount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Valor vendido (mês)</p>
                    <p className="font-medium text-foreground">{formatCurrency(stats.salesAmount)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Comissão paga</p>
                    <p className="font-medium text-success">{formatCurrency(stats.commissionPaid)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Comissão pendente</p>
                    <p className="font-medium text-warning">{formatCurrency(stats.commissionPending)}</p>
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
                  {permissions.canEdit && (
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingVendor(vendor); setVendorFormOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {permissions.canDelete && (
                    <ConfirmActionButton
                      label={<Trash2 className="h-3.5 w-3.5" />}
                      title="Excluir vendedor?"
                      description="Só funciona se não houver vendas registradas — caso contrário, desative."
                      confirmLabel="Excluir"
                      variant="ghost"
                      size="icon"
                      onConfirm={() => deleteVendorAction(vendor.id)}
                    />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Vendas e comissões</h2>
        {sortedSales.length === 0 ? (
          <EmptyState title="Nenhuma venda registrada" />
        ) : (
          <ResponsiveTable
            data={sortedSales}
            columns={[
              { key: "date", header: "Data", render: (s) => formatDate(s.sale_date) },
              { key: "vendor", header: "Vendedor", render: (s) => vendorById.get(s.vendor_id)?.name ?? "—" },
              { key: "client", header: "Cliente", render: (s) => (s.client_id ? clientById.get(s.client_id)?.name ?? "—" : "—") },
              { key: "amount", header: "Valor", render: (s) => formatCurrency(s.amount) },
              {
                key: "commission",
                header: "Comissão",
                render: (s) => {
                  const c = commissionBySale.get(s.id);
                  return c ? `${formatCurrency(c.amount)}${c.percentage ? ` (${c.percentage}%)` : ""}` : "—";
                },
              },
              {
                key: "status",
                header: "Status",
                render: (s) => {
                  const c = commissionBySale.get(s.id);
                  return c ? <StatusBadge status={c.status === "paga" ? "pago" : "pendente"} /> : null;
                },
              },
              {
                key: "actions",
                header: "",
                className: "text-right",
                render: (s) => {
                  const c = commissionBySale.get(s.id);
                  if (!c || c.status === "paga" || !permissions.canEdit) return null;
                  return (
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => markPaid(c.id)}>Marcar paga</Button>
                    </div>
                  );
                },
              },
            ]}
            renderMobileCard={(s) => {
              const c = commissionBySale.get(s.id);
              const vendor = vendorById.get(s.vendor_id);
              return (
                <Card className="p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">{vendor?.name}</p>
                    {c && <StatusBadge status={c.status === "paga" ? "pago" : "pendente"} />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(s.sale_date)} · {s.client_id ? clientById.get(s.client_id)?.name ?? "—" : "—"}
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

      {(permissions.canCreate || permissions.canEdit) && (
        <VendorFormDialog open={vendorFormOpen} onOpenChange={setVendorFormOpen} vendor={editingVendor} />
      )}
      {permissions.canCreate && (
        <SaleFormDialog
          open={saleFormOpen}
          onOpenChange={setSaleFormOpen}
          vendors={vendors.filter((v) => v.status === "ativo")}
          clients={clients}
          services={services}
        />
      )}
    </div>
  );
}
