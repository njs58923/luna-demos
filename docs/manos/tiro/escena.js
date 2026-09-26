// Lo básico de la escena: crear nodos, los sólidos que frenan el tiro y la mesa
// de las armas. También el azar compartido, para que todo el tiro saque de la
// misma secuencia.
(globalThis.__modulos ||= []).push(["tiro/escena", ["comun/algebra", "tiro/config"], (A, C) => {
  const { v3, suma, resta, eulerDeQ, crearAzar } = A;
  const { MESA, MESA_RIFLES } = C;

  const root = hiperspace.dimention;
  const byId = (id) => root.getElementById(id);
  const zona = byId("zona");
  const escenario = byId("escenario") || root;
  /** De dónde bajar los modelos (.glb): la página lo pone en el escenario. */
  const BASE = (escenario.getAttribute && escenario.getAttribute("data-base")) || "";

  function crear(tag, attrs, padre) {
    const el = root.createElement(tag);
    for (const k in attrs) el.setAttribute(k, String(attrs[k]));
    padre.appendChild(el);
    return el;
  }
  function poner(el, p, q) {
    el.position = p;
    if (q) el.rotation = eulerDeQ(q);
  }

  /** Donde se guarda lo apagado: bajo el piso. Ocultar con visible="false" no
   *  alcanzaba con los <text> en un Luna viejo (ver el arco); lejos, se apaga
   *  igual. */
  const GUARDADO = v3(0, -50, 0);

  // ── Sólidos ───────────────────────────────────────────────────────────────
  // Las cajas fijas que frenan el tiro y se quedan con la marca: la mesa, el
  // estante, el banco, sus patas y los pórticos. Ninguna está girada, así que
  // el rayo se prueba contra su caja alineada a los ejes.
  const solidos = [];
  function solido(attrs, material) {
    const el = crear("box", { ...attrs, touchable: "false" }, escenario);
    const c = v3(attrs.x || 0, attrs.y || 0, attrs.z || 0), m = v3(attrs.sx / 2, attrs.sy / 2, attrs.sz / 2);
    solidos.push({ el, min: resta(c, m), max: suma(c, m), material });
    return el;
  }

  // Las mesas de las armas, con sus cargadores de repuesto adelante.
  const MESAS = [MESA, MESA_RIFLES];
  for (const m of MESAS) {
    solido({ x: m.x, y: m.y - 0.02, z: m.z, sx: m.ancho, sy: 0.04, sz: m.fondo, color: "#7A5A3C" }, "madera");
    const ax = m.ancho / 2 - 0.05, az = m.fondo / 2 - 0.05;
    for (const [dx, dz] of [[-ax, -az], [ax, -az], [-ax, az], [ax, az]]) {
      solido({ x: m.x + dx, y: (m.y - 0.04) / 2, z: m.z + dz, sx: 0.05, sy: m.y - 0.04, sz: 0.05, color: "#5A3E2A" }, "madera");
    }
  }

  /** La altura de lo que hay abajo de (x, z), para lo que cae: una mesa, la
   *  tarima (4 cm sobre el suelo, radio 3,5) o el pasto (2 cm abajo). */
  function apoyo(x, z) {
    for (const m of MESAS) if (Math.abs(x - m.x) <= m.ancho / 2 && Math.abs(z - m.z) <= m.fondo / 2) return m.y;
    return Math.hypot(x, z) < 3.5 ? 0.04 : -0.02;
  }

  /** Un modelo de public/modelos/, sin toque. */
  const modelo = (padre, archivo, attrs = {}) => crear("model", { src: BASE + "/modelos/" + archivo, touchable: "false", ...attrs }, padre);

  const { azar, otro: otroAzar } = crearAzar(541);

  return { root, byId, zona, escenario, BASE, modelo, crear, poner, GUARDADO, solidos, solido, apoyo, azar, otroAzar };
}]);
