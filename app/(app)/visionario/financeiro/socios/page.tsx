import Link from "next/link";
import { requireModulePermission } from "@/lib/supabase/dal";
import { VISIONARIO_DEV_SLUG } from "@/lib/space-slugs";
import { listFinancialCharges, listFinancialPayments } from "@/lib/supabase/repositories/financial.repository";
import { formatCurrency } from "@/lib/format";

export default async function PartnerExpensesPage() {
  const { space } = await requireModulePermission(VISIONARIO_DEV_SLUG, "financeiro", "view");
  const [charges, payments] = await Promise.all([listFinancialCharges(space.id), listFinancialPayments(space.id)]);
  const outgoing = new Map(charges.filter(c => c.kind === "saida").map(c => [c.id, c]));
  const rows = payments.filter(p => (p.payer_label === "junior" || p.payer_label === "guilherme") && outgoing.has(p.charge_id)).sort((a,b) => b.payment_date.localeCompare(a.payment_date));
  const totals = { junior: 0, guilherme: 0 };
  for (const p of rows) if (p.payer_label === "junior" || p.payer_label === "guilherme") totals[p.payer_label] += Number(p.amount);
  const months = [...new Set(rows.map(p => p.payment_date.slice(0,7)))].sort().reverse();
  return <div className="space-y-6">
    <div><Link href="/visionario" className="text-sm text-primary hover:underline">← Voltar à visão geral</Link><h1 className="mt-2 text-2xl font-bold">Gastos dos sócios</h1><p className="text-sm text-muted-foreground">Pagamentos feitos do próprio bolso por Júnior e Guilherme. Gastos pagos pelo caixa da empresa não entram aqui.</p></div>
    <div className="grid gap-3 sm:grid-cols-3">
      {[["Total",totals.junior+totals.guilherme],["Júnior",totals.junior],["Guilherme",totals.guilherme]].map(([label,value]) => <div key={String(label)} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{formatCurrency(Number(value))}</p></div>)}
    </div>
    <div className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Comparativo por mês</h2><div className="mt-4 space-y-4">{months.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pagamento atribuído aos sócios ainda.</p>}{months.map(month => {const jr=rows.filter(p=>p.payment_date.startsWith(month)&&p.payer_label==="junior").reduce((s,p)=>s+Number(p.amount),0);const gu=rows.filter(p=>p.payment_date.startsWith(month)&&p.payer_label==="guilherme").reduce((s,p)=>s+Number(p.amount),0);const max=Math.max(jr,gu,1);return <div key={month}><p className="mb-2 text-sm font-medium">{month.slice(5,7)}/{month.slice(0,4)}</p><div className="space-y-2">{[["Júnior",jr],["Guilherme",gu]].map(([name,value])=><div key={String(name)} className="grid grid-cols-[70px_1fr_95px] items-center gap-2 text-xs"><span>{name}</span><div className="h-3 rounded-full bg-muted"><div className="h-3 rounded-full bg-primary" style={{width:`${Number(value)/max*100}%`}} /></div><span className="text-right">{formatCurrency(Number(value))}</span></div>)}</div></div>})}</div></div>
    <div className="rounded-xl border bg-card p-4"><h2 className="mb-4 font-semibold">Histórico dos pagamentos</h2><div className="space-y-2">{rows.map(p=><div key={p.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><div><p className="font-medium">{outgoing.get(p.charge_id)?.description}</p><p className="text-xs text-muted-foreground">{p.payment_date.split("-").reverse().join("/")} · Pago por {p.payer_label==="junior"?"Júnior":"Guilherme"}</p></div><span className="shrink-0 font-semibold">{formatCurrency(Number(p.amount))}</span></div>)}</div></div>
  </div>;
}
