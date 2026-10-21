// Lo básico de la escena: crear nodos, los sólidos que frenan el tiro y el
// azar compartido.
//
// Los sólidos no son fijos como en el tiro: cada área trae los suyos (paredes,
// contenedores, máquinas: las cajas de sus modelos, que mide el servidor) y
// los registra al montarse y los quita al desmontarse. `solidos` es siempre la
// lista de los que están, para que el tiro la recorra sin preguntar de quién son.
(globalThis.__modulos ||= []).push(["juego/escena", ["comun/algebra", "juego/config"], (A, C) => {
  const { v3, eulerDeQ, crearAzar } = A;

  const root = hiperspace.dimention;
  const byId = (id) => root.getElementById(id);
  const zona = byId("zona");
  const escenario = byId("escenario") || root;
  /** De dónde bajar los modelos: la página lo pone en el escenario. */
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
  /** Un modelo de public/modelos/, sin toque. */
  const modelo = (padre, archivo, attrs = {}) => crear("model", { src: BASE + "/modelos/" + archivo, touchable: "false", ...attrs }, padre);

  const GUARDADO = v3(0, -50, 0);

  // ── Sólidos, por dueño ────────────────────────────────────────────────────
  const solidos = [];
  const porDueno = new Map();
  function rehacer() {
    solidos.length = 0;
    for (const lista of porDueno.values()) for (const s of lista) solidos.push(s);
  }
  /** Los sólidos de `dueno` (un área, por ejemplo): cajas alineadas a los
   *  ejes { min, max, material }, en mundo. Reemplaza los que tuviera. */
  function ponerSolidos(dueno, lista) { porDueno.set(dueno, lista); rehacer(); }
  function quitarSolidos(dueno) { porDueno.delete(dueno); rehacer(); }

  /** La altura de lo que hay abajo de (x, z), para lo que cae: el piso. */
  const apoyo = () => 0;

  const { azar, otro: otroAzar } = crearAzar(947);

  return { root, byId, zona, escenario, BASE, modelo, crear, poner, GUARDADO, solidos, ponerSolidos, quitarSolidos, apoyo, azar, otroAzar };
}]);
