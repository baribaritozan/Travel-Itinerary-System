// Emergency network-only worker: retire the offline shell before restoring Phase 3.
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith("travel-itinerary-shell-")) await caches.delete(key);
  await self.clients.claim();
  await new Promise(resolve => { const request = indexedDB.deleteDatabase("travel-itinerary-offline-v1"); request.onsuccess = request.onerror = request.onblocked = resolve; });
  await self.registration.unregister();
  // Stop old pages with pending register/fetch work and load the baseline UI.
  for (const client of await self.clients.matchAll({ type: "window", includeUncontrolled: true })) {
    const url = new URL(client.url);
    if (url.origin === self.location.origin) await client.navigate(client.url);
  }
  for (const key of await caches.keys()) if (key.startsWith("travel-itinerary-shell-")) await caches.delete(key);
})()));
// No fetch handler: every request uses the network after activation.
