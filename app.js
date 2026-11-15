(() => {
const $ = id => document.getElementById(id);
const C = Cesium, D2R = Math.PI/180, ER = 6371000;
const rnd = (a, b) => a + Math.random()*(b - a);
const pick = a => a[(Math.random()*a.length)|0];
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const wrap = x => ((x + 540) % 360) - 180;
const dpr = Math.min(devicePixelRatio || 1, 2);
const API = new URLSearchParams(location.search).get('api') || '';          // backend opcional: ?api=https://mi-servidor
const LOCAL = API || /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);

const log = (msg, alert) => { const d = document.createElement('div'); if (alert) d.className = 'alert';
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; $('log').append(d); while ($('log').children.length > 40) $('log').firstChild.remove(); };

// ---------- Geometría
const dest = (la, lo, trk, dist) => {
  const p = la*D2R, th = trk*D2R, d = dist/ER, sp = Math.sin(p), cp = Math.cos(p), sd = Math.sin(d), cd = Math.cos(d);
  const l2 = Math.asin(sp*cd + cp*sd*Math.cos(th));
  return [l2/D2R, wrap(lo + Math.atan2(Math.sin(th)*sd*cp, cd - sp*Math.sin(l2))/D2R)];
};
const hav = (a, b, c, d) => { const p = Math.sin((c - a)*D2R/2)**2 + Math.cos(a*D2R)*Math.cos(c*D2R)*Math.sin((d - b)*D2R/2)**2; return 2*ER*Math.asin(Math.sqrt(p)); };
const cart = (la, lo, h = 0, out) => C.Cartesian3.fromDegrees(lo, la, h, undefined, out);
const vec = (la, lo) => { const c = Math.cos(la*D2R); return [c*Math.cos(lo*D2R), Math.sin(la*D2R), -c*Math.sin(lo*D2R)]; };

// ---------- Visor (globo con imágenes de satélite reales)
const viewer = new C.Viewer('gl', { baseLayer: false, baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false, infoBox: false, selectionIndicator: false });
const scene = viewer.scene, camera = scene.camera, globe = scene.globe;
globe.enableLighting = true; globe.showGroundAtmosphere = true; globe.baseColor = C.Color.fromCssColorString('#03131b');
scene.skyAtmosphere.show = true; scene.postProcessStages.fxaa.enabled = true;
scene.screenSpaceCameraController.minimumZoomDistance = 30; scene.screenSpaceCameraController.maximumZoomDistance = 6e7;
viewer.screenSpaceEventHandler.removeInputAction(C.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
viewer.clock.currentTime = C.JulianDate.now(); viewer.clock.shouldAnimate = true;      // el Sol sigue la hora real
camera.setView({ destination: cart(20, -30, 2.6e7) });
const overlay = $('overlay'), g2 = overlay.getContext('2d');
function resize() { overlay.width = innerWidth*dpr; overlay.height = innerHeight*dpr; g2.setTransform(dpr, 0, 0, dpr, 0, 0); }
addEventListener('resize', resize); resize();

const LAYERS = [
  { n: 'SATÉLITE', p: () => [
      new C.UrlTemplateImageryProvider({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maximumLevel: 19, credit: 'Imágenes © Esri, Maxar, Earthstar Geographics' }),
      new C.UrlTemplateImageryProvider({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', maximumLevel: 13, credit: 'Etiquetas © Esri' })] },
  { n: 'CALLES', p: () => [new C.UrlTemplateImageryProvider({ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maximumLevel: 19, credit: '© OpenStreetMap contributors' })] },
  { n: 'OSCURO', p: () => [new C.UrlTemplateImageryProvider({ url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', maximumLevel: 18, credit: '© OpenStreetMap, © CARTO' })] }];
let layerIdx = 0;
function setLayer(i) { layerIdx = i; viewer.imageryLayers.removeAll(); LAYERS[i].p().forEach(p => viewer.imageryLayers.addImageryProvider(p)); $('layer').textContent = `CAPA: ${LAYERS[i].n}`; }
$('layer').onclick = () => { setLayer((layerIdx + 1) % LAYERS.length); log(`Capa: ${LAYERS[layerIdx].n}.`); };
setLayer(0);

// ---------- Ciudades (para búsqueda y proximidad)
const CITIES = [['LOS ÁNGELES',34.05,-118.24],['NUEVA YORK',40.71,-74.0],['CHICAGO',41.88,-87.63],['MIAMI',25.76,-80.19],['CIUDAD DE MÉXICO',19.43,-99.13],['LA HABANA',23.11,-82.37],['BOGOTÁ',4.71,-74.07],['LIMA',-12.05,-77.04],['SÃO PAULO',-23.55,-46.63],['BUENOS AIRES',-34.6,-58.38],['SANTIAGO',-33.45,-70.67],['LONDRES',51.51,-0.13],['PARÍS',48.86,2.35],['MADRID',40.42,-3.7],['BERLÍN',52.52,13.4],['ROMA',41.9,12.5],['MOSCÚ',55.76,37.62],['ESTAMBUL',41.01,28.98],['EL CAIRO',30.04,31.24],['LAGOS',6.52,3.38],['NAIROBI',-1.29,36.82],['CIUDAD DEL CABO',-33.92,18.42],['DUBÁI',25.2,55.27],['ABU DABI',24.45,54.38],['TEHERÁN',35.69,51.39],['MUMBAI',19.08,72.88],['NUEVA DELHI',28.61,77.21],['BANGKOK',13.76,100.5],['SINGAPUR',1.35,103.82],['YAKARTA',-6.21,106.85],['HONG KONG',22.32,114.17],['SHANGHÁI',31.23,121.47],['PEKÍN',39.9,116.4],['SEÚL',37.57,126.98],['TOKIO',35.68,139.69],['SÍDNEY',-33.87,151.21],['AUCKLAND',-36.85,174.76],['TBILISI',41.72,44.83],['SANTO DOMINGO',18.49,-69.93]]
  .map(([n, la, lo]) => ({ n, la, lo }));
const nearest = (la, lo) => CITIES.reduce((b, c) => { const d = hav(la, lo, c.la, c.lo); return d < b.d ? { c, d } : b; }, { d: Infinity });

// ---------- Aeronaves
const ac = new Map(), pts = scene.primitives.add(new C.PointPrimitiveCollection());
const COL = { mil: C.Color.fromCssColorString('#ff3b3b'), low: C.Color.fromCssColorString('#ffd23b'), mid: C.Color.fromCssColorString('#19f3ff'), high: C.Color.fromCssColorString('#c0e6ff') };
const colorOf = o => o.mil ? COL.mil : o.alt < 3000 ? COL.low : o.alt < 9000 ? COL.mid : COL.high;
const SCALE = new C.NearFarScalar(2e5, 2.2, 2.5e7, .7);
let flightSrc = { name: '—', t: 0, ok: false }, milOnly = false, locked = null;
const dropAc = (k, o) => { if (o.pp) pts.remove(o.pp); ac.delete(k); };
function applyFlights(list, t, live) {
  if (live) for (const [k, o] of ac) if (o.sim) dropAc(k, o);
  for (const a of list) { let o = ac.get(a.hex); if (!o) { o = { hex: a.hex }; ac.set(a.hex, o); }
    Object.assign(o, { cs: a.cs || '', lat: a.lat, lon: a.lon, alt: a.alt, gs: a.gs, trk: a.trk, mil: !!a.mil, reg: a.reg || '', type: a.type || '', t, sim: !live });
    if (o.pp) o.pp.color = colorOf(o); }
  if (live) { const now = Date.now(); for (const [k, o] of ac) if (now - o.t > 180000) { if (locked && locked.o === o) { log(`SEÑAL PERDIDA: ${o.cs || o.hex}`, true); release(true); } dropAc(k, o); } }
}
function simulate() {
  for (let i = 0; i < 600; i++) { const c = pick(CITIES);
    ac.set('SIM' + i, { hex: 'SIM' + i, cs: 'SIM' + (100 + i), lat: Math.max(-70, Math.min(75, c.la + rnd(-16, 16))), lon: wrap(c.lo + rnd(-24, 24)), alt: rnd(3000, 11500), gs: rnd(190, 260), trk: rnd(0, 360), mil: Math.random() < .04, reg: '', type: 'DEMO', t: Date.now(), sim: true }); }
}
async function loadFlights() {
  let next = 40000;
  if (LOCAL) { try { const j = await (await fetch(`${API}/api/flights`)).json(); if (!j.ac || !j.ac.length) throw 0;
      applyFlights(j.ac.map(a => ({ hex: a[0], cs: a[1], lat: a[2], lon: a[3], alt: a[4], gs: a[5], trk: a[6], mil: a[7], reg: a[8], type: a[9] })), j.t, true);
      flightSrc = { name: 'adsb.lol (servidor)', t: j.t, ok: true }; next = 10000; if (!loadFlights.logged) { loadFlights.logged = 1; log('Enlace ADS-B establecido: adsb.lol.'); } } catch {} }
  if (!flightSrc.ok && !ac.size) { simulate(); log(LOCAL ? 'Servidor ADS-B sin respuesta. Aeronaves SIMULADAS.' : 'Versión web: las redes ADS-B no permiten acceso desde el navegador. Aeronaves SIMULADAS (ejecute node server.js para datos reales).', true); }
  setTimeout(loadFlights, next);
}
const _c = new C.Cartesian3();
function drift(o, now) {
  const d = o.gs*Math.min(300, (now - o.t)/1000)/ER;
  if (d < 1e-9) { o.cl = o.lat; o.co = o.lon; } else { [o.cl, o.co] = dest(o.lat, o.lon, o.trk, d*ER); }
}
function updateAc(now) {
  for (const o of ac.values()) { drift(o, now);
    if (!o.pp) o.pp = pts.add({ id: o, pixelSize: 4, color: colorOf(o), scaleByDistance: SCALE, position: cart(o.cl, o.co, o.alt) });
    else o.pp.position = cart(o.cl, o.co, o.alt, _c);
    o.pp.show = !milOnly || o.mil; }
}

// ---------- ISS
const iss = { s0: null, s1: null, lat: 0, lon: 0, trail: [], ok: false };
async function loadISS() {
  try { const j = await (await fetch('https://api.wheretheiss.at/v1/satellites/25544')).json();
    const s = { t: j.timestamp*1000, v: vec(j.latitude, j.longitude), alt: j.altitude, vel: j.velocity, vis: j.visibility };
    if (!iss.s1 || s.t > iss.s1.t) { iss.s0 = iss.s1; iss.s1 = s; iss.ok = true; iss.trail.push([j.latitude, j.longitude]); if (iss.trail.length > 150) iss.trail.shift(); } } catch { iss.ok = false; }
  setTimeout(loadISS, 5000);
}
function updateISS(now) {
  if (!iss.s1) return; let v = iss.s1.v;
  if (iss.s0) { const k = (now - iss.s1.t)/(iss.s1.t - iss.s0.t); v = iss.s1.v.map((c, i) => c + (c - iss.s0.v[i])*k); }
  const m = Math.hypot(...v); iss.lat = Math.asin(v[1]/m)/D2R; iss.lon = Math.atan2(-v[2], v[0])/D2R;
}
viewer.entities.add({ id: 'iss', show: new C.CallbackProperty(() => iss.ok, false), position: new C.CallbackProperty(() => cart(iss.lat, iss.lon, (iss.s1 ? iss.s1.alt : 420)*1000), false),
  point: { pixelSize: 11, color: C.Color.fromCssColorString('#7dffa0'), outlineColor: C.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: 1e7 },
  label: { text: 'ISS', font: '12px monospace', fillColor: C.Color.fromCssColorString('#7dffa0'), pixelOffset: new C.Cartesian2(14, -4), disableDepthTestDistance: 1e7 } });
viewer.entities.add({ show: new C.CallbackProperty(() => iss.ok, false), polyline: { width: 1.5, arcType: C.ArcType.NONE, material: C.Color.fromCssColorString('#7dffa0').withAlpha(.6),
  positions: new C.CallbackProperty(() => iss.trail.length > 1 ? iss.trail.map(([la, lo]) => cart(la, lo, 420000)) : [], false) } });

// ---------- Sismos
const quakes = new Map(), qpts = scene.primitives.add(new C.PointPrimitiveCollection()), qlab = scene.primitives.add(new C.LabelCollection());
let quakesLoaded = false;
async function loadQuakes() {
  try { const j = await (await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')).json();
    for (const f of j.features) if (!quakes.has(f.id)) { const [lo, la] = f.geometry.coordinates, p = f.properties, base = 5 + p.mag*2.2;
      const pp = qpts.add({ position: cart(la, lo, 0), pixelSize: base, color: C.Color.fromCssColorString('#ff9628').withAlpha(.35), outlineColor: C.Color.fromCssColorString('#ff9628'), outlineWidth: 1.5, id: { quake: p.place } });
      quakes.set(f.id, { la, lo, mag: p.mag, place: p.place, t: p.time, pp, base });
      if (p.mag >= 5) qlab.add({ position: cart(la, lo, 0), text: `M${p.mag.toFixed(1)}`, font: '11px monospace', fillColor: C.Color.fromCssColorString('#ff9628'), pixelOffset: new C.Cartesian2(10, -6), distanceDisplayCondition: new C.DistanceDisplayCondition(0, 2.5e7) });
      if (quakesLoaded && p.mag >= 4) log(`SISMO M${p.mag.toFixed(1)} · ${p.place}`, true); }
    quakesLoaded = true; } catch {}
  setTimeout(loadQuakes, 120000);
}

// ---------- Objetivo
const _enu = new C.Matrix4(), _inv = new C.Matrix4(), _off = new C.Cartesian3();
const targetPos = (now) => locked.k === 'iss' ? cart(iss.lat, iss.lon, (iss.s1.alt)*1000) : (drift(locked.o, now), cart(locked.o.cl, locked.o.co, locked.o.alt));
function lock(o) {
  release(true); const isIss = o === 'ISS';
  locked = { k: isIss ? 'iss' : 'ac', o: isIss ? null : o, trail: [], lt: 0, follow: false, ents: [] };
  const L = locked, now = Date.now(); const tp = targetPos(now), R = isIss ? 2.4e6 : 22000;
  $('target').classList.add('locked'); log(`OBJETIVO ADQUIRIDO: ${isIss ? 'ESTACIÓN ESPACIAL INTERNACIONAL' : (o.cs || o.hex)}`, true);
  if (!isIss) {
    L.ents.push(viewer.entities.add({ polyline: { width: 2, arcType: C.ArcType.NONE, material: COL.mil.withAlpha(.6),
      positions: new C.CallbackProperty(() => L.trail.length ? L.trail.map(([la, lo, h]) => cart(la, lo, h)).concat([targetPos(Date.now())]) : [], false) } }));
    L.ents.push(viewer.entities.add({ polyline: { width: 2, arcType: C.ArcType.NONE, material: new C.PolylineDashMaterialProperty({ color: COL.mil }),
      positions: new C.CallbackProperty(() => { const a = L.o, out = []; for (let d = 0; d <= 4e6; d += 1e5) { const [la, lo] = dest(a.cl, a.co, a.trk, d); out.push(cart(la, lo, a.alt)); } return out; }, false) } }));
  }
  camera.flyToBoundingSphere(new C.BoundingSphere(tp, 1), { duration: 2.4, offset: new C.HeadingPitchRange(0, C.Math.toRadians(-40), R),
    complete: () => { if (locked === L) { startFollow(L, tp); } } });
}
function startFollow(L, tp) { // la cámara orbita al objetivo y lo acompaña mientras se mueve
  L.enu = C.Transforms.eastNorthUpToFixedFrame(tp, undefined, new C.Matrix4()); camera.lookAtTransform(L.enu, C.Matrix4.multiplyByPoint(C.Matrix4.inverseTransformation(L.enu, _inv), camera.positionWC, new C.Cartesian3())); L.follow = true; }
function follow(now) {
  if (!locked || !locked.follow) return;
  const off = C.Matrix4.multiplyByPoint(C.Matrix4.inverseTransformation(locked.enu, _inv), camera.positionWC, _off);
  C.Transforms.eastNorthUpToFixedFrame(targetPos(now), undefined, locked.enu); camera.lookAtTransform(locked.enu, off);
}
function release(silent) {
  if (!locked) return; camera.cancelFlight(); if (locked.follow) camera.lookAtTransform(C.Matrix4.IDENTITY);
  locked.ents.forEach(e => viewer.entities.remove(e)); locked = null; $('target').classList.remove('locked');
  $('target').textContent = '[SIN OBJETIVO]\nClic en un punto o use el buscador.'; if (!silent) log('Objetivo liberado.');
}
$('release').onclick = () => release();
$('mil').onclick = () => { milOnly = !milOnly; $('mil').textContent = milOnly ? 'VER TODOS' : 'SOLO MILITARES'; updateAc(Date.now()); log(milOnly ? 'Filtro: solo aeronaves militares.' : 'Filtro desactivado.'); };
function flyToPlace(la, lo, range) { release(true); camera.flyToBoundingSphere(new C.BoundingSphere(cart(la, lo, 0), 1), { duration: 3, offset: new C.HeadingPitchRange(0, C.Math.toRadians(-50), range) }); }
async function geocode(q) {
  try { const r = await (await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`)).json(); if (!r.length) return false;
    const [s, n, w, e] = r[0].boundingbox.map(Number); release(true);
    camera.flyTo({ destination: C.Rectangle.fromDegrees(w, s, e, n), duration: 3.5 }); log(`Fijando satélite: ${r[0].display_name.split(',').slice(0, 3).join(',')}`); return true; } catch { return false; }
}
$('search').onsubmit = async e => {
  e.preventDefault(); const raw = $('q').value.trim(), q = norm(raw); if (!q) return; log(`Escaneando red global: "${raw}"...`);
  if (q === 'ISS') return iss.ok ? lock('ISS') : log('ISS sin señal.', true);
  if (q === 'MIL') { if (!milOnly) $('mil').click(); return; }
  if (q === 'TORETTO') { log('DOMINIC TORETTO: sin transpondedor activo. Último avistamiento (ficticio): Los Ángeles.', true); return flyToPlace(34.05, -118.24, 40000); }
  for (const o of ac.values()) if (norm(o.cs) === q || o.hex.toUpperCase() === q || (o.reg && norm(o.reg) === q)) return lock(o);
  for (const o of ac.values()) if (norm(o.cs).includes(q)) return lock(o);
  if (!(await geocode(raw))) log(`Sin coincidencias para "${raw}".`, true);
};

// ---------- Interacción
let mouse = null, hover = null, lastPick = 0;
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
const aircraftFrom = p => p && p.id && p.id.hex ? p.id : p && p.id && p.id.id === 'iss' ? 'ISS' : null;
handler.setInputAction(m => { const o = aircraftFrom(scene.pick(m.position, 10, 10)); if (o) lock(o); }, C.ScreenSpaceEventType.LEFT_CLICK);
handler.setInputAction(m => { mouse = m.endPosition;
  const t = performance.now(); if (t - lastPick > 90) { lastPick = t; hover = (locked ? null : aircraftFrom(scene.pick(mouse, 10, 10))); }
  const p = camera.pickEllipsoid(mouse, globe.ellipsoid); if (p) { const g = globe.ellipsoid.cartesianToCartographic(p); $('coords').textContent = `LAT ${(g.latitude/D2R).toFixed(4)}°  LON ${(g.longitude/D2R).toFixed(4)}°  ALT. CÁMARA ${fmtH(camera.positionCartographic.height)}`; }
}, C.ScreenSpaceEventType.MOUSE_MOVE);
const fmtH = h => h < 10000 ? `${Math.round(h)} m` : `${Math.round(h/1000).toLocaleString()} km`;
const toWin = p => scene.cartesianToCanvasCoordinates ? scene.cartesianToCanvasCoordinates(p) : C.SceneTransforms.wgs84ToWindowCoordinates(scene, p);

// ---------- Feeds de cámaras (demostración)
const feeds = [...document.querySelectorAll('.feed')].map(el => ({ g: el.getContext('2d'), w: el.width, h: el.height, p: rnd(0, 9), city: pick(CITIES).n, id: `CAM-${(Math.random()*900 + 100)|0}` }));
function drawFeed(f, t, i) {
  const g = f.g; g.fillStyle = '#021218'; g.fillRect(0, 0, f.w, f.h);
  for (let n = 0; n < 40; n++) { g.fillStyle = `rgba(25,243,255,${Math.random()*.15})`; g.fillRect(Math.random()*f.w, Math.random()*f.h, rnd(2, 30), 1); }
  const x = f.w/2 + Math.sin(t/1500 + f.p)*50, y = f.h/2 + Math.cos(t/2000 + f.p)*8;
  g.fillStyle = '#0a4a55'; g.beginPath(); g.arc(x, y - 8, 13, 0, 7); g.fill(); g.fillRect(x - 22, y + 6, 44, 40);
  const hit = locked && i === 0; g.strokeStyle = g.fillStyle = hit ? '#ff3b3b' : '#19f3ff'; g.lineWidth = 1.5; g.strokeRect(x - 19, y - 24, 38, 34); g.font = '10px monospace';
  g.fillText(hit ? 'OBJETIVO EN ÁREA' : `ROSTRO ${(70 + 25*Math.abs(Math.sin(t/900 + f.p))).toFixed(1)}%`, 6, f.h - 6); g.fillText(`${f.id} · ${f.city} · SIM`, 6, 12);
}

// ---------- Bucle
let tAc = 0, panelT = 0, srcT = 0, fps = 60, last = performance.now(), nShown = 0, nMil = 0;
scene.preRender.addEventListener(() => { const now = Date.now(); updateISS(now); if (now - tAc > 400) { tAc = now; updateAc(now); nShown = 0; nMil = 0; for (const o of ac.values()) if (!milOnly || o.mil) { nShown++; if (o.mil) nMil++; } }
  if (locked && locked.o && locked.o.pp) locked.o.pp.position = cart(locked.o.cl, locked.o.co, locked.o.alt, _c);
  follow(now); });
const quakeAnim = t => { for (const k of quakes.values()) if (Date.now() - k.t < 3600000) k.pp.pixelSize = k.base + 5*(.5 + .5*Math.sin(t/350)); };
function frame(t) {
  const now = Date.now(); fps = .92*fps + .08*(1000/((t - last) || 16)); last = t; quakeAnim(t);
  g2.clearRect(0, 0, innerWidth, innerHeight); g2.font = '11px monospace';
  if (locked && locked.o) { // estela
    if (now - locked.lt > 3000) { locked.lt = now; locked.trail.push([locked.o.cl, locked.o.co, locked.o.alt]); if (locked.trail.length > 300) locked.trail.shift(); } }
  if (locked && (locked.k === 'ac' || iss.s1)) {
    const w = toWin(targetPos(now));
    if (w) { const r = 24 + 3*Math.sin(t/150); g2.strokeStyle = '#ff3b3b'; g2.lineWidth = 2; g2.beginPath();
      for (let i = 0; i < 4; i++) { const a = i*Math.PI/2 + t/1200; g2.moveTo(w.x + Math.cos(a)*r, w.y + Math.sin(a)*r); g2.arc(w.x, w.y, r, a, a + .9); }
      g2.moveTo(w.x - r - 12, w.y); g2.lineTo(w.x - r + 6, w.y); g2.moveTo(w.x + r - 6, w.y); g2.lineTo(w.x + r + 12, w.y); g2.moveTo(w.x, w.y - r - 12); g2.lineTo(w.x, w.y - r + 6); g2.moveTo(w.x, w.y + r - 6); g2.lineTo(w.x, w.y + r + 12); g2.stroke();
      g2.fillStyle = '#ff3b3b'; g2.font = '12px monospace'; g2.fillText(locked.k === 'iss' ? 'ISS' : (locked.o.cs || locked.o.hex), w.x + r + 14, w.y - 4); }
  } else if (hover && hover !== 'ISS') { const w = toWin(cart(hover.cl, hover.co, hover.alt));
    if (w) { g2.strokeStyle = g2.fillStyle = '#19f3ff'; g2.lineWidth = 1; g2.strokeRect(w.x - 9, w.y - 9, 18, 18); g2.fillText(`${hover.cs || hover.hex} · ${Math.round(hover.alt*3.281/100)*100} ft · ${Math.round(hover.gs*3.6)} km/h${hover.mil ? ' · MIL' : ''}`, w.x + 14, w.y + 3); } }
  if (t - panelT > 250) { panelT = t;
    if (locked && (locked.k === 'ac' || iss.s1)) { const tp = targetPos(now), g = globe.ellipsoid.cartesianToCartographic(tp), la = g.latitude/D2R, lo = g.longitude/D2R, ct = nearest(la, lo), pos = `${la.toFixed(4)}, ${lo.toFixed(4)}`;
      const o = locked.o; $('target').textContent = locked.k === 'iss'
        ? `[ESTADO: BLOQUEADO · EN VIVO]\nOBJETO : ESTACIÓN ESPACIAL INT.\nNORAD  : 25544\nALTITUD: ${iss.s1.alt.toFixed(1)} km\nVELOC. : ${Math.round(iss.s1.vel).toLocaleString()} km/h\nPOS    : ${pos}\nVISIBIL: ${iss.s1.vis.toUpperCase()}\nCERCA  : ${ct.c.n} (${Math.round(ct.d/1000)} km)`
        : `[ESTADO: BLOQUEADO · ${o.sim ? 'SIMULADO' : 'EN VIVO'}]\nINDIC. : ${o.cs || '—'}\nHEX    : ${o.hex.toUpperCase()}\nMATRÍC.: ${o.reg || '—'}\nTIPO   : ${o.type || '—'}\nCLASE  : ${o.mil ? 'MILITAR' : 'CIVIL'}\nALTITUD: ${Math.round(o.alt)} m (${Math.round(o.alt*3.281)} ft)\nVELOC. : ${Math.round(o.gs*3.6)} km/h\nRUMBO  : ${Math.round(o.trk)}°\nPOS    : ${pos}\nCERCA  : ${ct.c.n} (${Math.round(ct.d/1000)} km)\nDATO   : hace ${((now - o.t)/1000)|0} s`; }
    $('stats').textContent = `AERONAVES ${nShown.toLocaleString()} · MIL ${nMil} · SISMOS ${quakes.size} · FPS ${fps|0}`;
    $('clock').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'; if (!mouse) $('coords').textContent = `ALT. CÁMARA ${fmtH(camera.positionCartographic.height)}`; }
  if (t - srcT > 1000) { srcT = t; const row = (n, ok, v) => `<i class="dot ${ok ? 'ok' : 'bad'}"></i>${n}: ${v}`;
    $('sources').innerHTML = [row('IMÁGENES', true, LAYERS[layerIdx].n === 'SATÉLITE' ? 'Esri World Imagery' : LAYERS[layerIdx].n),
      row('AERONAVES', flightSrc.ok, flightSrc.ok ? `EN VIVO · ${flightSrc.name} · ${Math.round((now - flightSrc.t)/1000)}s` : 'SIMULADO'),
      row('ISS', iss.ok, iss.ok ? 'EN VIVO · wheretheiss.at' : 'SIN SEÑAL'), row('SISMOS', quakesLoaded, quakesLoaded ? 'EN VIVO · USGS 24h' : 'SIN SEÑAL'),
      row('SOL / TERMINADOR', true, 'TIEMPO REAL')].join('\n'); }
  feeds.forEach((f, i) => drawFeed(f, t, i));
  requestAnimationFrame(frame);
}
log('Ojo de Dios en línea. Sincronizando fuentes...');
loadFlights(); loadISS(); loadQuakes(); requestAnimationFrame(frame);
})();
