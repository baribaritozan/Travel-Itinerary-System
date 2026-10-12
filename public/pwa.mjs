export const CACHE_PREFIX = "travel-itinerary-shell-";
export async function registerShell(onUpdate) {
  if (!navigator.serviceWorker || !isSecureContext) throw new Error("このブラウザではオフライン起動に対応していません。");
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const waiting = () => { if (registration.waiting) onUpdate(registration); };
  waiting(); registration.addEventListener("updatefound", () => {
    const worker = registration.installing;
    worker?.addEventListener("statechange", () => { if (worker.state === "installed") waiting(); });
  });
  if (!registration.active) await new Promise((resolve, reject) => {
    const error = () => reject(new Error("起動用ファイルを保存できませんでした。オンラインで再試行してください。"));
    const timeout = setTimeout(error, 12000), worker = registration.installing || registration.waiting;
    const check = () => {
      if (registration.active?.state === "activated" || worker?.state === "activated") { clearTimeout(timeout); resolve(); }
      else if (!worker || worker.state === "redundant") { clearTimeout(timeout); error(); }
    };
    worker?.addEventListener("statechange", check); check();
  });
  return registration;
}
export async function removeShell() {
  if (navigator.serviceWorker) for (const registration of await navigator.serviceWorker.getRegistrations()) {
    const url = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
    if (url === `${location.origin}/sw.js`) { registration.active?.postMessage({ type: "DISABLE" }); await registration.unregister(); }
  }
  if (globalThis.caches) for (const key of await caches.keys()) if (key.startsWith(CACHE_PREFIX)) await caches.delete(key);
}
export async function activateUpdate(registration) {
  const worker = registration.waiting;
  if (!worker) return false;
  const channel = new MessageChannel();
  const approved = await new Promise(resolve => {
    const timeout = setTimeout(() => resolve(false), 3000);
    channel.port1.onmessage = event => { clearTimeout(timeout); resolve(event.data === "ACTIVATING"); };
    worker.postMessage({ type: "ACTIVATE" }, [channel.port2]);
  });
  return approved;
}
