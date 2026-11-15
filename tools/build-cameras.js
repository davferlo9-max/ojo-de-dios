// Genera cameras.js con cámaras públicas oficiales (tráfico/meteorología). Uso: node tools/build-cameras.js
const fs = require('fs'), path = require('path');
const UA = { 'user-agent': 'Mozilla/5.0 OjoDeDios/1.0', 'accept-encoding': 'gzip' };
const get = async (u, type = 'json') => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(40000) }); if (!r.ok) throw new Error(`${r.status} ${u}`);
  return type === 'json' ? r.json() : type === 'buf' ? Buffer.from(await r.arrayBuffer()) : r.text(); };
const r5 = x => Math.round(+x*1e5)/1e5;
const tag = (xml, t) => (new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml) || [])[1];

const SOURCES = {
  'Londres · TfL JamCams': async () => (await get('https://api.tfl.gov.uk/Place/Type/JamCam')).map(c => {
    const p = Object.fromEntries(c.additionalProperties.map(a => [a.key, a.value]));
    return p.available === 'true' && [c.commonName, c.lat, c.lon, p.imageUrl]; }),
  'Nueva York · NYC DOT': async () => (await get('https://webcams.nyctmc.org/api/cameras')).map(c => c.isOnline === 'true' && [c.name, c.latitude, c.longitude, c.imageUrl]),
  'Finlandia · Digitraffic': async () => (await get('https://tie.digitraffic.fi/api/weathercam/v1/stations')).features.flatMap(f => {
    const ps = (f.properties.presets || []).filter(p => p.inCollection); const [lo, la] = f.geometry.coordinates;
    return ps.length ? [[f.properties.name.replace(/_/g, ' '), la, lo, `https://weathercam.digitraffic.fi/${ps[0].id}.jpg`]] : []; }),
  'Washington · WSDOT': async () => (await get('https://data.wsdot.wa.gov/mobile/Cameras.json')).cameras.items.map(c => [c.title, c.lat, c.lon, c.url]),
  'California · Caltrans': async () => (await Promise.all(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    .map(d => get(`https://cwwp2.dot.ca.gov/data/d${+d}/cctv/cctvStatusD${d}.json`).catch(() => ({ data: [] })))))
    .flatMap(j => j.data.map(({ cctv: c }) => c.inService === 'true' && c.imageData.static.currentImageURL && [c.location.locationName, c.location.latitude, c.location.longitude, c.imageData.static.currentImageURL])),
  'Hong Kong · Transport Dept': async () => (await get('https://static.data.gov.hk/td/traffic-snapshot-images/code/Traffic_Camera_Locations_En.csv', 'buf'))
    .toString('utf16le').replace(/^\uFEFF/, '').split(/\r?\n/).slice(1).map(l => l.split('\t')).map(c => c.length > 8 && [c[3], c[6], c[7], c[8].trim()]),
  'Nueva Zelanda · NZTA': async () => (await get('https://trafficnz.info/service/traffic/rest/4/cameras/all', 'text')).split('<camera>').slice(1).map(x => {
    const la = tag(x, 'latitude'), lo = tag(x, 'longitude'), img = tag(x, 'imageUrl');
    return la && lo && img && [tag(x, 'description') || tag(x, 'name'), la, lo, `https://www.trafficnz.info${img}`]; }),
};

(async () => {
  const src = Object.keys(SOURCES), cams = [];
  for (const [i, name] of src.entries()) {
    try { const rows = (await SOURCES[name]()).filter(r => r && r[3] && isFinite(r[1]) && isFinite(r[2]) && Math.abs(r[1]) > .01);
      rows.forEach(([n, la, lo, u]) => cams.push([i, String(n).trim().slice(0, 80), r5(la), r5(lo), u])); console.log(`${name}: ${rows.length}`); }
    catch (e) { console.warn(`${name}: ERROR ${e.message}`); }
  }
  const out = `// Generado ${new Date().toISOString()} por tools/build-cameras.js. [fuente, nombre, lat, lon, imagen]\nwindow.CAM_SOURCES=${JSON.stringify(src)};\nwindow.CAMS=${JSON.stringify(cams)};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'cameras.js'), out); console.log(`TOTAL ${cams.length} → cameras.js (${(out.length/1024)|0} KB)`);
})();
