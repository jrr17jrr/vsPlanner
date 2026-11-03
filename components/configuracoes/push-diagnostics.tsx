"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Diagnóstico das notificações (somente leitura): o agendador está rodando?
 * Este usuário tem aparelhos inscritos? Quais lembretes saem nas próximas
 * 24 h? O que aconteceu com os últimos envios? "Enviado ao serviço" = a
 * Apple/Google ACEITOU o push; a exibição no aparelho só o próprio aparelho
 * confirma.
 */
type Status = {
  now: string;
  config?: { ok: boolean; skipped?: string; error?: string };
  scheduler?: { error?: string; job?: { active: boolean } | null; url_configured?: boolean; secret_configured?: boolean; app_host?: string | null; last_runs?: Array<{ status: string; start_time: string }>; last_http?: Array<{ status_code: number | null; created: string; timed_out: boolean | null; error: string | null }> };
  recentRuns?: Array<{ ran_at: string; source: string; due: number; sent: number; failed: number; no_subscription: number; errors: unknown }> | { error: string };
  devices: Array<{ service: string; createdAt: string }>;
  upcoming: Array<{ at: string; title: string; body: string }>;
  upcomingError: string | null;
  deliveries: Array<{ event_key: string; status: string; attempts: number; sent_count: number; last_error: string | null; created_at: string; sent_at: string | null }> | { error: string };
};

const STATUS_LABEL: Record<string, string> = { sent: "Enviado ao serviço de push", failed: "Falhou", no_subscription: "Sem aparelho inscrito", sending: "Enviando" };
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const at = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)} ${key.slice(11, 16)}`;
const minutesAgo = (iso: string) => Math.round((Date.now() - Date.parse(iso)) / 60_000);

function schedulerHealth(s: Status): { ok: boolean; text: string } {
  const sch = s.scheduler;
  if (!sch || sch.error) return { ok: false, text: `Não foi possível ler o agendador (${sch?.error ?? "sem resposta"}). A migração 20261104100000_push_cron_selfheal.sql precisa estar aplicada no Supabase.` };
  if (!sch.job?.active) return { ok: false, text: "O agendamento automático não está ativo no Supabase." };
  if (!sch.url_configured || !sch.secret_configured) return { ok: false, text: s.config?.error ? `Agendador sem configuração: ${s.config.error}` : "Agendador ainda sem URL/segredo. Toque em “Enviar teste” no app instalado para configurar automaticamente." };
  const runs = Array.isArray(s.recentRuns) ? s.recentRuns.filter((r) => r.source === "supabase-cron") : [];
  const http = sch.last_http?.[0];
  if (http && (http.timed_out || (http.status_code ?? 0) >= 300 || http.error)) return { ok: false, text: `A chamada do agendador falhou: ${http.timed_out ? "tempo esgotado" : http.error ?? `HTTP ${http.status_code}`}${http.status_code === 401 ? " (segredo diferente — toque em “Enviar teste” para reconfigurar)" : ""}.` };
  if (!runs.length) return { ok: false, text: "O agendador está configurado, mas ainda não houve execução registrada. Aguarde 1–2 minutos e verifique de novo." };
  const ago = minutesAgo(runs[0].ran_at);
  return ago <= 3 ? { ok: true, text: `Ativo · última verificação há ${ago <= 0 ? "menos de 1" : ago} min${sch.app_host ? ` · ${sch.app_host}` : ""}.` } : { ok: false, text: `Última verificação há ${ago} min — deveria ser a cada minuto.` };
}

export function PushDiagnostics() {
  const [data, setData] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/push/status", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Falha ao verificar.");
      setData(json);
    } catch (e) { setError(e instanceof Error ? e.message : "Falha ao verificar."); }
    finally { setBusy(false); }
  }
  const health = data ? schedulerHealth(data) : null;
  return <div className="mt-4 border-t border-border pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium">Diagnóstico</p>
      <Button size="sm" variant="outline" className="h-9" onClick={load} disabled={busy}>{busy ? "Verificando…" : data ? "Atualizar" : "Verificar notificações"}</Button>
    </div>
    {error && <p className="mt-2 text-sm text-destructive" role="status">{error}</p>}
    {data && health && <div className="mt-3 space-y-3 text-xs">
      <p className={health.ok ? "text-success" : "text-destructive"}><b>Agendador automático:</b> {health.text}</p>
      <p><b>Aparelhos inscritos (sua conta):</b> {data.devices.length ? data.devices.map((d) => `${d.service} desde ${when(d.createdAt)}`).join(" · ") : <span className="text-destructive">nenhum — toque em “Ativar notificações” neste aparelho.</span>}</p>
      <div>
        <p className="font-medium">Próximos lembretes (24 h)</p>
        {data.upcomingError ? <p className="text-destructive">Não foi possível calcular: {data.upcomingError}</p>
          : data.upcoming.length ? <ul className="mt-1 space-y-1">{data.upcoming.map((u, i) => <li key={i} className="break-words"><span className="tabular-nums text-muted-foreground">{at(u.at)}</span> · {u.body}</li>)}</ul>
          : <p className="text-muted-foreground">Nenhum lembrete nas próximas 24 h. Confira se a tarefa tem horário/lembrete e se as preferências estão ligadas.</p>}
      </div>
      <div>
        <p className="font-medium">Últimos envios</p>
        {Array.isArray(data.deliveries) ? (data.deliveries.length ? <ul className="mt-1 space-y-1">{data.deliveries.map((d) => <li key={d.event_key} className="break-words">
          <span className="tabular-nums text-muted-foreground">{when(d.sent_at ?? d.created_at)}</span> · <span className={d.status === "sent" ? "text-success" : d.status === "failed" ? "text-destructive" : ""}>{STATUS_LABEL[d.status] ?? d.status}</span>
          {d.status === "sent" && d.sent_count > 1 ? ` (${d.sent_count} aparelhos)` : ""}{d.attempts > 1 ? ` · ${d.attempts} tentativas` : ""}{d.last_error ? ` · ${d.last_error}` : ""}
        </li>)}</ul> : <p className="text-muted-foreground">Nenhum lembrete enviado ainda.</p>) : <p className="text-destructive">{data.deliveries.error}</p>}
      </div>
      <p className="text-muted-foreground">“Enviado ao serviço de push” = a Apple/Google aceitou o aviso. Se ele não aparecer no iPhone, confira Ajustes → Notificações → VS Planner, Modo Foco e Resumo programado.</p>
    </div>}
  </div>;
}
