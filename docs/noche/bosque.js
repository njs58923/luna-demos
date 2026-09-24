// Vida del bosque: sólo los faroles del camino.
//
// No hay malla dinámica acá, y es a propósito. Las otras escenas la usan para
// lo que sirve —estrellas, nubes—, y en un bosque cerrado no se ve el cielo:
// gastar un nodo y un buffer en algo que tapan las copas es trabajo tirado.
//
// Lo único que se mueve es la luz de los faroles, y late por escala. `scale`
// **reemplaza** el tamaño declarado, así que la caja de 22x30x22 cm vive acá
// arriba: sin esto, la primera asignación la convierte en un cubo de un metro.
const CFG = globalThis.BOSQUE || {};
const N = CFG.faroles || 0;
const root = hiperspace.dimention;
const BASE = { x: 0.22, y: 0.3, z: 0.22 };

function hash(i, sal) {
  let h = Math.imul(i | 0, 374761393) + Math.imul(sal | 0, 668265263);
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const luces = [];
let listo = false;
let t0 = 0;
let tic = 0;

function frame(ahora) {
  requestAnimationFrame(frame);
  if (!t0) t0 = ahora;
  const t = (ahora - t0) / 1000;

  if (!listo) {
    for (let i = 0; i < N; i++) {
      const el = root.getElementById("farol_" + i);
      if (!el) return;
      luces.push({ el: el, fase: hash(i, 7) * 6.28, ritmo: 1.4 + hash(i, 8) * 1.6 });
    }
    listo = true;
    console.log("[bosque] " + luces.length + " faroles");
    return;
  }

  // 12 Hz: es un titileo de lámpara, no una animación.
  const paso = Math.floor(t * 12);
  if (paso === tic) return;
  tic = paso;
  for (const l of luces) {
    const p = 0.9 + Math.sin(t * l.ritmo + l.fase) * 0.1;
    l.el.scale = { x: BASE.x * p, y: BASE.y * p, z: BASE.z * p };
  }
}

requestAnimationFrame(frame);
