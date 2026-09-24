// El banco de juegos: monta cada juego en su caja, reparte las manos y, con
// `?demo`, los juega solos en ronda.

const raiz = hiperspace.dimention;
const byId = (id) => raiz.getElementById(id);

function cuandoEsten(seguir) {
  if (globalThis.KIT && globalThis.JUEGOS_KIT) return seguir();
  requestAnimationFrame(() => cuandoEsten(seguir));
}

/** mulberry32: el mismo azar con semilla que el estado de la nave. */
function azarDe(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

cuandoEsten(() => {
  const J = globalThis.JUEGOS_KIT;
  const DEMO = /[?&]demo\b/.test(location.search);
  const pedida = (location.search.match(/[?&]semilla=(\d+)/) || [])[1];
  let semilla = pedida ? Number(pedida) : (Date.now() >>> 0);

  const cajas = raiz.getElementsByClass("cara").map((el) => ({
    el, juego: el.getAttribute("juego"), base: el.getAttribute("base"), version: el.getAttribute("version"),
    mensaje: byId("mensaje_" + el.getAttribute("juego")), ctl: null, reiniciarEn: 0,
  }));

  function montar(c) {
    if (c.ctl) c.ctl.cerrar();
    const decir = (t, color) => {
      if (!c.mensaje) return;
      c.mensaje.setAttribute("value", t);
      c.mensaje.setAttribute("color", color || "#8E9CB4");
    };
    try {
      c.ctl = J._montar(raiz, c.el, c.juego, {
        base: c.base, version: c.version, azar: azarDe(semilla++),
        alMensaje: (t) => decir(t),
        alCompletar: () => {
          decir("COMPLETO", "#2ECC71");
          // En demo, se vuelve a armar al rato: la pared nunca queda quieta.
          if (DEMO) c.reiniciarEn = performance.now() + 3000;
        },
      });
      if (DEMO) c.ctl.demo();
    } catch (e) {
      decir("error: " + (e && e.message || e), "#E74C3C");
      console.error("[banco] " + c.juego + ":", e && e.message || e);
    }
  }
  cajas.forEach(montar);

  const zona = byId("zona");
  if (zona) zona.addEventListener("posemove", (evt) => { for (const c of cajas) if (c.ctl) c.ctl.mano(evt); });

  let antes = null;
  function cuadro(t) {
    const dt = antes == null ? 0 : Math.min(0.05, (t - antes) / 1000);
    antes = t;
    for (const c of cajas) {
      if (c.reiniciarEn && performance.now() > c.reiniciarEn) { c.reiniciarEn = 0; montar(c); }
      if (c.ctl) {
        try { c.ctl.cuadro(dt); } catch (e) { console.error("[banco] " + c.juego + ":", e && e.message || e); c.ctl = null; }
      }
    }
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
  console.log("[banco] " + cajas.length + " juegos" + (DEMO ? " en demo" : ""));
});
