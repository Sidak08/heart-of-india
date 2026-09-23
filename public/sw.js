self.addEventListener("push", (event) => {
  let data = { title: "Heart of India", body: "A new order update is available.", url: "/operator/orders", tag: "heart-of-india-order" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch {}
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title, { body: data.body, icon: "/heart-of-india-logo.png", badge: "/heart-of-india-logo.png", tag: data.tag, data: { url: data.url }, renotify: true }),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => clients.forEach((client) => client.postMessage({ type: "NEW_ORDER", orderId: data.orderId }))),
  ]));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close(); const url = event.notification.data?.url || "/operator/orders";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => { const matching = clients.find((client) => new URL(client.url).pathname === url); if (matching) return matching.focus(); return self.clients.openWindow(url); }));
});

