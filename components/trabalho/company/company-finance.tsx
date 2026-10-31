import Link from "next/link";
import { ArrowDownCircle, ArrowUpCircle, CalendarRange, PiggyBank, TrendingDown, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CompanyDetailBalance } from "@/components/trabalho/company-detail-balance";
import type { CltCompany, CltMonthlyBudget } from "@/types/database.types";

export type AccountMovement = { id: string; movement_date: string; kind: "deposito" | "credito"; amount: number | string; notes: string | null };

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBR = (s: string) => s.slice(0, 10).split("-").reverse().join("/");

/**
 * Financeiro da conta de anúncios. Faturamento gerado pelas campanhas NÃO
 * aparece aqui: saldo da Meta e retorno das vendas são coisas diferentes.
 */
export function CompanyFinance({ company, month, budget, totalSpent, monthSpent, movements, movementsAvailable, basePath = "/trabalho" }: {
  basePath?: string;
  company: CltCompany;
  month: string;
  budget?: CltMonthlyBudget;
  totalSpent: number;
  monthSpent: number;
  movements: AccountMovement[];
  movementsAvailable: boolean;
}) {
  const monthLabel = month.split("-").reverse().join("/");
  const budgetAmount = Number(budget?.budget_amount || 0);
  const cards = [
    { label: "Saldo registrado da Meta", value: money(Number(company.current_ad_balance)), icon: Wallet, hint: "Controle manual" },
    { label: "Investimento registrado", value: money(totalSpent), icon: TrendingDown, hint: "Soma de todas as campanhas" },
    { label: `Gasto em anúncios · ${monthLabel}`, value: money(monthSpent), icon: CalendarRange, hint: "Resultados do mês" },
    { label: `Orçamento mensal · ${monthLabel}`, value: budget ? money(budgetAmount) : "Não definido", icon: PiggyBank, hint: budget ? `Reserva desejada: ${money(Number(budget.reserve_target || 0))}` : "Defina na aba Campanhas" },
  ];
  const deposits = movements.filter(m => m.kind === "deposito").reduce((a, m) => a + Number(m.amount), 0);
  const credits = movements.filter(m => m.kind === "credito").reduce((a, m) => a + Number(m.amount), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(c => (
          <Card key={c.label}><CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><c.icon className="h-4 w-4 text-primary" aria-hidden="true" />{c.label}</div>
            <p className="mt-2 text-xl font-semibold">{c.value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{c.hint}</p>
          </CardContent></Card>
        ))}
      </div>
      {budget && budgetAmount > 0 && (
        <Card><CardContent className="space-y-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-medium">Uso do orçamento do mês</span><span className="text-muted-foreground">{money(monthSpent)} de {money(budgetAmount)}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width]" style={{ width: Math.min(100, (monthSpent / budgetAmount) * 100) + "%" }} /></div>
          {monthSpent > budgetAmount && <p className="text-sm font-medium text-destructive">Gasto acima do orçamento do mês.</p>}
        </CardContent></Card>
      )}
      <CompanyDetailBalance company={company} />
      <Card><CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Histórico de movimentações</h2>
          <Link href={basePath+"/relatorios"} className="text-sm text-primary hover:underline">Registrar em Relatórios</Link>
        </div>
        {!movementsAvailable ? (
          <p className="text-sm text-muted-foreground">O histórico de depósitos e créditos ainda não está disponível neste banco.</p>
        ) : movements.length ? (
          <>
            <p className="text-xs text-muted-foreground">Depósitos: <b className="text-foreground">{money(deposits)}</b> · Créditos: <b className="text-foreground">{money(credits)}</b></p>
            <ul className="divide-y rounded-lg border">
              {movements.map(m => (
                <li key={m.id} className="flex items-start gap-3 p-3 text-sm">
                  {m.kind === "deposito" ? <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <ArrowDownCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                  <div className="min-w-0 flex-1"><p className="font-medium">{m.kind === "deposito" ? "Depósito" : "Crédito"} · {money(Number(m.amount))}</p>{m.notes && <p className="break-words text-xs text-muted-foreground">{m.notes}</p>}</div>
                  <span className="shrink-0 text-xs text-muted-foreground">{dateBR(m.movement_date)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada para esta empresa.</p>
        )}
        <p className="text-xs text-muted-foreground">As operações de saldo acima ajustam só o saldo registrado. Depósitos e créditos são lançados em Relatórios. O faturamento das campanhas não entra no saldo.</p>
      </CardContent></Card>
    </div>
  );
}
