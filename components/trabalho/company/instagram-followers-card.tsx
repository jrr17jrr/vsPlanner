"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addInstagramFollowersAction, updateInstagramFollowersAction } from "@/lib/supabase/clt-followers-actions";
import { followerGrowth, followerSnapshot, formatFollowerDiff, formatFollowerPct, sortFollowerRecords, type FollowerRecord } from "@/lib/clt/followers";
import { localDateTimeParts } from "@/lib/push/reminders";

const num = (n: number) => n.toLocaleString("pt-BR");
/** "03/11/2026 às 14:05" (São Paulo). */
function when(iso: string) {
  const { date, time } = localDateTimeParts(new Date(iso));
  return `${date.split("-").reverse().join("/")} às ${time}`;
}
/** Valor para <input type="datetime-local"> em São Paulo. */
const toLocalInput = (iso: string) => { const { date, time } = localDateTimeParts(new Date(iso)); return `${date}T${time}`; };
/** São Paulo não tem horário de verão desde 2019: UTC−3 fixo. */
const fromLocalInput = (value: string) => `${value}:00-03:00`;
const parseCount = (raw: string) => (/^\d[\d.]*$/.test(raw.trim()) ? Number(raw.trim().replace(/\./g, "")) : NaN);
const toneOf = (diff: number) => (diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground");

function GrowthText({ diff, pct, className = "" }: { diff: number; pct: number | null; className?: string }) {
  return <span className={`${toneOf(diff)} ${className}`}>{formatFollowerDiff(diff)} ({formatFollowerPct(pct)})</span>;
}

/**
 * Seguidores do Instagram da empresa: registra a contagem atual (data/hora
 * automáticas), mostra atual × anterior e o histórico completo, com
 * correção de lançamentos. Não tem relação com resultados de tráfego pago.
 */
export function InstagramFollowersCard({ companyId, records, available }: { companyId: string; records: FollowerRecord[]; available: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<{ id: string; followers: string; at: string } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const sorted = sortFollowerRecords(records);
  const { current, previous, growth } = followerSnapshot(records);
  const visible = showAll ? sorted : sorted.slice(0, 5);
  const growthTone = growth ? toneOf(growth.diff) : "";

  const save = () => {
    const n = parseCount(value);
    if (!Number.isInteger(n)) { toast.error("Informe a quantidade de seguidores (somente números)."); return; }
    start(async () => {
      const r = await addInstagramFollowersAction(companyId, n);
      if (r.error) toast.error(r.error); else { toast.success(r.success); setValue(""); router.refresh(); }
    });
  };
  const saveEdit = () => {
    if (!editing) return;
    const n = parseCount(editing.followers);
    if (!Number.isInteger(n)) { toast.error("Informe a quantidade de seguidores (somente números)."); return; }
    start(async () => {
      const r = await updateInstagramFollowersAction(companyId, editing.id, { followers: n, recordedAt: editing.at ? fromLocalInput(editing.at) : undefined });
      if (r.error) toast.error(r.error); else { toast.success(r.success); setEditing(null); router.refresh(); }
    });
  };

  return (
    <Card><CardContent className="space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-semibold">Seguidores do Instagram</h2>
      </div>
      {!available ? (
        <p className="text-sm text-muted-foreground">O controle de seguidores ainda não está disponível neste banco (migração 20261103110000_clt_instagram_followers.sql pendente).</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Seguidores atuais</p><p className="mt-1 text-xl font-semibold tabular-nums">{current ? num(current.followers) : "—"}</p></div>
            <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Seguidores anteriores</p><p className="mt-1 text-xl font-semibold tabular-nums">{previous ? num(previous.followers) : "—"}</p></div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">Crescimento</p>
              <p className={`mt-1 flex items-center gap-1 text-xl font-semibold tabular-nums ${growthTone}`}>
                {growth && growth.diff > 0 && <TrendingUp className="h-4 w-4" aria-hidden="true" />}
                {growth && growth.diff < 0 && <TrendingDown className="h-4 w-4" aria-hidden="true" />}
                {growth ? formatFollowerDiff(growth.diff) : "—"}
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Crescimento percentual</p><p className={`mt-1 text-xl font-semibold tabular-nums ${growthTone}`}>{growth ? formatFollowerPct(growth.pct) : "—"}</p></div>
          </div>
          {current && <p className="text-xs text-muted-foreground">Última atualização: {when(current.recorded_at)}{!previous && " · registre outra contagem para ver o crescimento"}</p>}

          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Input aria-label="Quantidade atual de seguidores" inputMode="numeric" pattern="[0-9.]*" placeholder="Seguidores hoje (ex.: 234)" value={value} onChange={(e) => setValue(e.target.value)} className="sm:max-w-56" />
            <Button type="submit" disabled={busy || !value.trim()}>Atualizar seguidores</Button>
          </form>

          {sorted.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Histórico</p>
              <ul className="divide-y rounded-lg border">
                {visible.map((r) => {
                  const before = sorted[sorted.indexOf(r) + 1];
                  const g = before ? followerGrowth(r.followers, before.followers) : null;
                  if (editing?.id === r.id) return (
                    <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                      <Input aria-label="Seguidores" inputMode="numeric" value={editing.followers} onChange={(e) => setEditing({ ...editing, followers: e.target.value })} className="sm:max-w-36" />
                      <Input aria-label="Data e horário" type="datetime-local" value={editing.at} onChange={(e) => setEditing({ ...editing, at: e.target.value })} className="sm:max-w-56" />
                      <div className="flex gap-2"><Button size="sm" disabled={busy} onClick={saveEdit}>Salvar</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button></div>
                    </li>
                  );
                  return (
                    <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium tabular-nums">{num(r.followers)} seguidores{g && <GrowthText diff={g.diff} pct={g.pct} className="ml-2 text-xs font-normal" />}</p>
                        <p className="text-xs text-muted-foreground">{when(r.recorded_at)}</p>
                      </div>
                      <Button size="sm" variant="ghost" aria-label="Corrigir registro" onClick={() => setEditing({ id: r.id, followers: String(r.followers), at: toLocalInput(r.recorded_at) })}><Pencil className="h-4 w-4" /><span className="hidden sm:inline">Corrigir</span></Button>
                    </li>
                  );
                })}
              </ul>
              {sorted.length > 5 && <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAll((v) => !v)}>{showAll ? "Mostrar menos" : `Ver histórico completo (${sorted.length})`}</button>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Contagem manual do perfil. Não tem relação com os resultados das campanhas de tráfego pago.</p>
        </>
      )}
    </CardContent></Card>
  );
}
