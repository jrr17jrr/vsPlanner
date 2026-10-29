"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
function decodeKey(key: string) {
  const pad = "=".repeat((4 - key.length % 4) % 4);
  const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
export function PushSettings() {
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
      await navigator.serviceWorker.register("/sw.js");
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
      setStatus(res.ok && result.sent ? "Teste enviado! Confira as notificações do iPhone." : result.error || "Nenhuma notificação entregue.");
    } catch { setStatus("Falha ao testar notificações."); }
    finally { setBusy(false); }
  }
  return <Card className="p-4">
    <p className="mb-2 text-sm font-medium">Notificações no iPhone</p>
    <p className="mb-3 text-xs text-muted-foreground">Ative no aplicativo instalado na Tela de Início. Você pode testar o envio sem criar uma reunião.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={activate} disabled={busy}>Ativar notificações</Button>
      <Button size="sm" variant="outline" onClick={test} disabled={busy}>Enviar teste</Button>
    </div>
    {status && <p className="mt-3 text-sm" role="status">{status}</p>}
  </Card>;
}
