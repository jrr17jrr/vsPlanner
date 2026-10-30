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
