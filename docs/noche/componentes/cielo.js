(() => {
// Reusable local sky: gradient background, batched celestial bodies, cloud volumes
// and translucent aurora curtains. No engine changes or entity per star/cloud.
const params = new URLSearchParams(location.search);
const presets = ['amanecer', 'dia', 'atardecer', 'noche', 'aurora'];
let preset = presets.includes(params.get('preset')) ? params.get('preset') : 'amanecer';
let animated = params.get('animar') !== '0';
const root = hiperspace.dimention;
const TAU = Math.PI * 2;
let night = preset === 'noche' || preset === 'aurora';
let sunAz = night ? -0.55 : 0.55;
let sunAlt = night ? 0.48 : preset === 'dia' ? 0.63 : preset === 'amanecer' ? 0.18 : 0.12;
function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.pow(v / 255, 2.2)); }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function hash(i) { let h = Math.imul(i + 21, 374761393); h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967296; }
function geometry() { return { positions: [], colors: [] }; }
function triangle(g, a, b, c, ca, cb = ca, cc = ca, aa = 1, ab = aa, ac = aa) {
  g.positions.push(...a, ...b, ...c);
  g.colors.push(...ca, aa, ...cb, ab, ...cc, ac);
}
function sphere(lat, lon, r) { return [r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.cos(lon)]; }
function basis(az, alt, radius) {
  return { center: sphere(alt, az, radius), right: [Math.cos(az), 0, Math.sin(az)], up: [-Math.sin(alt) * Math.sin(az), Math.cos(alt), Math.sin(alt) * Math.cos(az)] };
}
function point(b, x, y) { return b.center.map((v, k) => v + b.right[k] * x + b.up[k] * y); }
function disk(g, az, alt, radius, size, color, alpha = 1, segments = 48, outerAlpha = alpha) {
  const b = basis(az, alt, radius);
  for (let i = 0; i < segments; i++) {
    const a = i / segments * TAU, c = (i + 1) / segments * TAU;
    triangle(g, b.center, point(b, Math.cos(a) * size, Math.sin(a) * size), point(b, Math.cos(c) * size, Math.sin(c) * size), color, color, color, alpha, outerAlpha, outerAlpha);
  }
}
function celestial() {
  const g = geometry();
  if (night) {
    for (let i = 0; i < 700; i++) {
      const az = hash(i * 5) * TAU, alt = Math.asin(0.035 + hash(i * 5 + 1) * 0.96);
      if (Math.abs(az - (sunAz + TAU)) < 0.07 && Math.abs(alt - sunAlt) < 0.07) continue;
      const size = 0.12 + Math.pow(hash(i * 5 + 2), 3) * 0.60;
      const color = mix(rgb('#9EC9FF'), rgb('#FFF1D4'), hash(i * 5 + 3));
      disk(g, az, alt, 430, size, color, 0.48 + hash(i * 5 + 4) * 0.52, 4);
      if (size > 0.63) disk(g, az, alt, 429, size * 3, color, 0.16, 12, 0);
    }
  }
  const color = rgb(night ? '#EAF3FF' : preset === 'dia' ? '#FFFBE7' : '#FFE4B0');
  disk(g, sunAz, sunAlt, 350, night ? 24 : 42, color, night ? 0.10 : 0.14, 64, 0);
  disk(g, sunAz, sunAlt, 349, night ? 14 : 25, color, 0.10, 64, 0);
  disk(g, sunAz, sunAlt, 348, night ? 7 : 9, color, 1, 64);
  if (night) {
    // Quiet crater patches are actual triangles on the moon, not a texture.
    for (let i = 0; i < 10; i++) {
      const a = hash(i + 801) * TAU, r = Math.sqrt(hash(i + 802)) * 4.7;
      disk(g, sunAz + Math.cos(a) * r / 310, sunAlt + Math.sin(a) * r / 348, 347, 0.6 + hash(i + 803) * 1.3, rgb('#ADC3D8'), 0.26, 16, 0);
    }
  }
  return g;
}
function smooth(a, b, value) { const t = Math.max(0, Math.min(1, (value-a)/(b-a))); return t*t*(3-2*t); }
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(0,1,x-ix), fy = smooth(0,1,y-iy);
  const h = (dx,dy) => hash((ix+dx)*137 + (iy+dy)*919 + seed);
  return (h(0,0)*(1-fx)+h(1,0)*fx)*(1-fy)+(h(0,1)*(1-fx)+h(1,1)*fx)*fy;
}
function cloudNoise(x,y,seed) {
  return noise(x,y,seed)*0.57 + noise(x*2.03,y*2.03,seed+31)*0.28 + noise(x*4.1,y*4.1,seed+67)*0.15;
}
function clouds() {
  // Translucent sheets of density on the sky dome. Soft borders and internal
  // gaps come from vertex alpha; no puffs, spheres, textures or hard outlines.
  const g = { positions: [], colors: [], indices: [] };
  const shade = rgb(night ? '#263A55' : preset === 'dia' ? '#8FAFC3' : '#97768F');
  const light = rgb(night ? '#70839B' : preset === 'dia' ? '#FFFDF7' : '#FFE0BA');
  const cols = 72, rows = 28;
  for (let layer = 0; layer < 9; layer++) {
    const az = layer / 9 * TAU + 0.08;
    const altitude = 0.16 + hash(layer+720)*0.28;
    const width = 0.75 + hash(layer+740)*0.55;
    const height = 0.10 + hash(layer+760)*0.16;
    const radius = 230 + (layer%3)*8;
    const offset = g.positions.length / 3;
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
      const u = col / cols, v = row / rows;
      const warp = noise(u*3,v*3,layer+101);
      const density = cloudNoise(u*5 + warp*0.8, v*4 + Math.sin(u*10)*0.3,layer*173+20);
      const border = Math.pow(Math.sin(u*Math.PI)*Math.sin(v*Math.PI),0.65);
      const alpha = border*smooth(0.25,0.68,density)*(night ? 0.38 : 0.88);
      const elevation = altitude+(v-0.5)*height+Math.sin(u*7+layer)*0.018;
      const p = sphere(elevation,az+(u-0.5)*width,radius);
      const illumination = smooth(0.1,0.9,v)*0.5 + smooth(0.3,0.85,density)*0.5;
      const color = mix(shade,light,illumination);
      g.positions.push(...p); g.colors.push(...color,alpha);
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const a = offset+row*(cols+1)+col, b=a+1, d=a+cols+1, c=d+1;
      g.indices.push(a,b,c,a,c,d);
    }
  }
  return g;
}
function aurora(time) {
  const g = geometry();
  const green = rgb('#68FFC2'), cyan = rgb('#74DDEB'), violet = rgb('#AE79EB');
  for (let band = 0; band < 3; band++) {
    function vertex(i, row) {
      const u = i / 112, v = row / 9;
      const az = -1.7 + u * 3.5 + band * 1.45;
      const fold = Math.sin(u * 15 + band * 2 + time * 0.10) * 0.055 + Math.sin(u * 31 - time * 0.075) * 0.017;
      const lower = 0.22 + band * 0.10 + fold;
      const height = 0.23 + 0.08 * Math.sin(u * 8 + band + time * 0.04);
      const pos = sphere(lower + v * height, az + Math.sin(v * 3 + u * 9 + time * 0.05) * 0.04 * v, 174 + band * 9 + Math.sin(u * 12 + time * 0.06) * 6);
      const color = v < 0.32 ? mix(green, cyan, v / 0.32) : mix(cyan, violet, (v - 0.32) / 0.68);
      const edgeFade = Math.pow(Math.sin(u * Math.PI), 0.6);
      const vertical = v === 0 || v === 1 ? 0 : Math.exp(-v * 3.7) * Math.min(1, v * 17);
      const rays = 0.58 + 0.42 * Math.pow(Math.sin(u * 127 + Math.sin(u * 15 + time * 0.1) + time * 0.15), 2);
      return [pos, color, edgeFade * vertical * rays * 0.86];
    }
    for (let i = 0; i < 112; i++) for (let row = 0; row < 9; row++) {
      const a = vertex(i, row), b = vertex(i + 1, row), c = vertex(i + 1, row + 1), d = vertex(i, row + 1);
      for (const t of [[a,b,c], [a,c,d], [c,b,a], [d,c,a]]) triangle(g, t[0][0], t[1][0], t[2][0], t[0][1], t[1][1], t[2][1], t[0][2], t[1][2], t[2][2]);
    }
  }
  return g;
}
let auroraMesh, celestialMesh, cloudMesh, cloudNode, curtainNode;
let started = false, failed = false, last = -1, start = 0, changed = true;
function select(name, movement = true) {
  preset = presets.includes(name) ? name : 'amanecer';
  animated = movement;
  night = preset === 'noche' || preset === 'aurora';
  sunAz = night ? -0.55 : 0.55;
  sunAlt = night ? 0.48 : preset === 'dia' ? 0.63 : preset === 'amanecer' ? 0.18 : 0.12;
  changed = true;
  if (started && !scheduled) schedule();
}
let scheduled = false;
function schedule() { scheduled = true; requestAnimationFrame(frame); }
function frame(now) {
  scheduled = false;
  if (failed) return;
  try {
    if (changed) {
      const background = root.getElementById('sky_background');
      const stars = root.getElementById('sky_celestial');
      curtainNode = root.getElementById('sky_aurora');
      cloudNode = root.getElementById('sky_clouds');
      if (!background || !stars || !curtainNode || !cloudNode) { schedule(); return; }
      const base = location.pathname.endsWith('/cielos.hsml') ? './cielos/v2/' : '../cielos/v2/';
      background.setAttribute('src', base + preset + '/$1.png');
      if (celestialMesh) celestialMesh.update(celestial());
      else { celestialMesh = MeshResource.create(celestial()); stars.src = celestialMesh.src; }
      if (cloudMesh) cloudMesh.update(clouds());
      else { cloudMesh = MeshResource.create(clouds()); cloudNode.src = cloudMesh.src; }
      // 'inherit', no 'true': forzar visible desengancha el nodo de sus padres y,
      // sin removeAttribute, no vuelve nunca a heredar.
      curtainNode.setAttribute('visible', preset === 'aurora' ? 'inherit' : 'false');
      if (preset === 'aurora') {
        if (auroraMesh) auroraMesh.update(aurora(0));
        else { auroraMesh = MeshResource.create(aurora(0)); curtainNode.src = auroraMesh.src; }
      }
      cloudNode.setAttribute('ry', 0);
      started = true; changed = false; start = now; last = 0;
      console.log('[cielos] listo: ' + preset + ' / astros y nubes en malla');
    }
    if (!animated) return;
    const time = (now - start) / 1000, tick = Math.floor(time * 12);
    if (tick !== last) {
      last = tick;
      if (preset === 'aurora' && auroraMesh) auroraMesh.update(aurora(time));
      cloudNode.setAttribute('ry', time * 0.0015);
    }
    schedule();
  } catch (error) { failed = true; console.error('[cielos] ' + preset + ': ' + String(error)); }
}
globalThis.LunaSky = { select };
// In the gallery, its controls provide the first preset; includes initialize themselves.
if (!location.pathname.endsWith('/cielos.hsml')) schedule();
else { started = true; changed = false; }
})();
