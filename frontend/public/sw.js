/* Minimal service worker: it only makes the app installable (Chrome/Android requires one).
   It does not cache anything, so the app always talks to the server. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* network passthrough */ });
