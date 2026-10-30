// VS Planner — Service Worker (somente push). Não intercepta `fetch`: nada
// de cache offline, então deploys novos nunca servem HTML/JS antigo nem
// respostas autenticadas de outro usuário.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || "VS Planner", {
    body: data.body || "Você tem um novo lembrete.",
    icon: "/icon", badge: "/icon", tag: data.tag || "vs-planner",
    data: { url: data.url || "/hoje" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/hoje", self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(w => new URL(w.url).origin === url.origin);
    if (existing) {
      await existing.focus();
      if ("navigate" in existing) await existing.navigate(url.href).catch(() => undefined);
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
