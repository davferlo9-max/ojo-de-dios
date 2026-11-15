(() => {
const $ = id => document.getElementById(id);
const D2R = Math.PI/180, ER = 6371000;
const rnd = (a, b) => a + Math.random()*(b - a);
const pick = a => a[(Math.random()*a.length)|0];
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
const dpr = Math.min(devicePixelRatio || 1, 2);
let W, H;

// ---------- Registro
const log = (msg, alert) => { const d = document.createElement('div'); if (alert) d.className = 'alert';
  d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; $('log').append(d); while ($('log').children.length > 40) $('log').firstChild.remove(); };

// ---------- Geometría esférica (lat/lon -> vector, consistente con SphereGeometry de Three)
const vec = (la, lo, r = 1) => { const c = Math.cos(la*D2R); return [r*c*Math.cos(lo*D2R), r*Math.sin(la*D2R), -r*c*Math.sin(lo*D2R)]; };
const dest = (la, lo, trk, dist) => { // punto destino por círculo máximo (dist en metros)
  const p = la*D2R, th = trk*D2R, d = dist/ER, sp = Math.sin(p), cp = Math.cos(p), sd = Math.sin(d), cd = Math.cos(d);
  const l2 = Math.asin(sp*cd + cp*sd*Math.cos(th));
  const o2 = lo*D2R + Math.atan2(Math.sin(th)*sd*cp, cd - sp*Math.sin(l2));
  return [l2/D2R, ((o2/D2R + 540) % 360) - 180];
};
const hav = (a, b, c, d) => { const p = Math.sin((c - a)*D2R/2)**2 + Math.cos(a*D2R)*Math.cos(c*D2R)*Math.sin((d - b)*D2R/2)**2; return 2*ER*Math.asin(Math.sqrt(p)); };

// ---------- Escena 3D
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(dpr); $('gl').append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, .01, 200);
const world = new THREE.Group(); scene.add(world);
const overlay = $('overlay'), g2 = overlay.getContext('2d');

function buildTexture() {
  const w = 4096, h = 2048, c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const X = lo => (lo + 180)/360*w, Y = la => (90 - la)/180*h;
  g.fillStyle = '#03131b'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(25,243,255,.10)'; g.lineWidth = 1; g.beginPath();
  for (let lo = -180; lo <= 180; lo += 15) { g.moveTo(X(lo), 0); g.lineTo(X(lo), h); }
  for (let la = -90; la <= 90; la += 15) { g.moveTo(0, Y(la)); g.lineTo(w, Y(la)); }
  g.stroke();
  const t = WORLD, [sx, sy] = t.transform.scale, [tx, ty] = t.transform.translate;
  const arcs = t.arcs.map(a => { let x = 0, y = 0; return a.map(([dx, dy]) => [(x += dx)*sx + tx, (y += dy)*sy + ty]); });
  const ring = idx => idx.flatMap((i, n) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; return n ? a.slice(1) : a; });
  const land = new Path2D();
  const poly = p => p.forEach(r => ring(r).forEach(([lo, la], n) => n ? land.lineTo(X(lo), Y(la)) : land.moveTo(X(lo), Y(la))));
  for (const gm of t.objects.countries.geometries) gm.type === 'Polygon' ? poly(gm.arcs) : gm.arcs.forEach(poly);
  g.fillStyle = '#0b3a46'; g.fill(land, 'evenodd');
  g.strokeStyle = 'rgba(25,243,255,.8)'; g.lineWidth = 1.5; g.beginPath();   // fronteras y costas
  for (const a of arcs) { if (a.every(p => Math.abs(p[0]) > 179.9)) continue;
    a.forEach(([lo, la], n) => (!n || Math.abs(lo - a[n-1][0]) > 180) ? g.moveTo(X(lo), Y(la)) : g.lineTo(X(lo), Y(la))); }
  g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); return tex;
}
const sunDir = new THREE.Vector3();
function updateSun() { // posición real del Sol: define el terminador día/noche
  const d = new Date(), n = (d - Date.UTC(d.getUTCFullYear(), 0, 0))/864e5, B = 2*Math.PI*(n - 81)/364;
  const eot = 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B);
  const h = d.getUTCHours() + d.getUTCMinutes()/60 + d.getUTCSeconds()/3600;
  sunDir.set(...vec(-23.44*Math.cos(2*Math.PI/365*(n + 10)), -15*(h - 12 + eot/60)));
}
updateSun();
const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
  uniforms: { map: { value: buildTexture() }, sunDir: { value: sunDir } },
  vertexShader: 'varying vec2 vUv; varying vec3 vN; void main(){ vUv=uv; vN=normal; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'uniform sampler2D map; uniform vec3 sunDir; varying vec2 vUv; varying vec3 vN; void main(){ vec3 c=texture2D(map,vUv).rgb; float day=smoothstep(-.12,.2,dot(normalize(vN),sunDir)); gl_FragColor=vec4(c*mix(.28,1.25,day)+vec3(0.,.02,.03)*(1.-day),1.); }' }));
world.add(globe);
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1.07, 64, 48), new THREE.ShaderMaterial({
  vertexShader: 'varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'varying vec3 vN; void main(){ float i=pow(.62-dot(vN,vec3(0.,0.,1.)),3.); gl_FragColor=vec4(.1,.85,1.,1.)*i; }',
  side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })));
{ const p = new Float32Array(3000*3); for (let i = 0; i < 3000; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(60); p.set([v.x, v.y, v.z], i*3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x88ccdd, size: 1.2*dpr, sizeAttenuation: false, opacity: .6, transparent: true }))); }

const MAXAC = 20000, acPos = new Float32Array(MAXAC*3), acCol = new Float32Array(MAXAC*3);
const acGeo = new THREE.BufferGeometry();
acGeo.setAttribute('position', new THREE.BufferAttribute(acPos, 3)); acGeo.setAttribute('color', new THREE.BufferAttribute(acCol, 3));
acGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2);
world.add(new THREE.Points(acGeo, new THREE.PointsMaterial({ size: 2.6*dpr, sizeAttenuation: false, vertexColors: true })));

function resize() { W = innerWidth; H = innerHeight; renderer.setSize(W, H); overlay.width = W*dpr; overlay.height = H*dpr;
  overlay.style.width = W + 'px'; overlay.style.height = H + 'px'; g2.setTransform(dpr, 0, 0, dpr, 0, 0); camera.aspect = W/H; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- Ciudades
const CITIES = [['LOS ÁNGELES',34.05,-118.24],['NUEVA YORK',40.71,-74.0],['CHICAGO',41.88,-87.63],['MIAMI',25.76,-80.19],['CIUDAD DE MÉXICO',19.43,-99.13],['LA HABANA',23.11,-82.37],['BOGOTÁ',4.71,-74.07],['LIMA',-12.05,-77.04],['SÃO PAULO',-23.55,-46.63],['BUENOS AIRES',-34.6,-58.38],['SANTIAGO',-33.45,-70.67],['LONDRES',51.51,-0.13],['PARÍS',48.86,2.35],['MADRID',40.42,-3.7],['BERLÍN',52.52,13.4],['ROMA',41.9,12.5],['MOSCÚ',55.76,37.62],['ESTAMBUL',41.01,28.98],['EL CAIRO',30.04,31.24],['LAGOS',6.52,3.38],['NAIROBI',-1.29,36.82],['CIUDAD DEL CABO',-33.92,18.42],['DUBÁI',25.2,55.27],['ABU DABI',24.45,54.38],['TEHERÁN',35.69,51.39],['MUMBAI',19.08,72.88],['NUEVA DELHI',28.61,77.21],['BANGKOK',13.76,100.5],['SINGAPUR',1.35,103.82],['YAKARTA',-6.21,106.85],['HONG KONG',22.32,114.17],['SHANGHÁI',31.23,121.47],['PEKÍN',39.9,116.4],['SEÚL',37.57,126.98],['TOKIO',35.68,139.69],['SÍDNEY',-33.87,151.21],['AUCKLAND',-36.85,174.76],['TBILISI',41.72,44.83],['SANTO DOMINGO',18.49,-69.93]]
  .map(([n, la, lo]) => ({ n, la, lo }));

// ---------- Datos en vivo
const ac = new Map();                      // aeronaves
let flightSrc = { mode: 'SIMULADO', name: '—', t: 0, ok: false };
const quakes = new Map(); let quakesLoaded = false;
const iss = { s0: null, s1: null, lat: 0, lon: 0, trail: [], ok: false };

function applyFlights(list, t, live) {
  if (live) for (const [k, o] of ac) if (o.sim) ac.delete(k);
  for (const a of list) { let o = ac.get(a.hex); if (!o) { o = { hex: a.hex }; ac.set(a.hex, o); }
    Object.assign(o, { cs: a.cs || '', lat: a.lat, lon: a.lon, alt: a.alt, gs: a.gs, trk: a.trk, mil: !!a.mil, reg: a.reg || '', type: a.type || '', t, sim: !live }); }
  if (live) { const now = Date.now(); for (const [k, o] of ac) if (now - o.t > 180000) { if (locked && locked.o === o) { log(`SEÑAL PERDIDA: ${o.cs || o.hex}`, true); release(true); } ac.delete(k); } }
}
function simulate() {
  for (let i = 0; i < 350; i++) { const c = pick(CITIES), [la, lo] = [c.la + rnd(-14, 14), c.lo + rnd(-20, 20)];
    ac.set('SIM' + i, { hex: 'SIM' + i, cs: 'SIM' + (100 + i), lat: Math.max(-80, Math.min(80, la)), lon: lo, alt: rnd(3000, 11500), gs: rnd(190, 260), trk: rnd(0, 360), mil: Math.random() < .04, reg: '', type: 'DEMO', t: Date.now(), sim: true }); }
}
async function loadFlights() {
  const tries = [];
  if (location.protocol.startsWith('http')) tries.push(async () => {
    const j = await (await fetch('/api/flights')).json(); if (!j.ac || !j.ac.length) throw 0;
    return { name: 'adsb.lol (servidor local)', t: j.t, every: 10000, list: j.ac.map(a => ({ hex: a[0], cs: a[1], lat: a[2], lon: a[3], alt: a[4], gs: a[5], trk: a[6], mil: a[7], reg: a[8], type: a[9] })) }; });
  tries.push(async () => {
    const r = await fetch('https://opensky-network.org/api/states/all'); if (!r.ok) throw r.status; const j = await r.json(); const t = Date.now();
    return { name: 'OpenSky Network', t, every: 60000, list: j.states.filter(s => !s[8] && s[5] != null && s[6] != null).map(s => ({ hex: s[0], cs: (s[1] || '').trim(), lat: s[6], lon: s[5], alt: s[13] || s[7] || 0, gs: s[9] || 0, trk: s[10] || 0, mil: 0, reg: '', type: '' })) }; });
  let next = 30000;
  for (const f of tries) { try { const r = await f(); applyFlights(r.list, r.t, true); flightSrc = { mode: 'EN VIVO', name: r.name, t: r.t, ok: true }; next = r.every; break; } catch {} }
  if (!flightSrc.ok && !ac.size) { simulate(); log('Sin acceso a la red ADS-B. Modo SIMULADO activo (ejecute `node server.js` para datos reales).', true); }
  else if (flightSrc.ok && !loadFlights.logged) { loadFlights.logged = 1; log(`Enlace ADS-B establecido: ${flightSrc.name}.`); }
  setTimeout(loadFlights, next);
}
async function loadISS() {
  try { const j = await (await fetch('https://api.wheretheiss.at/v1/satellites/25544')).json();
    const s = { t: j.timestamp*1000, v: vec(j.latitude, j.longitude), alt: j.altitude, vel: j.velocity, vis: j.visibility };
    if (!iss.s1 || s.t > iss.s1.t) { iss.s0 = iss.s1; iss.s1 = s; iss.ok = true; iss.trail.push([j.latitude, j.longitude]); if (iss.trail.length > 120) iss.trail.shift(); } } catch { iss.ok = false; }
  setTimeout(loadISS, 5000);
}
async function loadQuakes() {
  try { const j = await (await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')).json();
    for (const f of j.features) if (!quakes.has(f.id)) { const [lo, la] = f.geometry.coordinates, p = f.properties;
      quakes.set(f.id, { la, lo, mag: p.mag, place: p.place, t: p.time });
      if (quakesLoaded && p.mag >= 4) log(`SISMO M${p.mag.toFixed(1)} · ${p.place}`, true); }
    quakesLoaded = true; } catch {}
  setTimeout(loadQuakes, 120000);
}

// ---------- Cámara y controles
let clat = 25, clon = -40, dist = 3, tdist = 2.8, drag = null, locked = null, anim = null, milOnly = false, mouse = null;
const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0);
const wrap = x => ((x + 540) % 360) - 180;
overlay.addEventListener('wheel', e => { e.preventDefault(); tdist = Math.min(4.5, Math.max(1.06, 1 + (tdist - 1)*(e.deltaY < 0 ? .88 : 1.14))); }, { passive: false });
overlay.addEventListener('mousedown', e => drag = { x: e.clientX, y: e.clientY, moved: false });
addEventListener('mouseup', e => { if (drag && !drag.moved) { const o = pickAt(e.clientX, e.clientY); if (o) lock(o); } drag = null; });
addEventListener('mousemove', e => {
  mouse = [e.clientX, e.clientY];
  if (!drag) return;
  if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) drag.moved = true;
  if (drag.moved) { release(true); anim = null; const k = 47.5*(dist - 1)/H;
    clon = wrap(clon - (e.clientX - drag.x)*k); clat = Math.max(-85, Math.min(85, clat + (e.clientY - drag.y)*k)); drag.x = e.clientX; drag.y = e.clientY; }
});
const _v = new THREE.Vector3();
function scr(la, lo, r, out) {
  const c = Math.cos(la*D2R); _v.set(r*c*Math.cos(lo*D2R), r*Math.sin(la*D2R), -r*c*Math.sin(lo*D2R)).applyQuaternion(world.quaternion);
  if (_v.dot(camera.position) < 1) return false;
  _v.project(camera); out[0] = (_v.x + 1)/2*W; out[1] = (1 - _v.y)/2*H; return true;
}
function flyTo(la, lo, d) { release(true); const a = { la: clat, lo: clon, d: tdist }, dl = wrap(lo - clon), t0 = performance.now();
  anim = { t0, f: p => { clat = a.la + (la - a.la)*p; clon = wrap(a.lo + dl*p); tdist = a.d + (d - a.d)*p; } }; }
const pickBuf = [0, 0];
function pickAt(sx, sy) {
  let best = null, bd = 12;
  for (const o of ac.values()) { if (milOnly && !o.mil) continue; if (!scr(o.cl, o.co, 1.003, pickBuf)) continue;
    const d = Math.hypot(pickBuf[0] - sx, pickBuf[1] - sy); if (d < bd) { bd = d; best = o; } }
  if (iss.ok && scr(iss.lat, iss.lon, 1.064, pickBuf) && Math.hypot(pickBuf[0] - sx, pickBuf[1] - sy) < 16) return 'ISS';
  return best;
}

// ---------- Objetivo
function lock(o) { locked = o === 'ISS' ? { k: 'iss' } : { k: 'ac', o, trail: [], lt: 0 }; tdist = Math.min(tdist, 1.5); anim = null; $('target').classList.add('locked');
  log(`OBJETIVO ADQUIRIDO: ${o === 'ISS' ? 'ESTACIÓN ESPACIAL INTERNACIONAL' : (o.cs || o.hex)}`, true); }
function release(silent) { if (!locked) return; locked = null; $('target').classList.remove('locked'); $('target').textContent = '[SIN OBJETIVO]\nClic en un punto o use el buscador.'; if (!silent) log('Objetivo liberado.'); }
$('release').onclick = () => release();
$('mil').onclick = () => { milOnly = !milOnly; $('mil').textContent = milOnly ? 'VER TODOS' : 'SOLO MILITARES'; log(milOnly ? 'Filtro: solo aeronaves militares.' : 'Filtro desactivado.'); };
$('search').onsubmit = e => {
  e.preventDefault(); const q = norm($('q').value.trim()); if (!q) return; log(`Escaneando red global: "${q}"...`);
  if (q === 'ISS') return iss.ok ? lock('ISS') : log('ISS sin señal.', true);
  if (q === 'MIL') { if (!milOnly) $('mil').click(); return; }
  if (q === 'TORETTO') { log('DOMINIC TORETTO: sin transpondedor activo. Último avistamiento (simulado): Los Ángeles.', true); return flyTo(34.05, -118.24, 1.3); }
  let hit = null; for (const o of ac.values()) if (norm(o.cs).includes(q) || o.hex.toUpperCase() === q || norm(o.reg).includes(q)) { hit = o; break; }
  if (hit) return setTimeout(() => lock(hit), 400);
  const city = CITIES.find(c => norm(c.n).includes(q));
  if (city) { log(`Fijando satélite sobre ${city.n}.`); return flyTo(city.la, city.lo, 1.25); }
  log(`Sin coincidencias para "${q}".`, true);
};
const nearest = (la, lo) => CITIES.reduce((b, c) => { const d = hav(la, lo, c.la, c.lo); return d < b.d ? { c, d } : b; }, { d: Infinity });

// ---------- Feeds (demostración)
const feeds = [...document.querySelectorAll('.feed')].map(el => ({ g: el.getContext('2d'), w: el.width, h: el.height, p: rnd(0, 9), city: pick(CITIES).n, id: `CAM-${(Math.random()*900 + 100)|0}` }));
function drawFeed(f, t, i) {
  const g = f.g; g.fillStyle = '#021218'; g.fillRect(0, 0, f.w, f.h);
  for (let n = 0; n < 40; n++) { g.fillStyle = `rgba(25,243,255,${Math.random()*.15})`; g.fillRect(Math.random()*f.w, Math.random()*f.h, rnd(2, 30), 1); }
  const x = f.w/2 + Math.sin(t/1500 + f.p)*50, y = f.h/2 + Math.cos(t/2000 + f.p)*8;
  g.fillStyle = '#0a4a55'; g.beginPath(); g.arc(x, y - 8, 13, 0, 7); g.fill(); g.fillRect(x - 22, y + 6, 44, 40);
  const hit = locked && i === 0; g.strokeStyle = g.fillStyle = hit ? '#ff3b3b' : '#19f3ff'; g.lineWidth = 1.5; g.strokeRect(x - 19, y - 24, 38, 34); g.font = '10px monospace';
  g.fillText(hit ? 'OBJETIVO EN ÁREA' : `ROSTRO ${(70 + 25*Math.abs(Math.sin(t/900 + f.p))).toFixed(1)}%`, 6, f.h - 6);
  g.fillText(`${f.id} · ${f.city} · SIM`, 6, 12);
}

// ---------- Bucle principal
let last = performance.now(), fps = 60, sunT = 0, panelT = 0, srcT = 0, count = 0, milCount = 0;
function frame(t) {
  const now = Date.now(), dt = t - last; fps = .92*fps + .08*(1000/(dt || 16)); last = t;
  // animaciones de cámara
  if (anim) { const p = Math.min(1, (t - anim.t0)/1500), e = p*p*(3 - 2*p); anim.f(e); if (p >= 1) anim = null; }
  // ISS extrapolada
  if (iss.s1) { let v = iss.s1.v; if (iss.s0) { const k = (now - iss.s1.t)/(iss.s1.t - iss.s0.t); v = iss.s1.v.map((c, i) => c + (c - iss.s0.v[i])*k); }
    const m = Math.hypot(...v); iss.lat = Math.asin(v[1]/m)/D2R; iss.lon = Math.atan2(-v[2], v[0])/D2R; }
  // aeronaves: navegación por estima entre actualizaciones
  let n = 0, mc = 0;
  for (const o of ac.values()) {
    const d = o.gs*Math.min(300, (now - o.t)/1000)/ER;
    if (d < 1e-9) { o.cl = o.lat; o.co = o.lon; } else { const p = o.lat*D2R, th = o.trk*D2R, sp = Math.sin(p), cp = Math.cos(p), sd = Math.sin(d), cd = Math.cos(d);
      const l2 = Math.asin(sp*cd + cp*sd*Math.cos(th)); o.cl = l2/D2R; o.co = wrap(o.lon + Math.atan2(Math.sin(th)*sd*cp, cd - sp*Math.sin(l2))/D2R); }
    if (o.mil) mc++;
    if (milOnly && !o.mil) continue; if (n >= MAXAC) continue;
    const c = Math.cos(o.cl*D2R), r = 1.002 + o.alt*5e-7, i = n*3;
    acPos[i] = r*c*Math.cos(o.co*D2R); acPos[i+1] = r*Math.sin(o.cl*D2R); acPos[i+2] = -r*c*Math.sin(o.co*D2R);
    if (o.mil) { acCol[i] = 1; acCol[i+1] = .2; acCol[i+2] = .2; } else if (o.alt < 3000) { acCol[i] = 1; acCol[i+1] = .82; acCol[i+2] = .23; }
    else if (o.alt < 9000) { acCol[i] = .1; acCol[i+1] = .95; acCol[i+2] = 1; } else { acCol[i] = .75; acCol[i+1] = .9; acCol[i+2] = 1; }
    n++;
  }
  count = n; milCount = mc; acGeo.setDrawRange(0, n); acGeo.attributes.position.needsUpdate = acGeo.attributes.color.needsUpdate = true;
  // seguimiento del objetivo
  let tgt = null;
  if (locked) { tgt = locked.k === 'iss' ? { cl: iss.lat, co: iss.lon, r: 1.064 } : { cl: locked.o.cl, co: locked.o.co, r: 1.003 };
    clat += (tgt.cl - clat)*.08; clon = wrap(clon + wrap(tgt.co - clon)*.08);
    if (locked.k === 'ac' && now - locked.lt > 4000) { locked.lt = now; locked.trail.push([tgt.cl, tgt.co]); if (locked.trail.length > 200) locked.trail.shift(); } }
  dist += (tdist - dist)*.12;
  if (t - sunT > 30000) { sunT = t; updateSun(); }
  camera.position.set(0, 0, dist);
  world.quaternion.copy(qx.setFromAxisAngle(AX, clat*D2R).multiply(qy.setFromAxisAngle(AY, -(90 + clon)*D2R)));
  renderer.render(scene, camera);

  // ----- Overlay 2D
  g2.clearRect(0, 0, W, H); const p = [0, 0], q2 = [0, 0]; g2.font = '10px monospace';
  for (const c of CITIES) if (scr(c.la, c.lo, 1, p)) { g2.strokeStyle = g2.fillStyle = '#19f3ff'; g2.globalAlpha = .8; g2.strokeRect(p[0] - 2.5, p[1] - 2.5, 5, 5); if (dist < 2.6) g2.fillText(c.n, p[0] + 7, p[1] + 3); g2.globalAlpha = 1; }
  for (const k of quakes.values()) if (scr(k.la, k.lo, 1.001, p)) { const rec = now - k.t < 3600000, ph = rec ? (t/900 % 1) : 0.4, rad = 3 + k.mag*1.6*(.5 + ph);
    g2.strokeStyle = `rgba(255,150,40,${rec ? 1 - ph : .6})`; g2.lineWidth = 1.2; g2.beginPath(); g2.arc(p[0], p[1], rad, 0, 7); g2.stroke();
    if (k.mag >= 5 && dist < 3) { g2.fillStyle = '#ff9628'; g2.fillText(`M${k.mag.toFixed(1)}`, p[0] + rad + 3, p[1] + 3); } }
  if (iss.ok) { // traza real de la ISS + marcador
    g2.strokeStyle = 'rgba(120,255,160,.6)'; g2.lineWidth = 1; g2.beginPath(); let pen = false;
    for (const [la, lo] of iss.trail) { if (scr(la, lo, 1.064, p)) { pen ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]); pen = true; } else pen = false; } g2.stroke();
    if (scr(iss.lat, iss.lon, 1.064, p)) { g2.strokeStyle = g2.fillStyle = '#7dffa0'; g2.beginPath(); g2.moveTo(p[0], p[1] - 7); g2.lineTo(p[0] + 7, p[1]); g2.lineTo(p[0], p[1] + 7); g2.lineTo(p[0] - 7, p[1]); g2.closePath(); g2.stroke(); g2.fillText('ISS', p[0] + 10, p[1] + 3); } }
  if (locked && tgt) {
    if (locked.k === 'ac') { const o = locked.o; // estela real + proyección por círculo máximo
      g2.lineWidth = 1.5; g2.strokeStyle = 'rgba(255,59,59,.55)'; g2.beginPath(); let pen = false;
      for (const [la, lo] of locked.trail.concat([[tgt.cl, tgt.co]])) { if (scr(la, lo, 1.003, p)) { pen ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]); pen = true; } else pen = false; } g2.stroke();
      g2.setLineDash([6, 5]); g2.strokeStyle = '#ff3b3b'; g2.beginPath(); pen = false;
      for (let d = 0; d <= 4000000; d += 80000) { const [la, lo] = dest(tgt.cl, tgt.co, o.trk, d); if (scr(la, lo, 1.003, p)) { pen ? g2.lineTo(p[0], p[1]) : g2.moveTo(p[0], p[1]); pen = true; } else pen = false; }
      g2.stroke(); g2.setLineDash([]); }
    if (scr(tgt.cl, tgt.co, tgt.r, p)) { const r = 22 + 3*Math.sin(t/150); g2.strokeStyle = '#ff3b3b'; g2.lineWidth = 2; g2.beginPath();
      for (let i = 0; i < 4; i++) { const a = i*Math.PI/2 + t/1200; g2.moveTo(p[0] + Math.cos(a)*r, p[1] + Math.sin(a)*r); g2.arc(p[0], p[1], r, a, a + .9); }
      g2.moveTo(p[0] - r - 12, p[1]); g2.lineTo(p[0] - r + 6, p[1]); g2.moveTo(p[0] + r - 6, p[1]); g2.lineTo(p[0] + r + 12, p[1]); g2.moveTo(p[0], p[1] - r - 12); g2.lineTo(p[0], p[1] - r + 6); g2.moveTo(p[0], p[1] + r - 6); g2.lineTo(p[0], p[1] + r + 12); g2.stroke();
      g2.fillStyle = '#ff3b3b'; g2.font = '12px monospace'; g2.fillText(locked.k === 'iss' ? 'ISS' : (locked.o.cs || locked.o.hex), p[0] + r + 14, p[1] - 4); }
  } else if (mouse && !drag) { const o = pickAt(mouse[0], mouse[1]);
    if (o && o !== 'ISS' && scr(o.cl, o.co, 1.003, p)) { g2.strokeStyle = g2.fillStyle = '#19f3ff'; g2.lineWidth = 1; g2.strokeRect(p[0] - 9, p[1] - 9, 18, 18); g2.font = '11px monospace'; g2.fillText(`${o.cs || o.hex} · ${Math.round(o.alt*3.281/100)*100} ft · ${Math.round(o.gs*3.6)} km/h`, p[0] + 14, p[1] + 3); } }
  // ----- Paneles (limitados)
  if (t - panelT > 250) { panelT = t;
    if (locked) { const age = ((now - (locked.k === 'ac' ? locked.o.t : iss.s1.t))/1000)|0, ct = nearest(tgt.cl, tgt.co);
      const pos = `${tgt.cl.toFixed(4)}, ${tgt.co.toFixed(4)}`;
      $('target').textContent = locked.k === 'iss'
        ? `[ESTADO: BLOQUEADO · EN VIVO]\nOBJETO : ESTACIÓN ESPACIAL INT.\nNORAD  : 25544\nALTITUD: ${iss.s1.alt.toFixed(1)} km\nVELOC. : ${Math.round(iss.s1.vel).toLocaleString()} km/h\nPOS    : ${pos}\nVISIBIL: ${iss.s1.vis.toUpperCase()}\nCERCA  : ${ct.c.n} (${Math.round(ct.d/1000)} km)`
        : `[ESTADO: BLOQUEADO · ${locked.o.sim ? 'SIMULADO' : 'EN VIVO'}]\nINDIC. : ${locked.o.cs || '—'}\nHEX    : ${locked.o.hex.toUpperCase()}\nMATRÍC.: ${locked.o.reg || '—'}\nTIPO   : ${locked.o.type || '—'}\nCLASE  : ${locked.o.mil ? 'MILITAR' : 'CIVIL'}\nALTITUD: ${Math.round(locked.o.alt)} m (${Math.round(locked.o.alt*3.281)} ft)\nVELOC. : ${Math.round(locked.o.gs*3.6)} km/h\nRUMBO  : ${Math.round(locked.o.trk)}°\nPOS    : ${pos}\nCERCA  : ${ct.c.n} (${Math.round(ct.d/1000)} km)\nDATO   : hace ${age} s`; }
    $('stats').textContent = `AERONAVES ${count.toLocaleString()} · MIL ${milCount} · SISMOS ${quakes.size} · FPS ${fps|0}`;
    $('clock').textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    if (mouse) { /* coordenadas bajo el cursor no aplican en 3D; mostramos el centro de la vista */ }
    $('coords').textContent = `CENTRO ${clat.toFixed(2)}°, ${clon.toFixed(2)}° · ALT. ORBITAL ${((dist - 1)*6371).toFixed(0)} km`; }
  if (t - srcT > 1000) { srcT = t; const row = (n, ok, v) => `<span class="${ok ? 'ok' : 'bad'}">●</span> ${n}: ${v}`;
    $('sources').innerHTML = [row('AERONAVES', flightSrc.ok, flightSrc.ok ? `EN VIVO · ${flightSrc.name} · ${Math.round((Date.now() - flightSrc.t)/1000)}s` : 'SIMULADO'),
      row('ISS', iss.ok, iss.ok ? 'EN VIVO · wheretheiss.at' : 'SIN SEÑAL'), row('SISMOS', quakesLoaded, quakesLoaded ? 'EN VIVO · USGS 24h' : 'SIN SEÑAL'),
      row('SOL / TERMINADOR', true, 'CÁLCULO EN TIEMPO REAL')].join('\n'); }
  feeds.forEach((f, i) => drawFeed(f, t, i));
  requestAnimationFrame(frame);
}
log('Ojo de Dios en línea. Sincronizando fuentes...');
loadFlights(); loadISS(); loadQuakes();
requestAnimationFrame(frame);
})();
