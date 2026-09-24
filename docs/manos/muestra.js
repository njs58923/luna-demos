// La muestra vive por su cuenta: la cabeza mira a los lados, la antena
// parpadea, la luz del pecho late. Nada de esto sabe que alguien la está
// moviendo desde afuera — ese es justamente el punto.
const root = hiperspace.dimention;
const byId = (id) => root.getElementById(id);

const cabeza = byId("cabeza");
const antena = byId("antena");
const pecho = byId("luz_pecho");
const cuerpo = byId("cuerpo");

function aplicarProps(p) {
  if (cuerpo && p && typeof p.color === "string") cuerpo.setAttribute("color", p.color);
}
if (typeof component !== "undefined") {
  aplicarProps(component.props);
  component.addEventListener("propschange", (e) => aplicarProps(e.detail.props));
}

let antenaEncendida = null;
function cuadro(t) {
  const s = t / 1000;
  if (cabeza) cabeza.rotation = { x: 0, y: Math.sin(s * 0.8) * 0.6, z: 0 };
  // Parpadeo: 150 ms encendida cada 1.2 s. Sólo se escribe el atributo cuando
  // cambia, no en cada cuadro.
  const encendida = (s % 1.2) < 0.15;
  if (antena && encendida !== antenaEncendida) {
    antenaEncendida = encendida;
    antena.setAttribute("color", encendida ? "#FFD60A" : "#FF3B30");
  }
  if (pecho) {
    // sx/sy/sz de una primitiva SON la escala de su transform: el diámetro va
    // directo, no un factor sobre el del documento.
    const k = 0.03 + 0.012 * (0.5 + 0.5 * Math.sin(s * 3));
    pecho.scale = { x: k, y: k, z: k };
  }
  requestAnimationFrame(cuadro);
}
requestAnimationFrame(cuadro);
