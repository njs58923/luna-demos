// Lo que se ve de un tiro: el fogonazo, la trazadora, las chispas, el polvo, las
// marcas y los avisos de puntos. Nada acá decide si se pegó o no.
(globalThis.__modulos ||= []).push(["tiro/efectos", ["comun/algebra", "tiro/config", "tiro/escena"], (A, C, E) => {
  const { v3, suma, por, largo, unitario, qMirando, qEjeY, eulerDeQ } = A;
  const { G } = C;
  const { crear, escenario, GUARDADO, otroAzar } = E;

  // ── Fogonazo ──────────────────────────────────────────────────────────────
  const fogonazo = crear("sphere", { id: "fogonazo", sx: 0.06, sy: 0.06, sz: 0.09, color: "#FFD27A", touchable: "false", visible: "false" }, escenario);
  let fogonazoHasta = 0;
  function fogonear(o, d, ahora) {
    fogonazo.position = suma(o, por(d, 0.03));
    fogonazo.rotation = eulerDeQ(qMirando(d));
    fogonazo.setAttribute("visible", "true");
    fogonazoHasta = ahora + 55;
  }

  // ── Trazadora y chispas ───────────────────────────────────────────────────
  /** Una sola malla para todo: dos planos cruzados de 1 m sobre −Z, con la cola
   *  (z = 0) transparente y la punta (z = −1) blanca cálida. Los trazadores y
   *  las chispas son nodos <model> que la comparten, y se animan moviendo y
   *  estirando el nodo, no la malla.
   *
   *  Una malla por tiro no se puede: Luna tiene 128 mallas dinámicas por sesión,
   *  no las devuelve al cambiar de página, y al llegar al tope falla toda
   *  MeshResource.create hasta reiniciar. Así la página gasta una.
   *
   *  Los triángulos de una malla dinámica son de una cara: cada plano va con
   *  las dos. Los colores van en lineal y en [0, 1] (ver guides/trampas.md). */
  function crearMallaTrazo() {
    const P = [], Col = [];
    const cola = [1, 0.96, 0.88, 0], punta = [1, 0.9, 0.62, 1];
    const plano = (ax, ay) => {
      const v = {
        c0: [-ax / 2, -ay / 2, 0], c1: [ax / 2, ay / 2, 0],
        p0: [-ax / 2, -ay / 2, -1], p1: [ax / 2, ay / 2, -1],
      };
      const col = { c0: cola, c1: cola, p0: punta, p1: punta };
      // Las dos caras: el mismo par de triángulos en un orden y en el otro.
      for (const tri of [["c0", "c1", "p1"], ["c0", "p1", "p0"], ["c0", "p1", "c1"], ["c0", "p0", "p1"]]) {
        for (const k of tri) { P.push(...v[k]); Col.push(...col[k]); }
      }
    };
    plano(1, 0);
    plano(0, 1);
    return MeshResource.create({ positions: new Float32Array(P), colors: new Float32Array(Col) });
  }
  let mallaTrazo = null;
  try {
    if (typeof MeshResource !== "undefined") mallaTrazo = crearMallaTrazo();
  } catch (e) {
    console.warn("[tiro] sin trazadora:", (e && e.message) || e);
  }
  function nodoTrazo() {
    if (!mallaTrazo) return null;
    return crear("model", {
      src: mallaTrazo.src, "material-unlit": "true", "material-alpha": "blend",
      touchable: "false", visible: "false",
    }, escenario);
  }

  /** La trazadora: nace en la boca, crece hasta LARGO_TRAZO, viaja y la cola
   *  alcanza a la punta en el impacto. Más lenta que una bala de verdad
   *  (350 m/s) para que se alcance a ver: a 7 m son 4 cuadros. Hay una por
   *  tiro en vuelo; con una MAC-10 son varias a la vez. */
  const VEL_TRAZO = 180;
  const LARGO_TRAZO = 0.8;
  const ANCHO_TRAZO = 0.012;
  const trazos = [];
  for (let i = 0; i < 8; i++) trazos.push({ el: nodoTrazo(), o: null, d: null, dist: 0, desde: 0 });
  let trazoSig = 0;
  function lanzarTrazo(o, d, dist, ahora) {
    const tr = trazos[trazoSig++ % trazos.length];
    if (!tr.el) return;
    tr.o = o;
    tr.d = d;
    tr.dist = dist;
    tr.desde = ahora;
    tr.el.rotation = eulerDeQ(qMirando(d));
    tr.el.position = o;
    tr.el.scale = v3(ANCHO_TRAZO, ANCHO_TRAZO, 0.001);
    tr.el.setAttribute("visible", "inherit");
  }

  /** Las chispas: la misma malla, finita y corta, saliendo de la superficie. */
  const chispas = [];
  for (let i = 0; i < 32; i++) chispas.push({ el: nodoTrazo(), p: null, v: null, desde: 0, hasta: 0, vista: false });
  let chispaSig = 0;
  /** `n` es la normal de la superficie, hacia el lado de donde vino el tiro. */
  function chispear(p, n, ahora, cuantas) {
    for (let k = 0; k < cuantas; k++) {
      const c = chispas[chispaSig++ % chispas.length];
      if (!c.el) return;
      const r = v3(otroAzar() - 0.5, otroAzar() - 0.5, otroAzar() - 0.5);
      c.p = suma(p, por(n, 0.01));
      c.v = por(unitario(suma(n, por(r, 1.8))), 1.8 + otroAzar() * 2.6);
      c.desde = ahora;
      c.hasta = ahora + 180 + otroAzar() * 240;
      c.vista = false;
      c.el.setAttribute("visible", "false");
    }
  }
  /** Las chispas salen cuando llega la trazadora, no cuando se aprieta. */
  const llegada = (dist, ahora) => ahora + (dist / VEL_TRAZO) * 1000;

  // ── Polvo ─────────────────────────────────────────────────────────────────
  const polvos = [];
  for (let i = 0; i < 6; i++) {
    polvos.push({ el: crear("sphere", { color: "#B59B72", touchable: "false", visible: "false" }, escenario), desde: 0 });
  }
  let polvoSig = 0;
  function levantarPolvo(p, ahora) {
    const d = polvos[polvoSig++ % polvos.length];
    d.desde = ahora;
    d.el.position = v3(p.x, 0.03, p.z);
    d.el.scale = v3(0.05, 0.03, 0.05);
    d.el.setAttribute("visible", "true");
  }

  // ── Avisos ("+10") ────────────────────────────────────────────────────────
  const avisos = [];
  for (let i = 0; i < 6; i++) {
    avisos.push({ el: crear("text", { value: "", size: 0.2, color: "#FFD60A", visible: "false" }, escenario), hasta: 0, desde: null, t0: 0 });
  }
  let avisoSig = 0;
  function apagarAviso(a) {
    a.desde = null;
    a.el.setAttribute("visible", "false");
    a.el.position = GUARDADO;
  }
  function avisar(p, texto, color, ahora) {
    const a = avisos[avisoSig++ % avisos.length];
    const dist = largo(p);
    a.el.setAttribute("value", texto);
    a.el.setAttribute("color", color);
    a.el.setAttribute("size", String(0.14 + dist * 0.018));
    // "inherit" y no "true": "true" fija el nodo visible aunque su padre se oculte.
    a.el.setAttribute("visible", "inherit");
    a.desde = suma(p, v3(0, 0.25, 0));
    a.t0 = ahora;
    a.hasta = ahora + 1300;
    a.el.position = a.desde;
  }

  // ── Marcas ────────────────────────────────────────────────────────────────
  /** Un disco oscuro sobre la superficie, hijo de lo que recibió el tiro. En
   *  una lata o una placa se va con ella —vuela, se hamaca— y queda cuando
   *  vuelve. Las más viejas se borran. */
  const MARCAS_MAX = 80;
  const marcas = [];
  function marcar(padre, p, normal, diametro, color) {
    const r = eulerDeQ(qEjeY(normal));
    const c = suma(p, por(normal, 0.002));
    const el = crear("cylinder", {
      class: "marca", x: c.x, y: c.y, z: c.z, rx: r.x, ry: r.y, rz: r.z,
      sx: diametro, sy: 0.003, sz: diametro, color, touchable: "false",
    }, padre);
    marcas.push(el);
    if (marcas.length > MARCAS_MAX) marcas.shift().remove();
    return el;
  }
  function borrarMarcas() {
    for (const el of marcas) el.remove();
    marcas.length = 0;
  }

  // ── El cuadro ─────────────────────────────────────────────────────────────
  function animar(t, dt) {
    if (fogonazoHasta && t >= fogonazoHasta) {
      fogonazoHasta = 0;
      fogonazo.setAttribute("visible", "false");
    }
    for (const tr of trazos) {
      if (!tr.desde) continue;
      const s = ((t - tr.desde) / 1000) * VEL_TRAZO;
      const punta = Math.min(s, tr.dist), cola = Math.max(0, s - LARGO_TRAZO);
      if (cola >= tr.dist) {
        tr.desde = 0;
        tr.el.setAttribute("visible", "false");
        tr.el.position = GUARDADO;
        continue;
      }
      tr.el.position = suma(tr.o, por(tr.d, cola));
      tr.el.scale = v3(ANCHO_TRAZO, ANCHO_TRAZO, Math.max(0.001, punta - cola));
    }
    for (const c of chispas) {
      if (!c.desde || t < c.desde) continue;
      if (t >= c.hasta) {
        c.desde = 0;
        c.el.setAttribute("visible", "false");
        c.el.position = GUARDADO;
        continue;
      }
      if (!c.vista) { c.vista = true; c.el.setAttribute("visible", "inherit"); }
      if (dt > 0) {
        c.v = v3(c.v.x, c.v.y - G * dt, c.v.z);
        c.p = suma(c.p, por(c.v, dt));
      }
      // Estirada según la velocidad, como se ve una chispa en una foto.
      c.el.position = c.p;
      c.el.rotation = eulerDeQ(qMirando(c.v));
      c.el.scale = v3(0.004, 0.004, 0.015 + largo(c.v) * 0.012);
    }
    for (const d of polvos) {
      if (!d.desde) continue;
      const k = (t - d.desde) / 280;
      if (k >= 1) { d.desde = 0; d.el.setAttribute("visible", "false"); d.el.position = GUARDADO; continue; }
      d.el.scale = v3(0.05 + 0.25 * k, 0.03 + 0.12 * k, 0.05 + 0.25 * k);
    }
    for (const a of avisos) {
      if (!a.desde) continue;
      if (t >= a.hasta) { apagarAviso(a); continue; }
      a.el.position = suma(a.desde, v3(0, 0.5 * (t - a.t0) / 1300, 0));
    }
  }

  return { fogonear, lanzarTrazo, chispear, llegada, levantarPolvo, avisar, marcar, borrarMarcas, animar };
}]);
