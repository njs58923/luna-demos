// El renderer compartido conserva las mismas instancias al cambiar de cielo.
// Ningún cambio de preset navega la terraza ni vuelve a aplicar su spawn.
const root = hiperspace.dimention;
const query = new URLSearchParams(location.search);
const skies = [
  ['amanecer', 'AMANECER', 'Luz de durazno, nubes bajas y un sol nuevo.'],
  ['dia', 'DÍA', 'Azul abierto y nubes de algodón en movimiento.'],
  ['atardecer', 'ATARDECER', 'Un sol bajo entre capas de rosa y violeta.'],
  ['noche', 'NOCHE', 'Luna fría y 700 estrellas sobre la terraza.'],
  ['aurora', 'AURORA', 'Tres cortinas de luz recorren la bóveda nocturna.'],
];
let current = Math.max(0, skies.findIndex(s => s[0] === query.get('cielo')));
let automatic = query.get('auto') === '1';
let animated = query.get('animar') !== '0';
let deadline = 0;
let ready = false;
const nodes = {};
function show(index) {
  current = (index + skies.length) % skies.length;
  const sky = skies[current];
  globalThis.LunaSky.select(sky[0], animated);
  nodes.nombre.setAttribute('value', '0' + (current + 1) + ' / ' + sky[1]);
  nodes.descripcion.setAttribute('value', sky[2]);
  for (let i = 0; i < skies.length; i++) nodes['elegir_' + skies[i][0]].setAttribute('color', i === current ? '#D9B77D' : '#AECBD9');
  nodes.movimiento_label.setAttribute('value', 'MOVIMIENTO: ' + (animated ? 'SÍ' : 'NO'));
  deadline = Date.now() + 15000;
  console.log('[atlas] selección: ' + sky[0]);
}
function select(index) { automatic = false; updateAuto(); show(index); }
function updateAuto() { nodes.auto_label.setAttribute('value', automatic ? 'RECORRIDO: AUTO / 15 s' : 'RECORRIDO: MANUAL'); }
function frame() {
  if (!ready) {
    if (!globalThis.LunaSky) { requestAnimationFrame(frame); return; }
    const ids = [ 'nombre', 'descripcion', 'anterior', 'siguiente', 'auto', 'auto_label', 'movimiento', 'movimiento_label', 'puerta_atrio'].concat(skies.map(s => 'elegir_' + s[0]));
    for (const id of ids) { nodes[id] = root.getElementById(id); if (!nodes[id]) { requestAnimationFrame(frame); return; } }
    skies.forEach((s, i) => nodes['elegir_' + s[0]].addEventListener('toque', () => select(i)));
    nodes.anterior.addEventListener('toque', () => select(current - 1));
    nodes.siguiente.addEventListener('toque', () => select(current + 1));
    nodes.auto.addEventListener('toque', () => { automatic = !automatic; deadline = Date.now() + 15000; updateAuto(); });
    nodes.movimiento.addEventListener('toque', () => { animated = !animated; show(current); });
    // La puerta navega sola con hiperspace.world.navigate; lo unico que hace
    // falta es decirle a donde, y **absoluto**: una ruta relativa se resolveria
    // contra el documento de la puerta. El ?volver= se acepta solo si es de este
    // mismo origen, que con navegacion de mundo importa mas que antes.
    const fallback = new URL('./index.hsml#entry=desde_cielos', location.href);
    let target = fallback;
    try { const candidate = new URL(query.get('volver') || fallback.href, location.href); if (candidate.origin === location.origin) target = candidate; } catch (_) {}
    nodes.puerta_atrio.props = Object.assign({}, nodes.puerta_atrio.props, { destino: target.href });
    ready = true; show(current); updateAuto();
  }
  if (automatic && Date.now() >= deadline) show(current + 1);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
