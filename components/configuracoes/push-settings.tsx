"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { activatePush, sendTestPush } from "@/lib/push/client";
import { PushDiagnostics } from "@/components/configuracoes/push-diagnostics";
import { notifyPushChange, usePushDevice } from "@/components/shared/push-device";

export function PushSettings() {
  const { device } = usePushDevice();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function activate() {
    setBusy(true); setStatus("");
    try {
      await activatePush();
      setStatus("Notificações ativadas neste aparelho.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Erro ao ativar"); }
    finally { notifyPushChange(); setBusy(false); }
  }
  async function test() {
    setBusy(true);
    try {
      const result = await sendTestPush(5);
      const schedule = result.schedule;
      const scheduleText = schedule?.error ? ` Agendador automático: ${schedule.error}.` : schedule?.ok ? " Agendador automático verificado." : "";
      setStatus(result.message + scheduleText);
    } catch { setStatus("Falha ao testar notificações."); }
    finally { setBusy(false); }
  }
  return <Card className="p-4">
    <p className="mb-2 text-sm font-medium">Notificações no iPhone</p>
    <p className="mb-3 text-xs text-muted-foreground">Ative em cada aparelho. Os lembretes saem do servidor e chegam mesmo com o VS Planner fechado.</p>
    {device.ios && !device.standalone && (
      <div className="mb-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs" role="note">
        <p className="font-medium">No iPhone, o push só funciona com o app instalado (iOS 16.4 ou mais novo):</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-4">
          <li>No Safari, toque em Compartilhar → “Adicionar à Tela de Início”.</li>
          <li>Abra o VS Planner pelo ícone da Tela de Início.</li>
          <li>Volte aqui e toque em “Ativar notificações”.</li>
        </ol>
      </div>
    )}
    {device.permission === "denied" && (
      <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
        As notificações estão bloqueadas para o VS Planner. No iPhone: Ajustes → Notificações → VS Planner → Permitir. No computador: configurações do site no navegador.
      </p>
    )}
    <p className="mb-3 text-[11px] text-muted-foreground">Neste aparelho: {device.supported ? (device.permission === "granted" ? "permissão concedida" : device.permission === "denied" ? "bloqueado" : "ainda não ativado") : "navegador sem suporte a push"}{device.ios ? (device.standalone ? " · app instalado" : " · aberto no navegador") : ""}.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" className="h-10" onClick={activate} disabled={busy}>Ativar notificações</Button>
      <Button size="sm" className="h-10" variant="outline" onClick={test} disabled={busy}>Enviar teste</Button>
    </div>
    {status && <p className="mt-3 text-sm" role="status">{status}</p>}
    <PushDiagnostics />
  </Card>;
}
