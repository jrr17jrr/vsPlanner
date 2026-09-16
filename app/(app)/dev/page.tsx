"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldAlert, Users, Building2, UserPlus, UserX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useDbStore } from "@/store/db-store";
import { PageHeader } from "@/components/shared/page-header";
import { MetricCard } from "@/components/shared/metric-card";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initials, formatDate } from "@/lib/format";

export default function PainelDevPage() {
  const { isSuperAdmin, profile } = useAuth();
  const profiles = useDbStore((s) => s.profiles);
  const spaces = useDbStore((s) => s.spaces);
  const update = useDbStore((s) => s.update);
  const router = useRouter();

  useEffect(() => {
    if (profile && !isSuperAdmin) {
      toast.error("Acesso restrito ao super admin.");
      router.replace("/");
    }
  }, [profile, isSuperAdmin, router]);

  if (!isSuperAdmin) return null;

  const activeUsers = profiles.filter((p) => p.status === "ativo").length;
  const blockedUsers = profiles.filter((p) => p.status === "bloqueado").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Painel Dev"
        description="Administração da plataforma — visível apenas para super admin."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <MetricCard label="Usuários" value={profiles.length} icon={Users} />
        <MetricCard label="Usuários ativos" value={activeUsers} icon={UserPlus} tone="success" />
        <MetricCard label="Espaços" value={spaces.length} icon={Building2} />
        <MetricCard label="Novos usuários (30d)" value={0} />
        <MetricCard label="Contas bloqueadas" value={blockedUsers} icon={UserX} tone={blockedUsers > 0 ? "destructive" : "default"} />
      </div>

      <Card className="p-4">
        <p className="mb-3 text-sm font-medium text-foreground">Usuários da plataforma</p>
        <div className="flex flex-col gap-2">
          {profiles.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-primary/15 text-primary">{initials(p.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.email} · desde {formatDate(p.createdAt)}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={p.role === "super_admin" ? "default" : "secondary"}>
                  {p.role === "super_admin" ? "super_admin" : "user"}
                </Badge>
                <Badge variant={p.status === "ativo" ? "success" : "destructive"}>{p.status}</Badge>
                {p.id !== profile?.id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = p.status === "ativo" ? "bloqueado" : "ativo";
                      update("profiles", p.id, { status: next });
                      toast.success(next === "ativo" ? "Conta ativada." : "Conta bloqueada.");
                    }}
                  >
                    {p.status === "ativo" ? "Bloquear" : "Ativar"}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex items-start gap-3 border-dashed p-4">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Estrutura preparada para funcionalidades futuras de SaaS: planos, assinaturas, trial e métricas de
          uso. Quando o Supabase for conectado, a role <code>super_admin</code> precisa ser validada no
          backend (RLS), nunca apenas nesta tela.
        </p>
      </Card>
    </div>
  );
}
