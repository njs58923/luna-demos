// La arboleda, del lado del visor: el panel.
//
// Los árboles los monta montador.js y deja cada include en
// globalThis.MONTADOS. Los botones de viento y el de replantar les cambian
// las props a los de las estaciones (include.props = …): cada árbol se rearma
// o cambia de viento en su propio isolate.
(function arboleda() {
  const A = globalThis.ARBOLEDA;
  const raiz = hiperspace.dimention;
  const $ = (id) => raiz.getElementById(id);
  const botones = A && A.vientos.map((v) => ({ v, el: $("viento_" + v.id) }));
  const replantar = $("replantar");
  if (!A || !replantar || botones.some((b) => !b.el)) return void requestAnimationFrame(arboleda);

  let viento = 0.5, tanda = 0;
  /** Las props nuevas para los árboles de las estaciones que ya están montados. */
  function aplicar(cambio) {
    const M = globalThis.MONTADOS || {};
    for (const id of A.estaciones) {
      const inc = M[id];
      if (!inc) continue;
      let antes = {};
      try { antes = JSON.parse(inc.getAttribute("props") || "{}"); } catch (e) { /* sin props */ }
      const nuevas = Object.assign({}, antes, cambio(antes));
      inc.setAttribute("props", JSON.stringify(nuevas));
      try { inc.props = nuevas; } catch (e) { /* motor viejo: alcanza con el atributo */ }
    }
  }
  function pintar() {
    for (const { v, el } of botones) el.setAttribute("color", v.v === viento ? "#2A9D8F" : "#2E3444");
  }
  for (const { v, el } of botones) {
    el.addEventListener("toque", () => {
      viento = v.v;
      aplicar(() => ({ viento }));
      pintar();
    });
  }
  replantar.addEventListener("toque", () => {
    tanda++;
    aplicar((p) => ({ semilla: (Number(p.semilla) || 1) + 1000 * tanda }));
  });
  replantar.addEventListener("pointerenter", () => replantar.setAttribute("color", "#86B86A"));
  replantar.addEventListener("pointerleave", () => replantar.setAttribute("color", "#6A994E"));
})();
