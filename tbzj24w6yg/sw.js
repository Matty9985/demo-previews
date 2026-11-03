// Serveert de ontsleutelde site uit de lokale cache. Ontbreekt iets (niet ontgrendeld,
// cache gewist), dan gaat een paginaverzoek terug naar de wachtwoordpagina.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  var scope = self.registration.scope;
  if (event.request.method !== "GET" || !url.href.startsWith(scope + "site/")) return;
  var key = url.origin + url.pathname; // zonder query en hash
  event.respondWith(
    caches.keys().then(function (keys) {
      var names = keys.filter(function (k) { return k.indexOf("demo-") === 0; });
      return names.reduce(function (p, name) {
        return p.then(function (hit) { return hit || caches.open(name).then(function (c) { return c.match(key); }); });
      }, Promise.resolve(undefined));
    }).then(function (hit) {
      if (hit) return hit;
      if (event.request.mode === "navigate") return Response.redirect(scope, 302);
      return new Response("Niet gevonden", { status: 404 });
    })
  );
});
