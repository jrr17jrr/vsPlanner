import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export type ReconciliationRow = {
  campaign_id: string;
  period_start: string;
  period_end: string;
  reported_spend: number | string | null;
  reported_conversations: number | null;
  unallocated_spend: number | string | null;
  unallocated_conversations: number | null;
  notes: string | null;
};

const money = (v: number | string | null) => (v === null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const fmt = (d: string) => String(d).slice(0, 10).split("-").reverse().join("/");

/**
 * Divergências entre o total informado pela plataforma e a soma dos
 * anúncios importados. Só exibe — a diferença NUNCA é distribuída nem
 * somada aos resultados.
 */
export function ImportedReconciliation({ rows, campaigns, excludedLegacy, basePath = "/trabalho" }: { rows: ReconciliationRow[]; campaigns: { id: string; name: string }[]; excludedLegacy: number; basePath?: string }) {
  const divergent = rows.filter(r => Number(r.unallocated_spend ?? 0) !== 0 || Number(r.unallocated_conversations ?? 0) !== 0);
  if (!divergent.length && !excludedLegacy) return null;
  const name = (id: string) => campaigns.find(c => c.id === id)?.name ?? "Campanha";
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-amber-400" />Reconciliação dos resultados importados</h2>
          <Link href={basePath+"/importar"} className="text-sm text-primary hover:underline">Importador</Link>
        </div>
        {divergent.map(r => (
          <div key={`${r.campaign_id}-${r.period_start}`} className="rounded-lg border border-amber-500/30 p-3 text-sm">
            <p className="break-words font-medium">{name(r.campaign_id)}</p>
            <p className="text-xs text-muted-foreground">{fmt(r.period_start)} a {fmt(r.period_end)}</p>
            <p className="mt-1">Total informado: {money(r.reported_spend)} · {r.reported_conversations ?? "—"} conversas</p>
            <p className="text-amber-400">Não atribuído a anúncios: {money(r.unallocated_spend)} · {r.unallocated_conversations ?? "—"} conversa(s). Não está somado nos resultados.</p>
          </div>
        ))}
        {excludedLegacy > 0 && (
          <p className="text-xs text-muted-foreground">{excludedLegacy} lançamento(s) antigo(s) dentro de períodos importados não foram somados de novo (o resultado por anúncio prevalece).</p>
        )}
      </CardContent>
    </Card>
  );
}
