// Interacción de la sala. El HSML (SSR) deja dos listas en globalThis:
//   EXPO_ITEMS  [{ id, label, ped }]  - las piezas del arco
//   EXPO_VUELOS [{ id, cx, cz, r, alto, vel, fase }] - mariposas de ambiente
//
// Cada `toque` sobre un pedestal prende/apaga el giro de esa pieza. Las
// mariposas son <include>: el aleteo y el ocho corto los hace su propio script,
// acá sólo se pasea el grupo que las envuelve.
const root = hiperspace.dimention;

const piezas = [];      // { id, el, ped, girando, angulo }
const vuelos = [];      // { el, cx, cz, r, alto, vel, fase }
let pendientes = null;  // items todavía sin nodo sincronizado
let vuelosPendientes = null;

function bindear() {
  if (pendientes === null) {
    const items = globalThis.EXPO_ITEMS;
    if (!Array.isArray(items)) return false; // el script inline todavía no corrió
    pendientes = items.slice();
    vuelosPendientes = Array.isArray(globalThis.EXPO_VUELOS) ? globalThis.EXPO_VUELOS.slice() : [];
  }

  const quedan = [];
  for (const item of pendientes) {
    const cuerpo = root.getElementById('obj_' + item.id);
    const pedestal = root.getElementById('ped_' + item.id);
    // getElementById devuelve null hasta que el nodo se sincroniza: reintentamos.
    if (!cuerpo || !pedestal) {
      quedan.push(item);
      continue;
    }

    const pieza = { id: item.id, el: cuerpo, ped: item.ped, girando: false, angulo: 0 };
    piezas.push(pieza);
    pedestal.addEventListener('toque', () => {
      pieza.girando = !pieza.girando;
      console.log('[expo]', item.label, pieza.girando ? 'girando' : 'quieta');
    });
  }
  pendientes = quedan;

  const quedanVuelos = [];
  for (const v of vuelosPendientes) {
    const el = root.getElementById(v.id);
    if (!el) {
      quedanVuelos.push(v);
      continue;
    }
    vuelos.push({ el, cx: v.cx, cz: v.cz, r: v.r, alto: v.alto, vel: v.vel, fase: v.fase });
  }
  vuelosPendientes = quedanVuelos;

  return pendientes.length === 0 && vuelosPendientes.length === 0;
}

let listo = false;
let t = 0;
let anterior = 0;

function frame(ahora) {
  requestAnimationFrame(frame);

  const dt = anterior ? Math.min((ahora - anterior) / 1000, 0.1) : 0.016;
  anterior = ahora;
  t += dt;

  if (!listo) listo = bindear();

  // Una sola op por frame para todo lo que se mueve.
  const batch = [];

  for (const p of piezas) {
    if (!p.girando) continue;
    p.angulo += dt * 0.7;
    // Local: la pieza cuelga de su <group>, así que su posición es (0, ped, 0).
    batch.push(p.el.nodeId, 0, p.ped, 0, 0, p.angulo, 0);
  }

  for (const v of vuelos) {
    const a = v.fase + t * v.vel;
    const x = v.cx + v.r * Math.sin(a);
    const z = v.cz - v.r * Math.cos(a);
    const y = v.alto + Math.sin(t * 1.5 + v.fase) * 0.3;
    // El frente de la mariposa es -z; esto la deja mirando hacia donde avanza.
    const ry = v.vel >= 0 ? -a - Math.PI / 2 : -a + Math.PI / 2;
    batch.push(v.el.nodeId, x, y, z, 0, ry, 0);
  }

  if (batch.length) root.setTransformBatch(batch);
}

requestAnimationFrame(frame);
console.log('[expo] listo');
