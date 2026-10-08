// Service worker: deixa o app abrir rápido e funcionar sem sinal.
// Arquivos do site: busca na rede primeiro (atualizações chegam na hora) e usa a cópia guardada se estiver offline.
// Os dados (Firestore) não passam por aqui: o próprio Firebase guarda e sincroniza.
const CACHE = 'atividades-v17';
const SHELL = ['./', './index.html', './app.js?v=17', './styles.css?v=17', './firebase-config.js', './manifest.webmanifest', './logo-saeng.png', './icon-192.png', './favicon.png', './relatorio.js?v=17', './cronograma.js?v=17', './logo-saeng-cinza.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin){
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
    return;
  }
  const libs = (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) || url.hostname === 'cdn.jsdelivr.net';
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (libs || fonts){
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
