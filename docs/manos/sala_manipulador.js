// La sala sólo escucha: cada vez que el manipulador suelta el objeto avisa la
// pose con component.emit("pose"), y acá se muestra en el cartel. Es la prueba
// de que el componente también contesta hacia afuera, no sólo guarda.
const root = hiperspace.dimention;
const pieza = root.getElementById("pieza");
const estado = root.getElementById("estado");

if (pieza && estado) {
  pieza.addEventListener("pose", (e) => {
    const d = e.detail || {};
    if (!d.p) return;
    const f = (v) => Number(v).toFixed(2);
    estado.setAttribute("value", "guardado: x " + f(d.p.x) + "  y " + f(d.p.y) + "  z " + f(d.p.z) + "  escala " + f(d.s) + "x");
  });
}
