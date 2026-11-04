"use client";

/**
 * Helpers de Web Push no navegador (PWA). Nada aqui guarda segredo: só a
 * chave PÚBLICA VAPID e a inscrição do próprio aparelho.
 */

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
  // Busca uma versão nova do SW a cada abertura (deploys novos).
  registration.update().catch(() => undefined);
  return registration;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/** Reenvia a inscrição existente ao servidor (o endpoint pode mudar após atualizações do iOS). */
export async function syncSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (!subscription) return;
  await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
}

function decodeKey(key: string) {
  const pad = "=".repeat((4 - (key.length % 4)) % 4);
  const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Ativa o push NESTE aparelho (pede permissão — só chamar a partir de um
 * toque do usuário), inscreve e registra no servidor. Lança Error com a
 * mensagem para a tela.
 */
export async function activatePush(): Promise<void> {
  if (!pushSupported()) throw new Error("Este navegador não suporta push. No iPhone, abra o app instalado na Tela de Início.");
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Falta configurar a chave pública VAPID na Vercel.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão não concedida. Libere as notificações do VS Planner nas configurações do aparelho.");
  await registerServiceWorker();
  const sw = await navigator.serviceWorker.ready;
  const existing = await sw.pushManager.getSubscription();
  const subscription = existing || (await sw.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(key) }));
  const res = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || "Falha ao registrar o aparelho.");
}

/** Push de teste para os aparelhos do usuário logado (`count` = quantas notificações, 1–5). */
export async function sendTestPush(count = 5): Promise<{ ok: boolean; message: string; schedule?: { ok?: boolean; error?: string } }> {
  const res = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ count }) });
  const result = await res.json().catch(() => ({}));
  const ok = res.ok && !!result.sent;
  return { ok, message: ok ? "Teste enviado! Confira as notificações do aparelho." : result.error || "Nenhuma notificação entregue.", schedule: result.schedule };
}

/** Remove a inscrição deste aparelho (servidor + navegador). Best-effort: nunca impede o logout. */
export async function removeDeviceSubscription(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: subscription.endpoint }) });
    await subscription.unsubscribe();
  } catch {
    // ignorado — o logout continua.
  }
}
