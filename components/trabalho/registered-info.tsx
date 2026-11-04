"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CollapsibleSection } from "@/components/trabalho/company/collapsible-section";
import { useCompanyTab } from "@/components/trabalho/company/company-tabs";
import { FORMAT_LABEL, INFO_FIELDS, infoSummary, safeHref, type InfoRow } from "@/lib/clt/registered-info";
import { updateCltRegisteredInfoAction } from "@/lib/supabase/clt-info-actions";
import type { CltAdCreative, CltAdSet } from "@/types/database.types";

/** Copia para a área de transferência (com alternativa para navegadores sem a API). */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true; }
  } catch { /* cai na alternativa abaixo */ }
  try {
    const el = document.createElement("textarea");
    el.value = value; el.setAttribute("readonly", ""); el.style.position = "fixed"; el.style.opacity = "0";
    document.body.appendChild(el); el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch { return false; }
}

/** Botão de copiar com confirmação visual (ícone ✓ + aviso). */
export function CopyButton({ value, label, className }: { value: string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <Button
      type="button" variant="outline" size="sm"
      className={"h-9 shrink-0 gap-1.5 px-2.5 text-xs " + (copied ? "border-emerald-500/60 text-emerald-400 " : "") + (className ?? "")}
      aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
      title={`Copiar ${label}`}
      onClick={async () => {
        const ok = await copyText(value);
        if (!ok) { toast.error("Não foi possível copiar. Selecione o texto e copie manualmente."); return; }
        setCopied(true);
        toast.success(`${label} copiado.`);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

export function OpenLinkButton({ href, label = "Abrir" }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 px-2.5 text-xs">
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (abre em nova aba)`}><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />{label}</a>
    </Button>
  );
}

/** Abre a aba Públicos da empresa e rola até o público. */
function useOpenAudience() {
  const setTab = useCompanyTab();
  const router = useRouter();
  return (id: string) => {
    setTab("publicos");
    window.dispatchEvent(new CustomEvent("vsplanner:open-audience", { detail: id }));
    setTimeout(() => {
      const el = document.getElementById(`publico-${id}`);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("ring-2", "ring-primary/60"); setTimeout(() => el.classList.remove("ring-2", "ring-primary/60"), 2500); }
      else router.push(`?aba=publicos#publico-${id}`);
    }, 250);
  };
}

/** Grade de informações: vazio → "Não informado"; IDs/links com copiar e abrir. */
export function InfoGrid({ rows }: { rows: InfoRow[] }) {
  const openAudience = useOpenAudience();
  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map((r) => {
        const isId = /(^|_)id$/.test(r.key) || r.key.endsWith("_id");
        return (
          <div key={r.key} className={"min-w-0 rounded-lg border bg-muted/20 p-3 " + (r.long || r.href ? "sm:col-span-2" : "")}>
            <dt className="text-xs text-muted-foreground">{r.label}</dt>
            <dd className="mt-1 flex flex-wrap items-start justify-between gap-2">
              {r.value
                ? <span className={"min-w-0 flex-1 text-sm " + (isId ? "break-all font-mono" : r.href ? "break-all" : "whitespace-pre-wrap break-words")}>{r.value}{r.hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">({r.hint})</span>}</span>
                : <span className="text-sm italic text-muted-foreground">Não informado</span>}
              {r.value && (r.copy || r.href || r.link) && (
                <span className="flex shrink-0 flex-wrap gap-1.5">
                  {r.href && <OpenLinkButton href={r.href} />}
                  {r.copy && <CopyButton value={r.value} label={r.label} />}
                  {r.link?.kind === "audience" && <Button type="button" variant="outline" size="sm" className="h-9 gap-1.5 px-2.5 text-xs" onClick={() => openAudience(r.link!.id)}><Users className="h-3.5 w-3.5" aria-hidden="true" />Ver público</Button>}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Seção recolhível "Informações …" com botão de editar. */
export function InfoSection({ title, rows, onEdit, editLabel = "Editar informações", defaultOpen = true }: { title: string; rows: InfoRow[]; onEdit?: () => void; editLabel?: string; defaultOpen?: boolean }) {
  return (
    <CollapsibleSection compact className="shadow-none" title={title} defaultOpen={defaultOpen} summary={infoSummary(rows)}>
      {onEdit && <div className="mb-3 flex justify-end"><Button type="button" variant="outline" size="sm" className="h-9 gap-1.5" onClick={onEdit}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />{editLabel}</Button></div>}
      <InfoGrid rows={rows} />
    </CollapsibleSection>
  );
}

/** Chip com ID (sempre visível no cabeçalho) e botão de copiar. */
export function IdChip({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return <span className="text-xs text-muted-foreground">{label}: não informado</span>;
  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border bg-muted/30 px-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="break-all font-mono">{value}</span>
      <CopyButton value={value} label={label} className="h-7" />
    </span>
  );
}

type Field = { name: string; label: string; value: string; kind?: "long" | "url" | "number" | "select"; options?: Array<[string, string]>; placeholder?: string; inputMode?: "numeric" | "decimal" | "url" | "text" };
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function InfoForm({ title, fields, onCancel, onSubmit, pending }: { title: string; fields: Field[]; onCancel: () => void; onSubmit: (values: Record<string, string>) => void; pending: boolean }) {
  return (
    <form
      className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-3"
      onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onSubmit(Object.fromEntries(fields.map((x) => [x.name, String(f.get(x.name) ?? "")]))); }}
    >
      <div>
        <h4 className="font-semibold">{title}</h4>
        <p className="text-xs text-muted-foreground">Só as informações cadastradas são alteradas. Métricas, resultados e histórico continuam como estão. Campo vazio = “Não informado”.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((x) => (
          <div key={x.name} className={"space-y-1 " + (x.kind === "long" || x.kind === "url" ? "sm:col-span-2" : "")}>
            <Label htmlFor={`info-${x.name}`}>{x.label}</Label>
            {x.kind === "long" ? <Textarea id={`info-${x.name}`} name={x.name} defaultValue={x.value} rows={3} />
              : x.kind === "select" ? <select id={`info-${x.name}`} name={x.name} defaultValue={x.value} className="h-11 w-full rounded-md border bg-background px-2 text-sm">{x.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              : <Input id={`info-${x.name}`} name={x.name} defaultValue={x.value} placeholder={x.placeholder} inputMode={x.inputMode} className="h-11" />}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending} className="h-11">{pending ? "Salvando…" : "Salvar alterações"}</Button>
        <Button type="button" variant="outline" className="h-11" onClick={onCancel} disabled={pending}>Cancelar</Button>
      </div>
    </form>
  );
}

function useSave(level: "adSet" | "ad", id: string, onDone: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const save = (values: Record<string, string>) => start(async () => {
    try {
      const r = await updateCltRegisteredInfoAction({ level, id, values });
      if (r.error) { toast.error(r.error); return; }
      toast.success(r.success ?? "Salvo.");
      onDone();
      router.refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro ao salvar."); }
  });
  return { pending, save };
}

const label = (col: string, level: "adSet" | "ad") => INFO_FIELDS[level].find((f) => f.column === col)?.label ?? col;

export function AdSetInfoForm({ set, audiences, onClose }: { set: CltAdSet; audiences: Array<{ id: string; name: string; audience_type: string }>; onClose: () => void }) {
  const { pending, save } = useSave("adSet", set.id, onClose);
  const fields: Field[] = [
    { name: "name", label: "Nome do conjunto", value: set.name },
    { name: "meta_adset_id", label: "ID do conjunto na Meta", value: str(set.meta_adset_id), inputMode: "numeric", placeholder: "Ex.: 120212345678901234" },
    { name: "saved_audience_id", label: "Público cadastrado no VS Planner", value: str(set.saved_audience_id), kind: "select", options: [["", "Nenhum"], ...audiences.map((a) => [a.id, `${a.name} (${a.audience_type})`] as [string, string])] },
    { name: "audience", label: "Público (texto livre)", value: str(set.audience) },
    { name: "location", label: label("location", "adSet"), value: str(set.location) },
    { name: "radius_km", label: label("radius_km", "adSet"), value: str(set.radius_km), inputMode: "decimal" },
    { name: "age_min", label: label("age_min", "adSet"), value: str(set.age_min), inputMode: "numeric" },
    { name: "age_max", label: label("age_max", "adSet"), value: str(set.age_max), inputMode: "numeric", placeholder: "65 = 65+" },
    { name: "gender", label: label("gender", "adSet"), value: str(set.gender), placeholder: "Ex.: Todos" },
    { name: "languages", label: label("languages", "adSet"), value: str(set.languages) },
    { name: "conversion_location", label: label("conversion_location", "adSet"), value: str(set.conversion_location), placeholder: "Ex.: WhatsApp" },
    { name: "performance_goal", label: label("performance_goal", "adSet"), value: str(set.performance_goal) },
    { name: "placements", label: label("placements", "adSet"), value: str(set.placements), kind: "long" },
    { name: "notes", label: "Observações", value: str(set.notes), kind: "long" },
  ];
  return <InfoForm title="Editar informações do conjunto" fields={fields} onCancel={onClose} onSubmit={save} pending={pending} />;
}

export function AdInfoForm({ ad, onClose }: { ad: CltAdCreative; onClose: () => void }) {
  const { pending, save } = useSave("ad", ad.id, onClose);
  const fields: Field[] = [
    { name: "name", label: "Nome do anúncio", value: ad.name },
    { name: "meta_ad_id", label: "ID do anúncio na Meta", value: str(ad.meta_ad_id), inputMode: "numeric", placeholder: "Ex.: 120212345678901234" },
    { name: "format", label: "Formato", value: ad.format || "outro", kind: "select", options: Object.entries(FORMAT_LABEL) },
    { name: "asset_url", label: label("asset_url", "ad"), value: str(ad.asset_url), kind: "url", inputMode: "url", placeholder: "https://…" },
    { name: "post_id", label: label("post_id", "ad"), value: str(ad.post_id) },
    { name: "headline", label: label("headline", "ad"), value: str(ad.headline) },
    { name: "call_to_action", label: label("call_to_action", "ad"), value: str(ad.call_to_action), placeholder: "Ex.: Enviar mensagem" },
    { name: "destination", label: label("destination", "ad"), value: str(ad.destination), placeholder: "Ex.: WhatsApp" },
    { name: "primary_text", label: label("primary_text", "ad"), value: str(ad.primary_text), kind: "long" },
    { name: "description", label: label("description", "ad"), value: str(ad.description), kind: "long" },
    { name: "notes", label: "Observações", value: str(ad.notes), kind: "long" },
  ];
  return <InfoForm title="Editar informações do anúncio" fields={fields} onCancel={onClose} onSubmit={save} pending={pending} />;
}

/** Link do anúncio no cabeçalho: abrir + copiar (quando cadastrado). */
export function AdLinkActions({ url }: { url: string | null | undefined }) {
  const href = safeHref(url);
  if (!url) return null;
  return <span className="flex flex-wrap gap-1.5">{href && <OpenLinkButton href={href} label="Abrir anúncio" />}<CopyButton value={url} label="Link do anúncio" /></span>;
}
