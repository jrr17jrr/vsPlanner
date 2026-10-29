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
  event.waitUntil(clients.openWindow(url.href));
});
