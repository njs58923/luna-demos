// Lo básico de la escena: buscar nodos, ponerles pose y color sin repetir
// escrituras (cada setAttribute cruza al motor), y las reservas de piezas.
(globalThis.__modulos ||= []).push(["sables/escena", ["comun/algebra"], (A) => {
  const { eulerDeQ } = A;
  const root = hiperspace.dimention;
  const byId = (id) => root.getElementById(id);
  const zona = byId("zona");

  /** Escribir un atributo sólo si cambió. */
  function attr(el, k, v) {
    if (!el) return;
    const s = String(v);
    const c = el.__cache || (el.__cache = {});
    if (c[k] === s) return;
    c[k] = s;
    el.setAttribute(k, s);
  }
  // "hidden" y no "false": Luna no aplica el visible="false" del HSML a un
  // primitivo (box, sphere...) al crearlo, y reescribir el mismo "false" no
  // dispara la actualización. Con otro valor, sí.
  const ver = (el, si) => attr(el, "visible", si ? "inherit" : "hidden");
  function poner(el, p, q) {
    if (!el) return;
    el.position = p;
    if (q) el.rotation = eulerDeQ(q);
  }
  function rot(el, x, y, z) { if (el) el.rotation = { x, y, z }; }

  /** Una reserva de nodos con id `prefijo + i`: tomar uno libre y devolverlo. */
  function reserva(prefijo, cuantos, extra) {
    const libres = [], todos = [];
    for (let i = 0; i < cuantos; i++) {
      const el = byId(prefijo + i);
      if (!el) continue;
      const pieza = { i, el, libre: true, ...(extra ? extra(i) : {}) };
      ver(el, false);
      todos.push(pieza); libres.push(pieza);
    }
    return {
      todos,
      tomar() {
        const p = libres.pop();
        if (!p) return null;
        p.libre = false;
        return p;
      },
      soltar(p) {
        if (!p || p.libre) return;
        p.libre = true;
        ver(p.el, false);
        libres.push(p);
      },
      soltarTodo() { for (const p of todos) if (!p.libre) this.soltar(p); },
    };
  }

  /** Un color mezclado con negro: `k` de 0 (negro) a 1 (el color). */
  function apagar(hex, k) {
    const v = parseInt(hex.slice(1, 7), 16);
    const c = (s) => Math.round(((v >> s) & 255) * k).toString(16).padStart(2, "0");
    return "#" + c(16) + c(8) + c(0);
  }

  const leerCabeza = () => {
    try { const p = root.readViewerPose && root.readViewerPose(); return p && Number.isFinite(p.py) ? p : null; } catch (e) { return null; }
  };

  return { root, byId, zona, attr, ver, poner, rot, reserva, apagar, leerCabeza };
}]);
