"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClientSiteAction, updateClientSiteAction, type ClientSiteFormInput } from "@/lib/supabase/sites-actions";
import type { Client, ClientSite, ClientSiteStatus } from "@/types/database.types";

const STATUS_LABEL: Record<ClientSiteStatus, string> = {
  ativo: "Ativo",
  desenvolvimento: "Em desenvolvimento",
  aguardando_cliente: "Aguardando cliente",
  vencendo: "Vencendo",
  expirado: "Expirado",
  cancelado: "Cancelado",
};

export function ClientSiteFormDialog({
  open,
  onOpenChange,
  site,
  clients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site?: ClientSite;
  clients: Client[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && <ClientSiteForm key={site?.id ?? "new"} onOpenChange={onOpenChange} site={site} clients={clients} />}
    </Dialog>
  );
}

function ClientSiteForm({
  onOpenChange,
  site,
  clients,
}: {
  onOpenChange: (open: boolean) => void;
  site?: ClientSite;
  clients: Client[];
}) {
  const [clientId, setClientId] = useState(site?.client_id ?? "");
  const [projectName, setProjectName] = useState(site?.project_name ?? "");
  const [url, setUrl] = useState(site?.url ?? "");
  const [domain, setDomain] = useState(site?.domain ?? "");
  const [registrar, setRegistrar] = useState(site?.registrar ?? "");
  const [hostingProvider, setHostingProvider] = useState(site?.hosting_provider ?? "");
  const [plan, setPlan] = useState(site?.plan ?? "");
  const [contractedAt, setContractedAt] = useState(site?.contracted_at ?? "");
  const [dueDate, setDueDate] = useState(site?.due_date ?? "");
  const [price, setPrice] = useState(site?.price ? String(site.price) : "");
  const [status, setStatus] = useState<ClientSiteStatus>(site?.status ?? "ativo");
  const [notes, setNotes] = useState(site?.notes ?? "");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return toast.error("Dê um nome ao projeto.");

    const input: ClientSiteFormInput = {
      clientId: clientId || undefined,
      projectName,
      url: url || undefined,
      domain: domain || undefined,
      registrar: registrar || undefined,
      hostingProvider: hostingProvider || undefined,
      plan: plan || undefined,
      contractedAt: contractedAt || undefined,
      dueDate: dueDate || undefined,
      price: price ? parseFloat(price.replace(",", ".")) : undefined,
      status,
      notes: notes || undefined,
    };

    setPending(true);
    const result = site ? await updateClientSiteAction(site.id, input) : await createClientSiteAction(input);
    setPending(false);

    if (result.error) return toast.error(result.error);
    toast.success(result.success ?? "Site salvo.");
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{site ? "Editar site" : "Novo site"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>Nome do projeto *</Label>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} disabled={pending} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cliente</Label>
            <Select value={clientId || "nenhum"} onValueChange={(v) => setClientId(v === "nenhum" ? "" : v)} disabled={pending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Sem cliente</SelectItem>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} disabled={pending} placeholder="https://…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Domínio</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} disabled={pending} placeholder="exemplo.com.br" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Registrador</Label>
            <Input value={registrar} onChange={(e) => setRegistrar(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Hospedagem</Label>
            <Input value={hostingProvider} onChange={(e) => setHostingProvider(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Plano</Label>
            <Input value={plan} onChange={(e) => setPlan(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label>Contratado em</Label>
            <Input type="date" value={contractedAt} onChange={(e) => setContractedAt(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Vencimento</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={pending} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Valor</Label>
            <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={pending} placeholder="Opcional" />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as ClientSiteStatus)} disabled={pending}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(STATUS_LABEL) as ClientSiteStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Observações</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancelar</Button>
          <Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
