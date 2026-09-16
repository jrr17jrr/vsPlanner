"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDbStore } from "@/store/db-store";
import { generateId } from "@/lib/ids";
import type { ClientSite, HostingProvider } from "@/types/entities";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  site?: ClientSite;
}

export function ClientSiteFormDialog({ open, onOpenChange, clientId, site }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <ClientSiteForm key={site?.id ?? "new"} onOpenChange={onOpenChange} clientId={clientId} site={site} />
      )}
    </Dialog>
  );
}

function ClientSiteForm({ onOpenChange, clientId, site }: Omit<Props, "open">) {
  const add = useDbStore((s) => s.add);
  const update = useDbStore((s) => s.update);

  const [siteName, setSiteName] = useState(site?.siteName ?? "");
  const [url, setUrl] = useState(site?.url ?? "");
  const [domain, setDomain] = useState(site?.domain ?? "");
  const [status, setStatus] = useState<ClientSite["status"]>(site?.status ?? "em_desenvolvimento");
  const [hostingProvider, setHostingProvider] = useState<HostingProvider>(site?.hostingProvider ?? "Vercel");
  const [hostingProviderOther, setHostingProviderOther] = useState(site?.hostingProviderOther ?? "");
  const [hostingPlan, setHostingPlan] = useState(site?.hostingPlan ?? "");
  const [hostingPrice, setHostingPrice] = useState(site?.hostingPrice ? String(site.hostingPrice) : "");
  const [hostingBilling, setHostingBilling] = useState<"mensal" | "anual" | "gratis">(site?.hostingBilling ?? "gratis");
  const [hostingNextRenewal, setHostingNextRenewal] = useState(site?.hostingNextRenewal ?? "");
  const [domainRegistrar, setDomainRegistrar] = useState(site?.domainRegistrar ?? "Registro.br");
  const [domainRenewalDate, setDomainRenewalDate] = useState(site?.domainRenewalDate ?? "");
  const [domainRenewalPrice, setDomainRenewalPrice] = useState(site?.domainRenewalPrice ? String(site.domainRenewalPrice) : "");
  const [githubRepo, setGithubRepo] = useState(site?.githubRepo ?? "");
  const [projectUrl, setProjectUrl] = useState(site?.projectUrl ?? "");
  const [technicalNotes, setTechnicalNotes] = useState(site?.technicalNotes ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      siteName: siteName || undefined,
      url: url || undefined,
      domain: domain || undefined,
      status,
      hostingProvider,
      hostingProviderOther: hostingProvider === "Outra" ? hostingProviderOther || undefined : undefined,
      hostingPlan: hostingPlan || undefined,
      hostingPrice: hostingPrice ? Number(hostingPrice.replace(",", ".")) : undefined,
      hostingBilling,
      hostingNextRenewal: hostingNextRenewal || undefined,
      domainRegistrar: domainRegistrar || undefined,
      domainRenewalDate: domainRenewalDate || undefined,
      domainRenewalPrice: domainRenewalPrice ? Number(domainRenewalPrice.replace(",", ".")) : undefined,
      githubRepo: githubRepo || undefined,
      projectUrl: projectUrl || undefined,
      technicalNotes: technicalNotes || undefined,
    };
    if (site) {
      update("clientSites", site.id, payload);
      toast.success("Site atualizado.");
    } else {
      add("clientSites", { id: generateId("site"), clientId, ...payload });
      toast.success("Site cadastrado.");
    }
    onOpenChange(false);
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{site ? "Editar site" : "Cadastrar site"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-name">Nome do site</Label>
            <Input id="site-name" value={siteName} onChange={(e) => setSiteName(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as ClientSite["status"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
                <SelectItem value="em_desenvolvimento">Em desenvolvimento</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-url">URL</Label>
            <Input id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-domain">Domínio</Label>
            <Input id="site-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="exemplo.com.br" />
          </div>
        </div>

        <p className="text-xs font-medium text-muted-foreground">Hospedagem</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Provedor</Label>
            <Select value={hostingProvider} onValueChange={(v) => setHostingProvider(v as HostingProvider)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Vercel">Vercel</SelectItem>
                <SelectItem value="Hostinger">Hostinger</SelectItem>
                <SelectItem value="Outra">Outra</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-hplan">Plano</Label>
            <Input id="site-hplan" value={hostingPlan} onChange={(e) => setHostingPlan(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Cobrança</Label>
            <Select value={hostingBilling} onValueChange={(v) => setHostingBilling(v as typeof hostingBilling)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gratis">Grátis</SelectItem>
                <SelectItem value="mensal">Mensal</SelectItem>
                <SelectItem value="anual">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {hostingProvider === "Outra" && (
          <Input
            value={hostingProviderOther}
            onChange={(e) => setHostingProviderOther(e.target.value)}
            placeholder="Nome do provedor"
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-hprice">Valor hospedagem (R$)</Label>
            <Input id="site-hprice" inputMode="decimal" value={hostingPrice} onChange={(e) => setHostingPrice(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-hrenew">Próxima renovação</Label>
            <Input id="site-hrenew" type="date" value={hostingNextRenewal} onChange={(e) => setHostingNextRenewal(e.target.value)} />
          </div>
        </div>

        <p className="text-xs font-medium text-muted-foreground">Domínio</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-registrar">Registrador</Label>
            <Input id="site-registrar" value={domainRegistrar} onChange={(e) => setDomainRegistrar(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-drenew">Renovação</Label>
            <Input id="site-drenew" type="date" value={domainRenewalDate} onChange={(e) => setDomainRenewalDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-dprice">Valor (R$)</Label>
            <Input id="site-dprice" inputMode="decimal" value={domainRenewalPrice} onChange={(e) => setDomainRenewalPrice(e.target.value)} />
          </div>
        </div>

        <p className="text-xs font-medium text-muted-foreground">Técnico</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-github">Repositório GitHub</Label>
            <Input id="site-github" value={githubRepo} onChange={(e) => setGithubRepo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="site-projurl">URL do projeto</Label>
            <Input id="site-projurl" value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="site-notes">Observações técnicas</Label>
          <Textarea id="site-notes" value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} rows={2} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="submit">{site ? "Salvar" : "Cadastrar"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
