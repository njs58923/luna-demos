// El montador: pone en una escena una lista larga de <include> de a uno.
//
// Lo usan las salas que son cientos de objetos (la arboleda, la estación de
// portales). Cada objeto es un include con su isolate, y si lo que tiene es
// mucha geometría la funde en una malla propia: sostener cientos así es
// barato. Lo caro es montarlos, así que se montan de a uno cada `cada` ms,
// los más cercanos al visitante primero (bevy_oxr/docs/costo_de_montaje.md).
//
// globalThis.MONTAR = {
//   items: [{ id, src, x, y, z, ry, props, resources, events }],
//   cada: 40,               // ms entre montaje y montaje
//   estado: "id_de_texto",  // opcional: ahí escribe "montados n/total"
// }
//
// Deja globalThis.MONTADOS[id] = el <include>, para que el script de la sala
// le cambie las props después (include.props = {...}).
(function montador() {
  const M = globalThis.MONTAR;
  const raiz = hiperspace.dimention;
  if (!M || !Array.isArray(M.items)) return void requestAnimationFrame(montador);
  const cola = M.items.slice();
  const total = cola.length;
  const montados = (globalThis.MONTADOS = globalThis.MONTADOS || {});
  let hechos = 0;
  const t0 = Date.now();

  function dondeEstoy() {
    try {
      const p = typeof raiz.readViewerPose === "function" ? raiz.readViewerPose() : null;
      return p && Number.isFinite(p.px) ? { x: p.px, z: p.pz } : null;
    } catch (e) { return null; }
  }
  function informar() {
    const el = M.estado && raiz.getElementById(M.estado);
    if (!el) return;
    const s = ((Date.now() - t0) / 1000).toFixed(1);
    el.setAttribute("value", hechos < total ? "montando " + hechos + "/" + total + "…" : total + " montados en " + s + " s");
  }
  function montar(it) {
    const g = raiz.createElement("group");
    for (const k of ["x", "y", "z", "ry"]) if (Number.isFinite(it[k])) g.setAttribute(k, String(it[k]));
    raiz.appendChild(g);
    const inc = raiz.createElement("include");
    if (it.id) inc.setAttribute("id", it.id);
    inc.setAttribute("src", it.src);
    if (it.resources) inc.setAttribute("resources", it.resources);
    if (it.events) inc.setAttribute("events", it.events);
    inc.setAttribute("props", JSON.stringify(it.props || {}));
    g.appendChild(inc);
    if (it.id) montados[it.id] = inc;
  }
  function siguiente() {
    if (!cola.length) return void informar();
    const p = dondeEstoy() || M.desde || { x: 0, z: 0 };
    let mejor = 0, dm = Infinity;
    for (let i = 0; i < cola.length; i++) {
      const d = Math.hypot((cola[i].x || 0) - p.x, (cola[i].z || 0) - p.z);
      if (d < dm) { dm = d; mejor = i; }
    }
    montar(cola.splice(mejor, 1)[0]);
    hechos++;
    informar();
    setTimeout(siguiente, M.cada || 40);
  }
  siguiente();
})();
