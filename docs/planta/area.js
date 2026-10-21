// El script de cada área: avisa al juego cuándo terminaron de cargar sus
// modelos (todos "ready" o "error") y cuánto tardaron. Es lo único que corre
// en el include; el resto del área es escenografía.
const raiz = hiperspace.dimention;
const desde = performance.now();
let avisado = false;
function mirar() {
  if (avisado) return;
  const modelos = raiz.getElementsByClass("pieza");
  const lista = Array.from(modelos || []);
  const listos = lista.filter((m) => /^(ready|error)$/.test(m.getAttribute("model-state") || ""));
  if (lista.length && listos.length === lista.length) {
    avisado = true;
    const errores = lista.filter((m) => m.getAttribute("model-state") === "error").length;
    component.emit("lista", { modelos: lista.length, errores, ms: Math.round(performance.now() - desde) }).catch(() => {});
    return;
  }
  requestAnimationFrame(mirar);
}
requestAnimationFrame(mirar);
