// Los caminos de la nave: A* sobre la grilla que manda el servidor.
//
// Es una biblioteca pura —ni DOM, ni reloj, ni azar— porque la usa el
// reductor (estado.js): los tripulantes caminan adentro del estado, y dos
// pantallas con la misma partida tienen que verlos pasar por el mismo lugar.
//
// La grilla llega en el nodo `#navegacion` (ver src/navegacion.ts): dos capas
// en corridas, `piso` (qué se ve desde dónde) y `libre` (dónde puede pararse el
// centro de alguien, ya sin paredes ni muebles). `mundoDe(nodo)` la arma; el
// resto de las funciones reciben ese mundo y no guardan nada.
(function () {
  "use strict";

  function deCorridas(texto, total) {
    const out = new Uint8Array(total);
    let i = 0, valor = 0;
    for (const t of String(texto || "").split(".")) {
      const largo = parseInt(t, 36) || 0;
      if (valor) out.fill(1, i, Math.min(total, i + largo));
      i += largo;
      valor = 1 - valor;
    }
    return out;
  }

  /** La grilla, a partir de los atributos del nodo `#navegacion`. */
  function grillaDe(attr) {
    const cols = +attr("cols"), filas = +attr("filas");
    return {
      cols, filas, x0: +attr("x0"), z0: +attr("z0"), celda: +attr("celda"),
      piso: deCorridas(attr("piso"), cols * filas),
      libre: deCorridas(attr("libre"), cols * filas),
    };
  }

  const celdaDe = (g, x, z) => ({ c: Math.floor((x - g.x0) / g.celda), f: Math.floor((z - g.z0) / g.celda) });
  const centroDe = (g, c, f) => ({ x: g.x0 + (c + 0.5) * g.celda, z: g.z0 + (f + 0.5) * g.celda });
  const en = (g, capa, c, f) => c >= 0 && f >= 0 && c < g.cols && f < g.filas && capa[f * g.cols + c] === 1;

  function libre(g, x, z) { const k = celdaDe(g, x, z); return en(g, g.libre, k.c, k.f); }

  /** El centro de la celda libre más cercana (o el punto mismo, si ya lo es). */
  function cercano(g, x, z) {
    const k = celdaDe(g, x, z);
    if (en(g, g.libre, k.c, k.f)) return { x, z };
    for (let r = 1; r < 24; r++) {
      let mejor = null, dm = Infinity;
      for (let df = -r; df <= r; df++) for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(df)) !== r || !en(g, g.libre, k.c + dc, k.f + df)) continue;
        const p = centroDe(g, k.c + dc, k.f + df);
        const d = Math.hypot(p.x - x, p.z - z);
        if (d < dm) { dm = d; mejor = p; }
      }
      if (mejor) return mejor;
    }
    return null;
  }

  /** ¿Hay una recta sin cortar entre a y b sobre esta capa? Se muestrea cada
   *  un cuarto de celda: sobre `libre`, que ya tiene el ancho de un cuerpo
   *  descontado, alcanza con mirar la línea del medio. */
  function recta(g, capa, a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    const pasos = Math.max(1, Math.ceil(d / (g.celda * 0.25)));
    for (let i = 0; i <= pasos; i++) {
      const t = i / pasos;
      const k = celdaDe(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t);
      if (!en(g, capa, k.c, k.f)) return false;
    }
    return true;
  }

  /** ¿Se ve b desde a? Las paredes tapan; los muebles, no. */
  function seVe(g, a, b) { return recta(g, g.piso, a, b); }

  // ── A* ───────────────────────────────────────────────────────────────────
  // Ocho vecinos, sin cortar esquinas: en diagonal sólo si las dos celdas de
  // costado también están libres, o el camino se mete en el canto de la pared.
  const VEC = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
               [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

  function aEstrella(g, desde, hasta) {
    const n = g.cols * g.filas;
    const costo = new Float64Array(n).fill(Infinity);
    const vino = new Int32Array(n).fill(-1);
    const cerrado = new Uint8Array(n);
    // Montículo binario de pares [prioridad, índice].
    const heap = [];
    const sube = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
    const baja = (i) => {
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) return;
        const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
      }
    };
    const h = (c, f) => {
      const dx = Math.abs(c - hasta.c), df = Math.abs(f - hasta.f);
      return Math.max(dx, df) + (Math.SQRT2 - 1) * Math.min(dx, df);
    };
    const i0 = desde.f * g.cols + desde.c, meta = hasta.f * g.cols + hasta.c;
    costo[i0] = 0;
    heap.push([h(desde.c, desde.f), i0]);
    while (heap.length) {
      const [, i] = heap[0];
      const ultimo = heap.pop();
      if (heap.length) { heap[0] = ultimo; baja(0); }
      if (cerrado[i]) continue;
      if (i === meta) break;
      cerrado[i] = 1;
      const c = i % g.cols, f = (i / g.cols) | 0;
      for (const [dc, df, paso] of VEC) {
        const nc = c + dc, nf = f + df;
        if (!en(g, g.libre, nc, nf)) continue;
        if (dc && df && (!en(g, g.libre, c + dc, f) || !en(g, g.libre, c, f + df))) continue;
        const j = nf * g.cols + nc;
        const nuevo = costo[i] + paso;
        if (nuevo >= costo[j]) continue;
        costo[j] = nuevo;
        vino[j] = i;
        heap.push([nuevo + h(nc, nf), j]);
        sube(heap.length - 1);
      }
    }
    if (costo[meta] === Infinity) return null;
    const celdas = [];
    for (let i = meta; i !== -1; i = vino[i]) celdas.push(i);
    return celdas.reverse();
  }

  /** El camino de `a` a `b`, en metros: la lista de esquinas a pasar, sin el
   *  punto de partida y con el de llegada. Null si no hay forma.
   *
   *  El A* da un escalón por celda; se lo estira a rectas —desde cada esquina,
   *  la celda más lejana que se ve sin cortar— para que nadie camine en
   *  zigzag por el medio de una sala vacía. */
  function camino(g, a, b) {
    const ini = cercano(g, a.x, a.z), fin = cercano(g, b.x, b.z);
    if (!ini || !fin) return null;
    const ka = celdaDe(g, ini.x, ini.z), kb = celdaDe(g, fin.x, fin.z);
    if (ka.c === kb.c && ka.f === kb.f) return [[fin.x, fin.z]];
    const celdas = aEstrella(g, ka, kb);
    if (!celdas) return null;
    const pts = celdas.map((i) => centroDe(g, i % g.cols, (i / g.cols) | 0));
    pts[0] = ini;
    pts[pts.length - 1] = fin;
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = i + 1;
      while (j + 1 < pts.length && recta(g, g.libre, pts[i], pts[j + 1])) j++;
      out.push([pts[j].x, pts[j].z]);
      i = j;
    }
    return out;
  }

  /** Lo que mide un camino, en metros. */
  function largo(desde, ruta) {
    let d = 0, x = desde.x, z = desde.z;
    for (const [px, pz] of ruta) { d += Math.hypot(px - x, pz - z); x = px; z = pz; }
    return d;
  }

  /** El mundo que necesita el reductor, leído de un documento de la nave.
   *
   *  `fuente` es un adaptador, porque el mismo documento se lee de dos formas:
   *  en el motor, con los nodos de verdad (nave.js), y en un navegador, con el
   *  XML parseado (espectador.js). Tiene que dar:
   *
   *    porId(id)       -> { attr(k) } o null
   *    porClase(clase) -> [{ id, attr(k), x, z, sx, sy }]
   *
   *  con `x, z, sx, sy` en metros de nave. Lo que se lee: la grilla, dónde se
   *  para uno en cada consola y cada conducto, los asientos de la mesa y las
   *  salas con su nombre. */
  function mundoDe(fuente) {
    const nav = fuente.porId("navegacion");
    if (!nav) return null;
    const par = (t) => { const p = String(t || "").split(",").map(Number); return { x: p[0], z: p[1] }; };
    const mesa = fuente.porId("mesa_emergencia");
    return {
      grilla: grillaDe((k) => nav.attr(k)),
      consolas: fuente.porClase("consola").filter((c) => c.attr("pie")).map((c) => Object.assign(
        { id: String(c.id || "").replace(/^consola_/, ""), sala: c.attr("sala"), mira: +c.attr("mira") }, par(c.attr("pie")))),
      conductos: fuente.porClase("conducto").filter((c) => c.attr("pie")).map((c) => Object.assign(
        { id: c.id, anillo: c.attr("anillo") }, par(c.attr("pie")))),
      paneles: fuente.porClase("sabotaje").filter((c) => c.attr("pie")).map((c) => Object.assign(
        { punto: c.attr("punto"), arregla: c.attr("arregla"), mira: +c.attr("mira") }, par(c.attr("pie")))),
      asientos: String((mesa && mesa.attr("asientos")) || "").split(";").filter(Boolean).map(par),
      salas: fuente.porClase("pintable").filter((p) => /^piso_/.test(p.id || "") && p.attr("nombre")).map((p) => ({
        id: p.id.replace(/^piso_/, ""), nombre: p.attr("nombre"),
        x0: p.x - p.sx / 2, x1: p.x + p.sx / 2, z0: p.z - p.sy / 2, z1: p.z + p.sy / 2,
      })),
    };
  }

  globalThis.NAVE_NAV = { grillaDe, deCorridas, celdaDe, centroDe, libre, cercano, recta, seVe, camino, largo, mundoDe };
})();
