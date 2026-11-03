// Ontsleutelt de site in de browser en zet de bestanden in een lokale cache, waarna een
// service worker ze serveert. Zonder het juiste wachtwoord is de inhoud niet leesbaar.
(function () {
  "use strict";
  var ITERATIONS = 600000;
  var VERSION = document.documentElement.getAttribute("data-version");
  var CACHE = "demo-" + VERSION;
  var base = new URL("./", location.href).href;
  var form = document.getElementById("unlock");
  var input = document.getElementById("password");
  var status = document.getElementById("status");
  var btn = document.getElementById("submit");
  var resume = document.getElementById("resume");
  var lock = document.getElementById("lock");

  function say(msg, isError) {
    status.textContent = msg;
    status.className = isError ? "status error" : "status";
  }

  if (!("serviceWorker" in navigator) || !window.crypto || !crypto.subtle || !window.caches) {
    say("Deze browser ondersteunt het beveiligde voorbeeld niet. Probeer een recente versie van Chrome, Edge, Safari of Firefox.", true);
    btn.disabled = true;
    return;
  }

  // Eerder ontgrendeld op dit apparaat? Dan direct verder kunnen.
  caches.has(CACHE).then(function (has) {
    if (!has) return;
    return caches.open(CACHE).then(function (c) {
      return c.match(base + "__entry").then(function (r) {
        return r && r.text().then(function (entry) {
          resume.href = base + "site/" + entry;
          resume.parentElement.hidden = false;
        });
      });
    });
  });

  lock.addEventListener("click", function () {
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("demo-") === 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () {
      resume.parentElement.hidden = true;
      say("Voorbeeld vergrendeld op dit apparaat.");
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var password = input.value.trim().normalize("NFC");
    if (!password) return;
    btn.disabled = true;
    say("Bezig met ontgrendelen…");
    var bundle;
    fetch("site.bin", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("download");
        return r.arrayBuffer();
      })
      .then(function (buf) {
        bundle = new Uint8Array(buf);
        var salt = bundle.slice(4, 20);
        return crypto.subtle
          .importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"])
          .then(function (k) {
            return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: ITERATIONS, hash: "SHA-256" }, k, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
          });
      })
      .then(function (key) {
        return crypto.subtle.decrypt({ name: "AES-GCM", iv: bundle.slice(20, 32) }, key, bundle.slice(32));
      })
      .catch(function (err) {
        throw err && err.message === "download" ? err : new Error("wachtwoord");
      })
      .then(function (plain) {
        var view = new DataView(plain);
        var hlen = view.getUint32(0);
        var header = JSON.parse(new TextDecoder().decode(new Uint8Array(plain, 4, hlen)));
        var dataStart = 4 + hlen;
        // Oudere versies van dit voorbeeld opruimen, zodat nooit verouderde bestanden worden getoond
        return caches.keys().then(function (keys) {
          return Promise.all(keys.filter(function (k) { return k.indexOf("demo-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
        }).then(function () { return caches.open(CACHE); }).then(function (cache) {
          var puts = header.files.map(function (f) {
            var body = new Blob([new Uint8Array(plain, dataStart + f.o, f.l)], { type: f.t });
            var url = base + "site/" + f.p;
            var res = function () { return new Response(body, { headers: { "content-type": f.t, "x-robots-tag": "noindex" } }); };
            var jobs = [cache.put(url, res())];
            if (/(^|\/)index\.html$/.test(f.p)) jobs.push(cache.put(url.replace(/index\.html$/, ""), res()));
            return Promise.all(jobs);
          });
          puts.push(cache.put(base + "__entry", new Response(header.entry)));
          return Promise.all(puts).then(function () { return header.entry; });
        });
      })
      .then(function (entry) {
        return navigator.serviceWorker.register("sw.js", { scope: "./" }).then(function () {
          return navigator.serviceWorker.ready;
        }).then(function () {
          location.href = base + "site/" + entry;
        });
      })
      .catch(function (err) {
        btn.disabled = false;
        if (err && err.message === "wachtwoord") say("Onjuist wachtwoord. Controleer het wachtwoord en probeer het opnieuw.", true);
        else if (err && err.message === "download") say("Het voorbeeld kon niet worden geladen. Controleer je internetverbinding.", true);
        else say("Er ging iets mis bij het openen van het voorbeeld.", true);
      });
  });
})();
