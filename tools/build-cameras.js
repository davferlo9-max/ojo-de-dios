// Genera cameras.js con cámaras públicas oficiales (tráfico/meteorología). Uso: node tools/build-cameras.js
const fs = require('fs'), path = require('path');
const UA = { 'user-agent': 'Mozilla/5.0 OjoDeDios/1.0', 'accept-encoding': 'gzip' };
const get = async (u, type = 'json') => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(40000) }); if (!r.ok) throw new Error(`${r.status} ${u}`);
  return type === 'json' ? r.json() : type === 'buf' ? Buffer.from(await r.arrayBuffer()) : r.text(); };
const r5 = x => Math.round(+x*1e5)/1e5;
const tag = (xml, t) => (new RegExp(`<${t}>([^<]*)</${t}>`).exec(xml) || [])[1];

// UTM (ETRS89) -> lat/lon WGS84, suficiente para posicionar cámaras
function utm2ll(E, N, zone = 30) {
  const a = 6378137, f = 1/298.257222101, e2 = f*(2 - f), k0 = .9996, ep2 = e2/(1 - e2), x = E - 500000, M = N/k0;
  const mu = M/(a*(1 - e2/4 - 3*e2**2/64 - 5*e2**3/256)), e1 = (1 - Math.sqrt(1 - e2))/(1 + Math.sqrt(1 - e2));
  const p = mu + (3*e1/2 - 27*e1**3/32)*Math.sin(2*mu) + (21*e1**2/16 - 55*e1**4/32)*Math.sin(4*mu) + (151*e1**3/96)*Math.sin(6*mu);
  const C = ep2*Math.cos(p)**2, T = Math.tan(p)**2, Nn = a/Math.sqrt(1 - e2*Math.sin(p)**2), R = a*(1 - e2)/(1 - e2*Math.sin(p)**2)**1.5, D = x/(Nn*k0);
  const lat = p - (Nn*Math.tan(p)/R)*(D**2/2 - (5 + 3*T + 10*C - 4*C**2 - 9*ep2)*D**4/24 + (61 + 90*T + 298*C + 45*T**2 - 252*ep2 - 3*C**2)*D**6/720);
  const lon = (D - (1 + 2*T + C)*D**3/6 + (5 - 2*C + 28*T - 3*C**2 + 8*ep2 + 24*T**2)*D**5/120)/Math.cos(p);
  return [lat*180/Math.PI, (zone*6 - 183) + lon*180/Math.PI];
}
const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

const SOURCES = {
  'España · DGT': async () => (await get('https://nap.dgt.es/datex2/v3/dgt/DevicePublication/camaras_datex2_v36.xml', 'text')).split('<ns2:device ').slice(1).map(x => {
    const u = tag(x, 'fse:deviceUrl'), la = tag(x, 'loc:latitude'), lo = tag(x, 'loc:longitude');
    const name = [tag(x, 'loc:roadName'), tag(x, 'lse:kilometerPoint') && `km ${tag(x, 'lse:kilometerPoint')}`, tag(x, 'loc:roadDestination') && `→ ${tag(x, 'loc:roadDestination')}`, tag(x, 'lse:province') && `(${tag(x, 'lse:province')})`].filter(Boolean).join(' ');
    return u && la && lo && [name || 'Cámara DGT', la, lo, u]; }),
  'Madrid · Ayuntamiento': async () => (await get('https://datos.madrid.es/egob/catalogo/202088-0-trafico-camaras.kml', 'text')).split('<Placemark>').slice(1).map(x => {
    const img = (/img src=([^\s>]+)/.exec(decode(x)) || [])[1], c = (tag(x, 'coordinates') || '').trim().split(',');
    return img && c.length > 1 && [`MADRID · ${(/<Data name="Nombre">\s*<Value>([^<]*)/.exec(x) || [])[1] || 'Cámara'}`, c[1], c[0], img.replace(/\?.*$/, '')]; }),
  'Euskadi · Tráfico': async () => { const out = [];
    for (let p = 1, n = 1; p <= n; p++) { const j = await get(`https://api.euskadi.eus/traffic/v1.0/cameras?_page=${p}`); n = j.totalPages;
      for (const c of j.cameras) if (c.urlImage) { const [la, lo] = utm2ll(+c.longitude, +c.latitude); out.push([`${c.cameraName}${c.road ? ' · ' + c.road : ''}`, la, lo, c.urlImage.replace(/^https?:\/\/www\.bizkaimove\.com/, 'https://www.bizkaimove.eus')]); } }
    return out; },
  'Cataluña · SCT': async () => (await get('https://www.gencat.cat/transit/opendata/cameres.xml', 'text')).split('<gml:featureMember>').slice(1).map(x => {
    const c = (/<gml:coordinates[^>]*>([^<]+)/.exec(x) || [])[1], u = tag(x, 'cite:link'); if (!c || !u) return null; const [lo, la] = c.split(',');
    return [`${tag(x, 'cite:carretera')} · ${tag(x, 'cite:municipi')} km ${tag(x, 'cite:pk')}`, la, lo, decode(u).replace(/^http:/, 'https:')]; }),
  'Londres · TfL JamCams': async () => (await get('https://api.tfl.gov.uk/Place/Type/JamCam')).map(c => {
    const p = Object.fromEntries(c.additionalProperties.map(a => [a.key, a.value]));
    return p.available === 'true' && [c.commonName, c.lat, c.lon, p.imageUrl, p.videoUrl || undefined]; }),
  'Nueva York · NYC DOT': async () => (await get('https://webcams.nyctmc.org/api/cameras')).map(c => c.isOnline === 'true' && [c.name, c.latitude, c.longitude, c.imageUrl]),
  'Finlandia · Digitraffic': async () => (await get('https://tie.digitraffic.fi/api/weathercam/v1/stations')).features.flatMap(f => {
    const ps = (f.properties.presets || []).filter(p => p.inCollection); const [lo, la] = f.geometry.coordinates;
    return ps.length ? [[f.properties.name.replace(/_/g, ' '), la, lo, `https://weathercam.digitraffic.fi/${ps[0].id}.jpg`]] : []; }),
  'Washington · WSDOT': async () => (await get('https://data.wsdot.wa.gov/mobile/Cameras.json')).cameras.items.map(c => [c.title, c.lat, c.lon, c.url]),
  'California · Caltrans': async () => (await Promise.all(Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
    .map(d => get(`https://cwwp2.dot.ca.gov/data/d${+d}/cctv/cctvStatusD${d}.json`).catch(() => ({ data: [] })))))
    .flatMap(j => j.data.map(({ cctv: c }) => c.inService === 'true' && c.imageData.static.currentImageURL && [c.location.locationName, c.location.latitude, c.location.longitude, c.imageData.static.currentImageURL, c.imageData.streamingVideoURL || undefined])),
  'Iowa · Iowa DOT': async () => (await get('https://services.arcgis.com/8lRhdTsQyJpO52F1/arcgis/rest/services/Traffic_Cameras_View/FeatureServer/0/query?where=1%3D1&outFields=Desc_,ImageURL,VideoURL&outSR=4326&f=json')).features
    .map(({ attributes: a, geometry: g }) => g && a.ImageURL && [a.Desc_, g.y, g.x, a.ImageURL, a.VideoURL || undefined]),
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
      rows.forEach(([n, la, lo, u, v]) => cams.push(v ? [i, String(n).trim().slice(0, 80), r5(la), r5(lo), u, v] : [i, String(n).trim().slice(0, 80), r5(la), r5(lo), u])); console.log(`${name}: ${rows.length}`); }
    catch (e) { console.warn(`${name}: ERROR ${e.message}`); }
  }
  const out = `// Generado ${new Date().toISOString()} por tools/build-cameras.js. [fuente, nombre, lat, lon, imagen, vídeo?]\nwindow.CAM_SOURCES=${JSON.stringify(src)};\nwindow.CAMS=${JSON.stringify(cams)};\n`;
  fs.writeFileSync(path.join(__dirname, '..', 'cameras.js'), out); console.log(`TOTAL ${cams.length} → cameras.js (${(out.length/1024)|0} KB)`);
})();
