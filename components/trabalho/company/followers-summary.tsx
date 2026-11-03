import { TrendingDown, TrendingUp } from "lucide-react";
import { formatFollowerDiff, formatFollowerPct, type CompanyFollowerOverview } from "@/lib/clt/followers";

/**
 * Bloco "Seguidores do Instagram" do card da empresa (lista de empresas).
 * Atual = último registro; variação = período do filtro da página.
 */
export function FollowersSummary({ overview, periodLabel }: { overview: CompanyFollowerOverview; periodLabel: string }) {
  const { latest, growth } = overview;
  const tone = growth ? (growth.diff > 0 ? "text-success" : growth.diff < 0 ? "text-destructive" : "text-muted-foreground") : "text-muted-foreground";
  return (
    <div className="mt-3 rounded-md bg-muted/50 p-2 text-sm">
      <p className="text-xs text-muted-foreground">Seguidores do Instagram</p>
      {latest ? (
        <>
          <p className="font-semibold tabular-nums">{latest.followers.toLocaleString("pt-BR")}</p>
          {growth ? (
            <p className={`flex flex-wrap items-center gap-1 text-xs font-medium ${tone}`}>
              {growth.diff > 0 && <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
              {growth.diff < 0 && <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{formatFollowerDiff(growth.diff)} {Math.abs(growth.diff) === 1 ? "seguidor" : "seguidores"} ({formatFollowerPct(growth.pct)})</span>
              <span className="font-normal text-muted-foreground">· {periodLabel}</span>
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Sem comparação disponível · {periodLabel}</p>
          )}
        </>
      ) : (
        <p className="font-medium text-muted-foreground">Não informado</p>
      )}
    </div>
  );
}
