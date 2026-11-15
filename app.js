(() => {
const $ = id => document.getElementById(id);
const D2R = Math.PI/180, ER = 6371000;
const rnd = (a, b) => a + Math.random()*(b - a);
const pick = a => a[(Math.random()*a.length)|0];
const norm = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const wrap = x => ((x + 540) % 360) - 180;
const bust = u => `${u}${u.includes('?') ? '&' : '?'}t=${Date.now()}`;
const API = new URLSearchParams(location.search).get('api') || '';
const LOCAL = !!API || /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);

const log = (msg, alert) => { const d = document.createElement('div'); if (alert) d.className = 'alert';
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; $('log').append(d); while ($('log').children.length > 40) $('log').firstChild.remove(); };

// ---------- Geometría
const dest = (la, lo, trk, dist) => {
  const p = la*D2R, th = trk*D2R, d = dist/ER, sp = Math.sin(p), cp = Math.cos(p), sd = Math.sin(d), cd = Math.cos(d);
  const l2 = Math.asin(sp*cd + cp*sd*Math.cos(th));
  return [l2/D2R, wrap(lo + Math.atan2(Math.sin(th)*sd*cp, cd - sp*Math.sin(l2))/D2R)];
};
const hav = (a, b, c, d) => { const p = Math.sin((c - a)*D2R/2)**2 + Math.cos(a*D2R)*Math.cos(c*D2R)*Math.sin((d - b)*D2R/2)**2; return 2*ER*Math.asin(Math.sqrt(p)); };
const splitDateline = pts => { const segs = [[]]; pts.forEach((p, i) => { if (i && Math.abs(p[1] - pts[i-1][1]) > 180) segs.push([]); segs[segs.length - 1].push(p); }); return segs; };

// ---------- Mapa
const map = L.map('map', { center: [25, -20], zoom: 3, minZoom: 2, maxZoom: 19, worldCopyJump: true, zoomControl: true, preferCanvas: true, attributionControl: true });
const esri = s => `https://server.arcgisonline.com/ArcGIS/rest/services/${s}/MapServer/tile/{z}/{y}/{x}`;
const LAYERS = [
  { n: 'HÍBRIDO', l: () => L.layerGroup([L.tileLayer(esri('World_Imagery'), { maxZoom: 19, maxNativeZoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' }),
      L.tileLayer(esri('Reference/World_Transportation'), { maxZoom: 19, maxNativeZoom: 19 }),
      L.tileLayer(esri('Reference/World_Boundaries_and_Places'), { maxZoom: 19, maxNativeZoom: 19 })]) },
  { n: 'CALLES', l: () => L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }) },
  { n: 'SATÉLITE', l: () => L.tileLayer(esri('World_Imagery'), { maxZoom: 19, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' }) },
  { n: 'OSCURO', l: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, attribution: '© OpenStreetMap, © CARTO' }) }];
let layerIdx = 0, base = null;
function setLayer(i) { if (base) map.removeLayer(base); layerIdx = i; base = LAYERS[i].l().addTo(map); $('layer').textContent = `CAPA: ${LAYERS[i].n}`; }
$('layer').onclick = () => { setLayer((layerIdx + 1) % LAYERS.length); log(`Capa: ${LAYERS[layerIdx].n}.`); };
setLayer(0);
const pane = (n, z) => { map.createPane(n).style.zIndex = z; return L.canvas({ pane: n, padding: .3 }); };
const rNight = pane('night', 350), rCams = pane('cams', 420), rQuake = pane('quakes', 430), rAc = pane('ac', 440);
map.createPane('track').style.zIndex = 450;

// ---------- Terminador día/noche (posición real del Sol)
const night = L.polygon([], { renderer: rNight, stroke: false, fillColor: '#000814', fillOpacity: .5, interactive: false }).addTo(map);
function updateNight() {
  const d = new Date(), n = (d - Date.UTC(d.getUTCFullYear(), 0, 0))/864e5, B = 2*Math.PI*(n - 81)/364;
  const eot = 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B), h = d.getUTCHours() + d.getUTCMinutes()/60 + d.getUTCSeconds()/3600;
  const dec = -23.44*Math.cos(2*Math.PI/365*(n + 10)), slon = -15*(h - 12 + eot/60), t = Math.tan(dec*D2R) || 1e-6;
  const pts = []; for (let lo = -540; lo <= 540; lo += 2) pts.push([Math.atan(-Math.cos((lo - slon)*D2R)/t)/D2R, lo]);
  const pole = dec > 0 ? -90 : 90; pts.push([pole, 540], [pole, -540]); night.setLatLngs(pts);
}
updateNight(); setInterval(updateNight, 60000);

// ---------- Ciudades (simulación y proximidad)
const CITIES = [['LOS ÁNGELES',34.05,-118.24],['NUEVA YORK',40.71,-74.0],['CHICAGO',41.88,-87.63],['MIAMI',25.76,-80.19],['CIUDAD DE MÉXICO',19.43,-99.13],['LA HABANA',23.11,-82.37],['BOGOTÁ',4.71,-74.07],['LIMA',-12.05,-77.04],['SÃO PAULO',-23.55,-46.63],['BUENOS AIRES',-34.6,-58.38],['SANTIAGO',-33.45,-70.67],['LONDRES',51.51,-0.13],['PARÍS',48.86,2.35],['MADRID',40.42,-3.7],['BERLÍN',52.52,13.4],['ROMA',41.9,12.5],['MOSCÚ',55.76,37.62],['ESTAMBUL',41.01,28.98],['EL CAIRO',30.04,31.24],['LAGOS',6.52,3.38],['NAIROBI',-1.29,36.82],['CIUDAD DEL CABO',-33.92,18.42],['DUBÁI',25.2,55.27],['TEHERÁN',35.69,51.39],['MUMBAI',19.08,72.88],['NUEVA DELHI',28.61,77.21],['BANGKOK',13.76,100.5],['SINGAPUR',1.35,103.82],['YAKARTA',-6.21,106.85],['HONG KONG',22.32,114.17],['SHANGHÁI',31.23,121.47],['PEKÍN',39.9,116.4],['SEÚL',37.57,126.98],['TOKIO',35.68,139.69],['SÍDNEY',-33.87,151.21],['AUCKLAND',-36.85,174.76]]
  .map(([n, la, lo]) => ({ n, la, lo }));
const nearest = (la, lo) => CITIES.reduce((b, c) => { const d = hav(la, lo, c.la, c.lo); return d < b.d ? { c, d } : b; }, { d: Infinity });

// ---------- Cámaras públicas (tráfico / meteorología oficiales)
const SRC = (window.CAM_SOURCES || []).slice(), cams = [];
(window.CAMS || []).forEach(([s, n, la, lo, u, v]) => cams.push({ s, n, la, lo, u, v }));
const SG = SRC.push('Singapur · LTA') - 1, sgIndex = new Map(), nLive = cams.filter(c => c.v).length;
let camMode = 0, camFeedsT = 0, sgOk = false; // 0 todas · 1 solo directo · 2 ninguna
const camStyle = { renderer: rCams, radius: 3.5, color: '#062', weight: 1, fillColor: '#4dff88', fillOpacity: .9, bubblingMouseEvents: false };
const liveStyle = { ...camStyle, radius: 4.5, color: '#400030', fillColor: '#ff3bd4' };
const camLayer = L.layerGroup().addTo(map);
const camLayer2 = L.layerGroup().addTo(map);
const addCam = c => { c.m = L.circleMarker([c.la, c.lo], c.v ? liveStyle : camStyle).bindTooltip(() => `${c.v ? 'VÍDEO EN DIRECTO' : 'CÁMARA (FOTO)'} · ${c.n}<br>${SRC[c.s]}`, { direction: 'top', offset: [0, -4] })
  .on('click', () => openCam(c)).addTo(c.v ? camLayer2 : camLayer); };
cams.forEach(addCam);
$('camsBtn').onclick = () => { camMode = (camMode + 1) % 3; camMode === 0 ? camLayer.addTo(map) : map.removeLayer(camLayer); camMode === 2 ? map.removeLayer(camLayer2) : camLayer2.addTo(map);
  $('camsBtn').textContent = `CÁMARAS: ${['TODAS', 'SOLO DIRECTO', 'NO'][camMode]}`; updateFeeds(); };
async function loadSG() {
  try { const j = await (await fetch('https://api.data.gov.sg/v1/transport/traffic-images')).json();
    for (const k of j.items[0].cameras) { let c = sgIndex.get(k.camera_id);
      if (!c) { c = { s: SG, n: `Cámara ${k.camera_id}`, la: k.location.latitude, lo: k.location.longitude, u: k.image, fixed: true }; sgIndex.set(k.camera_id, c); cams.push(c); addCam(c); }
      c.u = k.image; }
    sgOk = true; } catch { sgOk = false; }
  setTimeout(loadSG, 60000);
}
const camImg = c => c.fixed ? c.u : bust(c.u);
function attachVideo(v, url, onFail) {
  Object.assign(v, { autoplay: true, muted: true, playsInline: true }); v.loop = !/\.m3u8/.test(url);
  const fail = () => { if (v._dead) return; v._dead = 1; killVideo(v); onFail && onFail(); };
  if (/\.m3u8/.test(url) && window.Hls && Hls.isSupported()) {
    const h = new Hls({ enableWorker: false, liveSyncDurationCount: 2, maxBufferLength: 8, manifestLoadingMaxRetry: 2 });
    h.on(Hls.Events.ERROR, (e, d) => { if (d.fatal) fail(); }); h.loadSource(url); h.attachMedia(v); v._hls = h;
  } else v.src = url;
  v.addEventListener('error', fail); v.play().catch(() => {});
}
function killVideo(v) { if (v._hls) { v._hls.destroy(); v._hls = null; } v.removeAttribute('src'); try { v.load(); } catch {} }
const killVideos = root => root.querySelectorAll('video').forEach(killVideo);
let cvTimer = null, cvCam = null;
function openCam(c) {
  cvCam = c; clearInterval(cvTimer); $('camview').hidden = false; $('camview').classList.remove('street'); $('cv-title').innerHTML = '<i class="dot" style="color:#ff3b3b"></i>'; $('cv-title').append(c.n);
  $('cv-foot').textContent = `${SRC[c.s]} · ${c.la.toFixed(5)}, ${c.lo.toFixed(5)} · cerca de ${nearest(c.la, c.lo).c.n}`;
  const body = $('cv-body'), foot = $('cv-foot'), base = foot.textContent; killVideos(body); body.innerHTML = '';
  const mode = t => { foot.innerHTML = ''; const s = document.createElement('span'); s.innerHTML = t; foot.append(s, document.createTextNode(base)); };
  if (c.v) { const v = document.createElement('video'); v.controls = true; body.append(v);
    mode('<b style="color:#ff3bd4"><i class="dot"></i>VÍDEO EN DIRECTO</b> · ');
    attachVideo(v, c.v, () => { body.innerHTML = ''; mode('<b class="bad">VÍDEO NO DISPONIBLE · mostrando foto</b> · '); showImg(); }); }
  else { mode('<b class="bad">FOTO</b> (esta red no emite vídeo; se renueva cuando la fuente la actualiza) · '); showImg(); }
  function showImg() { const im = new Image(), nx = new Image(); im.alt = c.n; im.onerror = () => { body.textContent = '[SEÑAL NO DISPONIBLE] La cámara no responde ahora mismo.'; };
    im.src = camImg(c); body.append(im);
    nx.onload = () => { im.src = nx.src; }; cvTimer = setInterval(() => { if (!document.hidden) nx.src = camImg(c); }, 3000); }
  if (map.getZoom() < 14) map.flyTo([c.la, c.lo], 15, { duration: 1.5 });
  log(`Accediendo a cámara: ${c.n} (${SRC[c.s]})`);
}
$('cv-close').onclick = () => { killVideos($('cv-body')); $('camview').hidden = true; $('camview').classList.remove('street'); clearInterval(cvTimer); $('cv-body').innerHTML = ''; cvCam = null; };
$('cv-street').onclick = () => { if (cvCam) openStreet(cvCam.la, cvCam.lo, cvCam.n); };

// ---------- Vista a pie de calle (Google Street View)
let streetMode = false;
const svLink = (la, lo) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${la},${lo}`;
function openStreet(la, lo, title) {
  clearInterval(cvTimer); cvCam = null; $('camview').hidden = false; $('camview').classList.add('street');
  $('cv-title').textContent = `VISTA CALLE · ${title || `${la.toFixed(5)}, ${lo.toFixed(5)}`}`;
  const f = document.createElement('iframe'); f.allowFullscreen = true; f.referrerPolicy = 'no-referrer-when-downgrade';
  f.src = `https://www.google.com/maps?layer=c&cbll=${la},${lo}&cbp=12,0,0,0,0&output=svembed`;
  killVideos($('cv-body')); $('cv-body').innerHTML = ''; $('cv-body').append(f);
  $('cv-foot').innerHTML = `<span>Arrastre para girar · rueda para acercar · flechas del suelo para avanzar. Si sale gris, no hay imágenes en ese punto: pruebe sobre una calle.</span><a target="_blank" rel="noopener" href="${svLink(la, lo)}">ABRIR EN GOOGLE MAPS</a>`;
  log(`Vista calle: ${la.toFixed(5)}, ${lo.toFixed(5)}`);
}
$('streetBtn').onclick = () => { streetMode = !streetMode; $('streetBtn').classList.toggle('on', streetMode); document.body.classList.toggle('street-mode', streetMode);
  log(streetMode ? 'VISTA CALLE activa: haga clic en cualquier calle del mapa.' : 'Vista calle desactivada.'); };
map.on('click', e => { if (streetMode) openStreet(e.latlng.lat, wrap(e.latlng.lng)); });
map.on('contextmenu', e => openStreet(e.latlng.lat, wrap(e.latlng.lng)));
function updateFeeds() {
  const ctr = map.getCenter(), la = ctr.lat, lo = wrap(ctr.lng), best = [];
  for (const c of cams) { if (camMode === 1 && !c.v) continue; const d = (c.la - la)**2 + (wrap(c.lo - lo)*Math.cos(la*D2R))**2;
    if (best.length < 4 || d < best[3].d) { best.push({ c, d }); best.sort((a, b) => a.d - b.d); if (best.length > 4) best.pop(); } }
  const box = $('feeds'); killVideos(box); box.innerHTML = '';
  if (!best.length) { box.textContent = 'Sin cámaras cargadas.'; return; }
  for (const { c, d } of best) { const el = document.createElement('div'); el.className = 'feed';
    el.innerHTML = `<img alt=""><span class="rec">${c.v ? '<i class="dot"></i>EN DIRECTO' : 'FOTO'}</span><span class="lbl"></span>`;
    const im = el.querySelector('img'); im.src = camImg(c); im.onerror = function () { this.style.opacity = .15; };
    el.querySelector('.lbl').textContent = `${c.n} · ${Math.round(Math.sqrt(d)*111)} km`;
    if (c.v) { const v = document.createElement('video'); v.className = 'thumb'; el.prepend(v); attachVideo(v, c.v, () => v.remove()); v.addEventListener('playing', () => { im.style.display = 'none'; }); }
    el.onclick = () => openCam(c); box.append(el); }
  camFeedsT = Date.now();
}
map.on('moveend', updateFeeds);
setInterval(() => { if (!document.hidden && Date.now() - camFeedsT > 20000) $('feeds').querySelectorAll('.feed img').forEach((im, i) => { const v = im.parentNode.querySelector('video'); if (!v || im.style.display !== 'none') { const n = new Image(); n.onload = () => { im.src = n.src; }; n.src = bust(im.src.replace(/[?&]t=\d+$/, '')); } }); }, 10000);

// ---------- Aeronaves
const ac = new Map(), acLayer = L.layerGroup().addTo(map);
const colorOf = o => o.mil ? '#ff3b3b' : o.alt < 3000 ? '#ffd23b' : o.alt < 9000 ? '#19f3ff' : '#c0e6ff';
let flightSrc = { name: '—', t: 0, ok: false }, milOnly = false, locked = null;
const acTip = o => () => `${o.cs || o.hex.toUpperCase()}${o.mil ? ' · MILITAR' : ''}<br>${Math.round(o.alt*3.281/100)*100} ft · ${Math.round(o.gs*3.6)} km/h · ${Math.round(o.trk)}°${o.type ? ' · ' + o.type : ''}`;
function drop(k, o) { if (o.m) acLayer.removeLayer(o.m); ac.delete(k); }
function applyFlights(list, t, live) {
  if (live) for (const [k, o] of ac) if (o.sim) drop(k, o);
  for (const a of list) { let o = ac.get(a.hex); if (!o) { o = { hex: a.hex }; ac.set(a.hex, o); }
    Object.assign(o, { cs: a.cs || '', lat: a.lat, lon: a.lon, alt: a.alt, gs: a.gs, trk: a.trk, mil: !!a.mil, reg: a.reg || '', type: a.type || '', t, sim: !live });
    if (o.m) o.m.setStyle({ fillColor: colorOf(o) }); }
  if (live) { const now = Date.now(); for (const [k, o] of ac) if (now - o.t > 180000) { if (locked && locked.o === o) { log(`SEÑAL PERDIDA: ${o.cs || o.hex}`, true); release(true); } drop(k, o); } }
}
function simulate() {
  for (let i = 0; i < 600; i++) { const c = pick(CITIES);
    ac.set('SIM' + i, { hex: 'sim' + i, cs: 'SIM' + (100 + i), lat: Math.max(-70, Math.min(75, c.la + rnd(-16, 16))), lon: wrap(c.lo + rnd(-24, 24)), alt: rnd(3000, 11500), gs: rnd(190, 260), trk: rnd(0, 360), mil: Math.random() < .04, reg: '', type: 'DEMO', t: Date.now(), sim: true }); }
}
async function loadFlights() {
  let next = 40000;
  if (LOCAL) { try { const j = await (await fetch(`${API}/api/flights`)).json(); if (!j.ac || !j.ac.length) throw 0;
      applyFlights(j.ac.map(a => ({ hex: a[0], cs: a[1], lat: a[2], lon: a[3], alt: a[4], gs: a[5], trk: a[6], mil: a[7], reg: a[8], type: a[9] })), j.t, true);
      flightSrc = { name: 'adsb.lol (servidor)', t: j.t, ok: true }; next = 10000; if (!loadFlights.logged) { loadFlights.logged = 1; log('Enlace ADS-B establecido: adsb.lol.'); } } catch {} }
  if (!flightSrc.ok && !ac.size) { simulate(); log('Aeronaves SIMULADAS: las redes ADS-B no permiten acceso directo desde el navegador (ejecute node server.js para datos reales).', true); }
  setTimeout(loadFlights, next);
}
function drift(o, now) { const d = o.gs*Math.min(300, (now - o.t)/1000); if (d < 1) { o.cl = o.lat; o.co = o.lon; } else [o.cl, o.co] = dest(o.lat, o.lon, o.trk, d); }
function updateAc() {
  const now = Date.now();
  for (const o of ac.values()) { drift(o, now); const show = !milOnly || o.mil;
    if (!o.m) { o.m = L.circleMarker([o.cl, o.co], { renderer: rAc, radius: o.mil ? 4 : 3, weight: 1, color: '#000', fillColor: colorOf(o), fillOpacity: 1, bubblingMouseEvents: false })
      .bindTooltip(acTip(o), { direction: 'top', offset: [0, -4] }).on('click', () => lock(o)); }
    else o.m.setLatLng([o.cl, o.co]);
    if (show && !acLayer.hasLayer(o.m)) acLayer.addLayer(o.m); else if (!show && acLayer.hasLayer(o.m)) acLayer.removeLayer(o.m); }
}
setInterval(updateAc, 1000);

// ---------- ISS
const iss = { s0: null, s1: null, lat: 0, lon: 0, trail: [], ok: false };
const vec = (la, lo) => { const c = Math.cos(la*D2R); return [c*Math.cos(lo*D2R), Math.sin(la*D2R), c*Math.sin(lo*D2R)]; };
const issMk = L.marker([0, 0], { icon: L.divIcon({ className: 'iss-ico', html: '<i></i>ISS', iconSize: [60, 16], iconAnchor: [8, 8] }), zIndexOffset: 1000 }).on('click', () => lock('ISS'));
const issTrail = L.polyline([], { pane: 'track', color: '#7dffa0', weight: 1.5, opacity: .7, interactive: false });
async function loadISS() {
  try { const j = await (await fetch('https://api.wheretheiss.at/v1/satellites/25544')).json();
    const s = { t: j.timestamp*1000, v: vec(j.latitude, j.longitude), alt: j.altitude, vel: j.velocity, vis: j.visibility };
    if (!iss.s1 || s.t > iss.s1.t) { iss.s0 = iss.s1; iss.s1 = s; iss.trail.push([j.latitude, j.longitude]); if (iss.trail.length > 200) iss.trail.shift(); }
    if (!iss.ok) { issMk.addTo(map); issTrail.addTo(map); } iss.ok = true; issTrail.setLatLngs(splitDateline(iss.trail)); } catch { iss.ok = false; }
  setTimeout(loadISS, 5000);
}
function updateISS() {
  if (!iss.s1) return; let v = iss.s1.v; const now = Date.now();
  if (iss.s0) { const k = (now - iss.s1.t)/(iss.s1.t - iss.s0.t); v = iss.s1.v.map((c, i) => c + (c - iss.s0.v[i])*k); }
  const m = Math.hypot(...v); iss.lat = Math.asin(v[1]/m)/D2R; iss.lon = Math.atan2(v[2], v[0])/D2R; issMk.setLatLng([iss.lat, iss.lon]);
}
setInterval(updateISS, 500);

// ---------- Sismos (USGS)
const quakes = new Map(); let quakesLoaded = false;
async function loadQuakes() {
  try { const j = await (await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')).json();
    for (const f of j.features) if (!quakes.has(f.id)) { const [lo, la] = f.geometry.coordinates, p = f.properties, rec = Date.now() - p.time < 3600000;
      L.circleMarker([la, lo], { renderer: rQuake, radius: 3 + p.mag*2, color: rec ? '#ff3b3b' : '#ff9628', weight: 1.5, fillColor: '#ff9628', fillOpacity: .25 })
        .bindTooltip(`SISMO M${p.mag.toFixed(1)}<br>${p.place}<br>${new Date(p.time).toLocaleString()}`, { direction: 'top' }).addTo(map);
      quakes.set(f.id, 1); if (quakesLoaded && p.mag >= 4) log(`SISMO M${p.mag.toFixed(1)} · ${p.place}`, true); }
    quakesLoaded = true; } catch {}
  setTimeout(loadQuakes, 120000);
}

// ---------- Objetivo
const reticle = L.marker([0, 0], { icon: L.divIcon({ className: 'reticle', iconSize: [56, 56] }), interactive: false, zIndexOffset: 2000 });
const trailLine = L.polyline([], { pane: 'track', color: '#ff3b3b', weight: 2, opacity: .65, interactive: false });
const projLine = L.polyline([], { pane: 'track', color: '#ff3b3b', weight: 2, dashArray: '8 6', interactive: false });
const tpos = () => locked.k === 'iss' ? [iss.lat, iss.lon] : [locked.o.cl, locked.o.co];
function lock(o) {
  release(true); const isIss = o === 'ISS';
  locked = { k: isIss ? 'iss' : 'ac', o: isIss ? null : o, trail: [] };
  reticle.addTo(map); if (!isIss) { trailLine.setLatLngs([]).addTo(map); projLine.addTo(map); }
  map.flyTo(tpos(), isIss ? 5 : Math.max(map.getZoom(), 8), { duration: 1.5 });
  $('target').classList.add('locked'); log(`OBJETIVO ADQUIRIDO: ${isIss ? 'ESTACIÓN ESPACIAL INTERNACIONAL' : (o.cs || o.hex)}`, true);
}
function release(silent) { if (!locked) return; locked = null; [reticle, trailLine, projLine].forEach(l => map.removeLayer(l));
  $('target').classList.remove('locked'); $('target').textContent = '[SIN OBJETIVO]\nClic en un punto o use el buscador.'; if (!silent) log('Objetivo liberado.'); }
map.on('dragstart', () => release(true));
$('release').onclick = () => release();
$('mil').onclick = () => { milOnly = !milOnly; $('mil').textContent = milOnly ? 'VER TODOS' : 'SOLO MILITARES'; updateAc(); log(milOnly ? 'Filtro: solo aeronaves militares.' : 'Filtro desactivado.'); };
let lastTrail = 0;
setInterval(() => {
  if (!locked || (locked.k === 'iss' && !iss.s1)) return;
  const p = tpos(), now = Date.now(); reticle.setLatLng(p); if (!map._animatingZoom && !map._panAnim?._inProgress) map.panTo(p, { animate: true, duration: .8, noMoveStart: true });
  if (locked.k === 'ac') { const o = locked.o;
    if (now - lastTrail > 3000) { lastTrail = now; locked.trail.push(p); if (locked.trail.length > 300) locked.trail.shift(); trailLine.setLatLngs(splitDateline(locked.trail.concat([p]))); }
    const pr = []; for (let d = 0; d <= 3e6; d += 1e5) pr.push(dest(o.cl, o.co, o.trk, d)); projLine.setLatLngs(splitDateline(pr)); }
  const ct = nearest(p[0], p[1]), pos = `${p[0].toFixed(4)}, ${p[1].toFixed(4)}`, o = locked.o;
  $('target').textContent = locked.k === 'iss'
    ? `[ESTADO: BLOQUEADO · EN VIVO]\nOBJETO : ESTACIÓN ESPACIAL INT.\nNORAD  : 25544\nALTITUD: ${iss.s1.alt.toFixed(1)} km\nVELOC. : ${Math.round(iss.s1.vel).toLocaleString()} km/h\nPOS    : ${pos}\nVISIBIL: ${iss.s1.vis.toUpperCase()}\nCERCA  : ${ct.c.n} (${Math.round(ct.d/1000)} km)`
    : `[ESTADO: BLOQUEADO · ${o.sim ? 'SIMULADO' : 'EN VIVO'}]\nINDIC. : ${o.cs || '—'}\nHEX    : ${o.hex.toUpperCase()}\nMATRÍC.: ${o.reg || '—'}\nTIPO   : ${o.type || '—'}\nCLASE  : ${o.mil ? 'MILITAR' : 'CIVIL'}\nALTITUD: ${Math.round(o.alt)} m (${Math.round(o.alt*3.281)} ft)\nVELOC. : ${Math.round(o.gs*3.6)} km/h\nRUMBO  : ${Math.round(o.trk)}°\nPOS    : ${pos}\nCERCA  : ${ct.c.n} (${Math.round(ct.d/1000)} km)\nDATO   : hace ${((now - o.t)/1000)|0} s`;
}, 1000);

// ---------- Buscador
async function geocode(q) {
  try { const r = await (await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`)).json(); if (!r.length) return false;
    const [s, n, w, e] = r[0].boundingbox.map(Number); release(true); map.flyToBounds([[s, w], [n, e]], { maxZoom: 18, duration: 2.5 });
    log(`Fijando satélite: ${r[0].display_name.split(',').slice(0, 3).join(',')}`); return true; } catch { return false; }
}
$('search').onsubmit = async e => {
  e.preventDefault(); const raw = $('q').value.trim(), q = norm(raw); if (!q) return; log(`Escaneando red global: "${raw}"...`);
  if (q === 'ISS') return iss.ok ? lock('ISS') : log('ISS sin señal.', true);
  if (q === 'MIL') { if (!milOnly) $('mil').click(); return; }
  if (q === 'TORETTO') { log('DOMINIC TORETTO: sin transpondedor activo. Último avistamiento (ficticio): Los Ángeles.', true); return map.flyTo([34.05, -118.24], 14); }
  if (q.startsWith('CAM ')) { const k = q.slice(4).trim(), c = cams.find(c => norm(c.n).includes(k)); return c ? openCam(c) : log(`Ninguna cámara coincide con "${k}".`, true); }
  for (const o of ac.values()) if (norm(o.cs) === q || o.hex.toUpperCase() === q || (o.reg && norm(o.reg) === q)) return lock(o);
  for (const o of ac.values()) if (o.cs && norm(o.cs).startsWith(q) && q.length >= 3) return lock(o);
  if (!(await geocode(raw))) log(`Sin coincidencias para "${raw}".`, true);
};

// ---------- HUD
map.on('mousemove', e => { $('coords').textContent = `LAT ${e.latlng.lat.toFixed(5)}°  LON ${wrap(e.latlng.lng).toFixed(5)}°  ZOOM ${map.getZoom()}`; });
setInterval(() => {
  let n = 0, m = 0; for (const o of ac.values()) if (!milOnly || o.mil) { n++; if (o.mil) m++; }
  $('stats').textContent = `AERONAVES ${n.toLocaleString()} · MIL ${m} · CÁMARAS ${cams.length.toLocaleString()} · SISMOS ${quakes.size}`;
  $('clock').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const row = (k, ok, v) => `<i class="dot ${ok ? 'ok' : 'bad'}"></i>${k}: ${v}`;
  $('sources').innerHTML = [row('MAPA', true, LAYERS[layerIdx].n), row('CÁMARAS', cams.length > 0, `${cams.length.toLocaleString()} · ${SRC.length} redes`), row('VÍDEO DIRECTO', true, `${nLive.toLocaleString()} (puntos rosas)`),
    row('AERONAVES', flightSrc.ok, flightSrc.ok ? `EN VIVO · ${Math.round((Date.now() - flightSrc.t)/1000)}s` : 'SIMULADO'),
    row('ISS', iss.ok, iss.ok ? 'EN VIVO' : 'SIN SEÑAL'), row('SISMOS', quakesLoaded, quakesLoaded ? 'EN VIVO · USGS 24h' : 'SIN SEÑAL'), row('DÍA / NOCHE', true, 'TIEMPO REAL')].join('\n');
}, 1000);

log(`Ojo de Dios en línea. ${cams.length.toLocaleString()} cámaras públicas indexadas.`);
log('Clic en un punto verde para ver su cámara en vivo. Clic derecho en una calle: vista a pie de calle.');
loadFlights(); loadISS(); loadQuakes(); loadSG(); updateAc(); updateFeeds();
})();
