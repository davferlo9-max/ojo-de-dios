// Servidor local: sirve la app y hace de puente CORS hacia la red ADS-B (adsb.lol). Sin dependencias.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8080, ROOT = __dirname;
const API = 'https://api.adsb.lol/v2';
const REFRESH_MS = 40000, CONCURRENCY = 2, RADIUS_NM = 250;
// Puntos de muestreo que cubren las zonas de mayor tráfico del planeta
const POINTS = [[40,-74],[34,-118],[41,-88],[33,-97],[28,-81],[47,-122],[39,-105],[33,-84],[45,-75],[19,-99],
  [-23,-46],[-34,-58],[4,-74],[-12,-77],[51,0],[48,9],[41,12],[40,-4],[55,12],[50,20],[55,37],[41,29],
  [30,31],[25,55],[-26,28],[6,3],[36,52],[28,77],[19,73],[13,100],[1,104],[22,114],[31,121],[39,116],
  [35,139],[37,127],[-6,107],[-34,151],[-37,145],[-36,175],[60,-150],[64,-22],[21,-157]];

let cache = { t: 0, n: 0, ac: [] }, busy = false;
const ft = 0.3048, kt = 0.514444;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async (u, tries = 3) => { for (let i = 1; ; i++) { try { const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (r.status === 429 && i < tries) { await sleep(2500*i); continue; } if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { if (i >= tries) throw e; await sleep(1000); } } };

async function refresh() {
  if (busy) return; busy = true;
  try {
    const map = new Map(), queue = POINTS.slice();
    let mil = new Set();
    try { (await get(`${API}/mil`)).ac.forEach(a => mil.add(a.hex)); } catch {}
    const worker = async () => { for (let p; (p = queue.shift());) {
      try { for (const a of (await get(`${API}/point/${p[0]}/${p[1]}/${RADIUS_NM}`)).ac || []) {
        if (a.lat == null || a.lon == null || a.alt_baro === 'ground') continue;
        map.set(a.hex, [a.hex, (a.flight || '').trim(), a.lat, a.lon, Math.round((+a.alt_baro || 0)*ft), Math.round((a.gs || 0)*kt), a.track || 0, mil.has(a.hex) || (a.dbFlags & 1) ? 1 : 0, a.r || '', a.t || '']); }
      } catch (e) { console.warn('fallo punto', p, e.message); } await sleep(400); } };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    if (map.size) cache = { t: Date.now(), n: map.size, ac: [...map.values()] };
    console.log(`[${new Date().toISOString()}] aeronaves: ${map.size}`);
  } finally { busy = false; }
}
refresh(); setInterval(refresh, REFRESH_MS);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/flights') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ src: 'adsb.lol', ...cache }));
  }
  const file = path.join(ROOT, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, d) => { if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(d); });
}).listen(PORT, () => console.log(`OJO DE DIOS en http://localhost:${PORT}`));
