"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellOff, BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { activatePush, currentSubscription, sendTestPush } from "@/lib/push/client";

/**
 * Estado do push NESTE aparelho (permissão, suporte, iPhone instalado ou
 * não) — compartilhado por Configurações e pelo formulário da Rotina.
 * Nunca pede permissão sozinho: só nos botões.
 */
export type DeviceInfo = { ios: boolean; standalone: boolean; permission: string; supported: boolean };
const SERVER_INFO: DeviceInfo = { ios: false, standalone: true, permission: "default", supported: true };
const CHANGE_EVENT = "vs-push-change";
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
function subscribe(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  document.addEventListener("visibilitychange", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    document.removeEventListener("visibilitychange", callback);
  };
}
export const notifyPushChange = () => window.dispatchEvent(new Event(CHANGE_EVENT));

export function usePushDevice() {
  const device = useSyncExternalStore(subscribe, readDevice, () => SERVER_INFO);
  // Permissão concedida não garante inscrição deste aparelho no servidor.
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    if (device.permission !== "granted") return;
    currentSubscription().then((s) => alive && setSubscribed(!!s)).catch(() => alive && setSubscribed(false));
    return () => { alive = false; };
  }, [device.permission]);
  return { device, subscribed: device.permission === "granted" ? subscribed : false };
}

/**
 * Aviso compacto para formulários (Rotina): mostra se as notificações
 * estão bloqueadas/desativadas neste aparelho e oferece ativar e testar.
 */
export function PushDeviceNotice({ hasReminders }: { hasReminders: boolean }) {
  const { device, subscribed } = usePushDevice();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function activate() {
    setBusy(true); setStatus("");
    try {
      await activatePush();
      setStatus("Notificações ativadas neste aparelho.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Erro ao ativar.");
    } finally {
      notifyPushChange();
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true); setStatus("");
    try { setStatus((await sendTestPush(1)).message); } catch { setStatus("Falha ao enviar o teste."); }
    finally { setBusy(false); }
  }

  const ready = device.supported && device.permission === "granted" && subscribed;
  let tone: "ok" | "warn" | "bad" = "ok";
  let text: string;
  if (!device.supported) {
    tone = "warn";
    text = device.ios && !device.standalone
      ? "No iPhone, os avisos só chegam com o VS Planner instalado: Safari → Compartilhar → “Adicionar à Tela de Início”, e abra pelo ícone."
      : "Este navegador não recebe notificações push.";
  } else if (device.permission === "denied") {
    tone = "bad";
    text = device.ios
      ? "Notificações bloqueadas neste aparelho. Ajustes → Notificações → VS Planner → Permitir."
      : "Notificações bloqueadas neste aparelho. Libere nas configurações do site (ícone ao lado do endereço) ou do Android.";
  } else if (!ready) {
    tone = "warn";
    text = device.ios && !device.standalone
      ? "Abra o VS Planner instalado na Tela de Início para ativar os avisos no iPhone."
      : "As notificações ainda não estão ativadas neste aparelho.";
  } else {
    text = "Notificações ativas neste aparelho. Os avisos chegam mesmo com o app fechado.";
  }
  if (tone === "ok" && !hasReminders) return null;

  const Icon = tone === "bad" ? BellOff : tone === "ok" ? BellRing : Smartphone;
  const canActivate = device.supported && device.permission !== "denied" && !ready && !(device.ios && !device.standalone);
  return (
    <div
      role="note"
      className={
        "flex flex-col gap-2 rounded-md border px-3 py-2 text-[11px] leading-snug " +
        (tone === "bad" ? "border-destructive/40 bg-destructive/10" : tone === "warn" ? "border-warning/40 bg-warning/10" : "border-primary/25 bg-primary/5 text-muted-foreground")
      }
    >
      <p className="flex items-start gap-1.5">
        <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{text}</span>
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {canActivate && <Button type="button" size="sm" className="h-8" onClick={activate} disabled={busy}>Ativar notificações</Button>}
        {ready && <Button type="button" size="sm" variant="outline" className="h-8" onClick={test} disabled={busy}>Enviar push de teste</Button>}
        <Link href="/configuracoes" className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">Configurações de notificação</Link>
      </div>
      {status && <p role="status" className="text-xs text-foreground">{status}</p>}
    </div>
  );
}
