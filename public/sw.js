// Service Worker do IndyCar Comunicar — torna o site instalável (PWA) e, desde a
// rodada 4, abre a CASCA do app do cache quando o servidor está dormindo/fora
// (Render gratuito: 503 "hibernate-wake-error"). Os dados continuam sempre da
// rede — quem espera o servidor acordar é o acordar.js, com aviso na tela.
const VERSAO = '4.0.0';
const CACHE = `comunicar-v${VERSAO}`;
const EXTERNO = 'comunicar-externo-v1'; // supabase-js e fontes (versão fixa na URL)
/* Se QUALQUER item desta lista faltar, o addAll rejeita e o service worker
   NÃO instala. Mantenha só o que existe de verdade (e as MESMAS URLs do index.html). */
const CORE = ['/', `/styles.css?v=${VERSAO}`, `/acordar.js?v=${VERSAO}`, `/conta.js?v=${VERSAO}`, `/app.js?v=${VERSAO}`,
  `/rodada4.js?v=${VERSAO}`, '/manifest.json', '/icon-192.png', '/icon-512.png', '/logo.png'];
const EXTERNOS_OK = /^https:\/\/(cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@\d|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;

/* NUNCA entra no cache: a API (dado de cliente muda a cada minuto e carrega
   token) e qualquer coisa que não seja GET. */
function passaDireto(req) {
  if (req.method !== 'GET') return true;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return !EXTERNOS_OK.test(req.url);
  return url.pathname.startsWith('/api/') || url.pathname === '/api';
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== EXTERNO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/** Rede com tempo-limite: o servidor dormindo não pode prender a tela branca. */
function redeAte(req, ms) {
  return new Promise((ok, falha) => {
    const t = setTimeout(() => falha(new Error('demorou')), ms);
    fetch(req).then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); falha(e); });
  });
}
const guardar = (nome, req, r) => { if (r && (r.ok || r.type === 'opaque')) { const cp = r.clone(); caches.open(nome).then((c) => c.put(req, cp)); } return r; };

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (passaDireto(req)) return;                       // API e cia.: sempre rede, sem guardar
  const url = new URL(req.url);

  // supabase-js e fontes: cache primeiro (a URL já tem a versão)
  if (url.origin !== self.location.origin) {
    e.respondWith(caches.match(req).then((m) => m || fetch(req).then((r) => guardar(EXTERNO, req, r))));
    return;
  }

  // a página: rede por até 4 s; servidor fora (5xx), sem rede ou lento → a casca do cache
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    e.respondWith(
      redeAte(req, 4000)
        .then((r) => (r.ok ? guardar(CACHE, '/', r) : caches.match('/').then((m) => m || r)))
        .catch(() => caches.match('/').then((m) => m || fetch(req)))
    );
    return;
  }

  // arquivos da tela: o do cache na hora e a versão nova em segundo plano
  e.respondWith(
    caches.match(req).then((m) => {
      const novo = fetch(req).then((r) => (r.ok && r.type === 'basic' ? guardar(CACHE, req, r) : r)).catch(() => null);
      return m || novo.then((r) => r || caches.match('/'));
    })
  );
});
