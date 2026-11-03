"use client";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { registerServiceWorker } from "@/lib/push/client";
import { PushDiagnostics } from "@/components/configuracoes/push-diagnostics";
function decodeKey(key: string) {
  const pad = "=".repeat((4 - key.length % 4) % 4);
  const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
type DeviceInfo = { ios: boolean; standalone: boolean; permission: string; supported: boolean };
const SERVER_INFO: DeviceInfo = { ios: false, standalone: true, permission: "default", supported: true };
let cached: DeviceInfo | null = null;
function readDevice(): DeviceInfo {
  const nav = navigator as Navigator & { standalone?: boolean };
  const next: DeviceInfo = {
    ios: /iPhone|iPad|iPod/.test(nav.userAgent) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1),
    standalone: nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches,
    permission: "Notification" in window ? Notification.permission : "unsupported",
    supported: "serviceWorker" in nav && "PushManager" in window && "Notification" in window,
  };
  if (!cached || JSON.stringify(cached) !== JSON.stringify(next)) cached = next;
  return cached;
}
const noopSubscribe = () => () => {};

export function PushSettings() {
  const device = useSyncExternalStore(noopSubscribe, readDevice, () => SERVER_INFO);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
  async function activate() {
    setBusy(true); setStatus("");
    try {
      if (!supported) throw new Error("Este navegador não suporta push. No iPhone, abra o app instalado na Tela de Início.");
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Falta configurar a chave pública VAPID na Vercel.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Permissão não concedida nas configurações do iPhone.");
      await registerServiceWorker();
      const sw = await navigator.serviceWorker.ready;
      const existing = await sw.pushManager.getSubscription();
      const subscription = existing || await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(key) });
      const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Falha ao registrar");
      setStatus("Notificações ativadas neste aparelho.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Erro ao ativar"); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const result = await res.json();
      const schedule = result.schedule as { ok?: boolean; skipped?: string; error?: string } | undefined;
      const scheduleText = schedule?.error ? ` Agendador automático: ${schedule.error}.` : schedule?.ok ? " Agendador automático verificado." : "";
      setStatus((res.ok && result.sent ? "Teste enviado! Confira as notificações do iPhone." : result.error || "Nenhuma notificação entregue.") + scheduleText);
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
