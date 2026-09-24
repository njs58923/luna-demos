// La escena del kit: arma las cuatro cajas de prueba y, con `?demo`, las juega
// con una mano fantasma.
//
// La mano fantasma no es una animación: manda los mismos eventos `posemove` que
// manda el motor cuando hay un mando de VR adentro del posezone —posición en el
// mundo, grip y gatillo— y el panel los procesa igual. Si la palanca de la
// captura se baja bien, se baja bien con la mano de verdad.

const raiz = hiperspace.dimention;
const byId = (id) => raiz.getElementById(id);

function cuandoEste(seguir) {
  if (globalThis.KIT) return seguir(globalThis.KIT);
  requestAnimationFrame(() => cuandoEste(seguir));
}

cuandoEste((KIT) => {
  const DEMO = /[?&]demo\b/.test(location.search);
  const paneles = {};

  function panel(id) {
    const g = byId("panel_" + id);
    if (!g) return null;
    const p = new KIT.Panel(raiz, g, { base: g.getAttribute("base"), version: g.getAttribute("version") });
    paneles[id] = p;
    return p;
  }

  // ── Botones ───────────────────────────────────────────────────────────────
  // Tres redondos que prenden un led con su color, y cuatro teclas que escriben
  // en un display. Es lo que después son los colectores, la clave y el reactor.
  (() => {
    const p = panel("botones");
    if (!p) return;
    const led = p.led({ x: 0.14, y: 0.1 });
    const cuenta = p.texto({ x: 0.23, y: 0.09, valor: "0", tam: 0.04, color: "#FFFFFF" });
    let veces = 0;
    [["#E74C3C", -0.22], ["#2ECC71", -0.1], ["#4A90D9", 0.02]].forEach(([color, x]) => {
      p.boton({
        x, y: 0.1, color,
        alApretar: () => { led.color(color); cuenta.valor(++veces); },
        alSoltar: () => led.color("#3D4654"),
      });
    });
    p.pantalla({ x: 0, y: 0.19, ancho: 0.3, alto: 0.05 });
    const display = p.texto({ x: 0, y: 0.19, valor: "----", tam: 0.035, color: "#2ECC71", z: 0.014 });
    let escrito = "";
    ["1", "2", "3", "4"].forEach((t, i) => {
      p.boton({
        forma: "tecla", x: -0.21 + i * 0.14, y: -0.11, color: "#C8CCD8", etiqueta: t,
        alApretar: () => { escrito = (escrito + t).slice(-4); display.valor(escrito.padEnd(4, "-")); },
      });
    });
  })();

  // ── Palancas ──────────────────────────────────────────────────────────────
  // Dos interruptores con su led, y una palanca grande que vuelve sola, con una
  // barra que muestra cuánto está bajada.
  (() => {
    const p = panel("palancas");
    if (!p) return;
    [-0.22, -0.09].forEach((x) => {
      const led = p.led({ x, y: -0.12 });
      p.palanca({
        x, y: 0.06, modo: "dos",
        alLlegar: (lado) => led.color(lado === "abajo" ? "#2ECC71" : "#3D4654"),
      });
    });
    const barra = p.barra({ x: 0.13, y: -0.19, ancho: 0.26, alto: 0.03, color: "#E67E22" });
    p.palanca({ x: 0.13, y: 0.04, tam: "grande", modo: "retorno", alCambiar: (f) => barra.valor(f) });
  })();

  // ── Empujables ────────────────────────────────────────────────────────────
  // Un riel horizontal, uno vertical y un área: la corredera de la sintonía, la
  // de alinear el motor y el trazado del rumbo.
  (() => {
    const p = panel("correderas");
    if (!p) return;
    const valor = p.texto({ x: 0.2, y: 0.08, valor: "0 %", tam: 0.03, color: "#FFFFFF" });
    p.empujable({
      desde: { x: -0.25, y: 0.16 }, hasta: { x: 0.25, y: 0.16 },
      alMover: (t) => valor.valor(Math.round(t * 100) + " %"),
    });
    p.empujable({ desde: { x: 0.2, y: -0.19 }, hasta: { x: 0.2, y: 0.02 }, girarPerilla: 0 });
    p.pantalla({ x: -0.1, y: -0.07, ancho: 0.3, alto: 0.24 });
    p.empujable({
      area: { x0: -0.24, y0: -0.18, x1: 0.04, y1: 0.04 },
      perilla: (g, panel) => {
        panel.crear("sphere", { z: 0.004, sx: 0.03, sy: 0.03, sz: 0.012, color: "#F1C40F", touchable: "false" }, g);
        panel.crear("box", { z: 0.004, sx: 0.06, sy: 0.003, sz: 0.004, color: "#F1C40F", touchable: "false" }, g);
        panel.crear("box", { z: 0.004, sx: 0.003, sy: 0.06, sz: 0.004, color: "#F1C40F", touchable: "false" }, g);
      },
    });
  })();

  // ── Estirables ────────────────────────────────────────────────────────────
  // Tres cables y tres tomas desordenadas: sólo entra el enchufe del mismo
  // color. Cuando están los tres, se desenchufan solos y vuelta a empezar.
  (() => {
    const p = panel("cables");
    if (!p) return;
    const colores = ["#E74C3C", "#F1C40F", "#4A90D9"];
    const ys = [0.13, 0, -0.13];
    const orden = [2, 0, 1];
    const leds = [];
    const tomas = orden.map((k, i) => {
      leds[i] = p.led({ x: 0.28, y: ys[i] - 0.045 });
      return p.toma({ id: colores[k], x: 0.23, y: ys[i], color: colores[k] });
    });
    const cables = [];
    let hechos = 0;
    colores.forEach((color, i) => {
      cables.push(p.estirable({
        ancla: { x: -0.27, y: ys[i] }, color, tomas,
        alConectar: (toma) => {
          if (toma.id !== color) return false;
          leds[tomas.indexOf(toma)].color("#2ECC71");
          if (++hechos === 3) setTimeout(reiniciar, 2500);
          return true;
        },
      }));
    });
    function reiniciar() {
      hechos = 0;
      for (const c of cables) c.desconectar();
      for (const l of leds) l.color("#3D4654");
    }
  })();

  // ── Manos ─────────────────────────────────────────────────────────────────
  const zona = byId("zona");
  if (zona) zona.addEventListener("posemove", (evt) => { for (const id in paneles) paneles[id].mano(evt); });

  // ── La mano fantasma ──────────────────────────────────────────────────────
  // Cada caja tiene su guion: una lista de poses en coordenadas del panel, con
  // el grip apretado o no, y cuánto se tarda en llegar a cada una. Se repite.
  const G = 1, _ = 0;
  const GUIONES = {
    botones: [
      [0.4, -0.22, 0.1, 0.09, _], [0.35, -0.22, 0.1, 0.012, _], [0.3, -0.22, 0.1, 0.09, _],
      [0.4, -0.1, 0.1, 0.09, _], [0.35, -0.1, 0.1, 0.012, _], [0.3, -0.1, 0.1, 0.09, _],
      [0.4, 0.02, 0.1, 0.09, _], [0.35, 0.02, 0.1, 0.012, _], [0.3, 0.02, 0.1, 0.09, _],
      [0.5, -0.21, -0.11, 0.09, _], [0.3, -0.21, -0.11, 0.01, _], [0.25, -0.21, -0.11, 0.09, _],
      [0.4, 0.07, -0.11, 0.09, _], [0.3, 0.07, -0.11, 0.01, _], [0.25, 0.07, -0.11, 0.09, _],
      [0.8, 0.0, 0.0, 0.2, _],
    ],
    palancas: [
      [0.5, -0.22, 0.06 + 0.055, 0.09, _], [0.3, -0.22, 0.06 + 0.055, 0.09, G],
      [0.7, -0.22, 0.06 - 0.055, 0.09, G], [0.3, -0.22, 0.06 - 0.055, 0.09, _],
      [0.5, -0.09, 0.06 + 0.055, 0.09, _], [0.3, -0.09, 0.06 + 0.055, 0.09, G],
      [0.7, -0.09, 0.06 - 0.055, 0.09, G], [0.3, -0.09, 0.06 - 0.055, 0.09, _],
      [0.6, 0.13, 0.04 + 0.165, 0.16, _], [0.3, 0.13, 0.04 + 0.165, 0.16, G],
      [0.9, 0.13, 0.04 - 0.165, 0.16, G], [1.2, 0.13, 0.04 - 0.165, 0.16, G],
      [0.2, 0.13, 0.04 - 0.165, 0.2, _],
      // y los interruptores de vuelta arriba
      [0.8, -0.22, 0.06 - 0.055, 0.09, _], [0.3, -0.22, 0.06 - 0.055, 0.09, G],
      [0.6, -0.22, 0.06 + 0.055, 0.09, G], [0.3, -0.22, 0.06 + 0.055, 0.09, _],
      [0.5, -0.09, 0.06 - 0.055, 0.09, _], [0.3, -0.09, 0.06 - 0.055, 0.09, G],
      [0.6, -0.09, 0.06 + 0.055, 0.09, G], [0.3, -0.09, 0.06 + 0.055, 0.09, _],
      [0.8, 0.0, 0.0, 0.25, _],
    ],
    correderas: [
      [0.5, -0.25, 0.16, 0.03, _], [0.3, -0.25, 0.16, 0.03, G], [1.2, 0.18, 0.16, 0.03, G],
      [0.3, 0.18, 0.16, 0.03, _], [0.5, 0.2, -0.19, 0.03, _], [0.3, 0.2, -0.19, 0.03, G],
      [1.0, 0.2, 0.0, 0.03, G], [0.3, 0.2, 0.0, 0.03, _],
      [0.6, -0.1, -0.07, 0.03, _], [0.3, -0.1, -0.07, 0.03, G],
      [0.4, -0.2, -0.02, 0.03, G], [0.4, -0.12, 0.03, 0.03, G], [0.4, 0.0, -0.05, 0.03, G],
      [0.4, -0.06, -0.16, 0.03, G], [0.4, -0.2, -0.12, 0.03, G], [0.3, -0.2, -0.12, 0.03, _],
      [0.6, 0.18, 0.16, 0.03, _], [0.3, 0.18, 0.16, 0.03, G], [1.2, -0.25, 0.16, 0.03, G],
      [0.3, -0.25, 0.16, 0.03, _], [0.5, 0.2, 0.0, 0.03, _], [0.3, 0.2, 0.0, 0.03, G],
      [0.8, 0.2, -0.19, 0.03, G], [0.3, 0.2, -0.19, 0.03, _], [0.6, 0, 0, 0.2, _],
    ],
    cables: [
      [0.6, -0.195, 0.13, 0.03, _], [0.3, -0.195, 0.13, 0.03, G], [1.3, 0.17, 0.0, 0.04, G],
      [0.4, 0.165, 0.0, 0.02, G], [0.3, 0.165, 0.0, 0.02, _],
      [0.6, -0.195, 0.0, 0.03, _], [0.3, -0.195, 0.0, 0.03, G], [1.3, 0.17, -0.13, 0.04, G],
      [0.4, 0.165, -0.13, 0.02, G], [0.3, 0.165, -0.13, 0.02, _],
      [0.6, -0.195, -0.13, 0.03, _], [0.3, -0.195, -0.13, 0.03, G], [1.3, 0.17, 0.13, 0.05, G],
      [0.4, 0.165, 0.13, 0.02, G], [0.3, 0.165, 0.13, 0.02, _],
      [3.2, 0.0, 0.0, 0.2, _],
    ],
  };

  function fantasma(id, guion) {
    const p = paneles[id];
    if (!p) return null;
    const total = guion.reduce((s, k) => s + k[0], 0);
    let t = 0;
    return (dt) => {
      t = (t + dt) % total;
      // Se busca el tramo: de la pose anterior a la actual.
      let acum = 0, i = 0;
      while (i < guion.length && acum + guion[i][0] < t) { acum += guion[i][0]; i++; }
      const k = guion[i] || guion[guion.length - 1];
      const prev = guion[(i - 1 + guion.length) % guion.length];
      const u = Math.min(1, (t - acum) / k[0]);
      const s = u * u * (3 - 2 * u);
      const l = { x: prev[1] + (k[1] - prev[1]) * s, y: prev[2] + (k[2] - prev[2]) * s, z: prev[3] + (k[3] - prev[3]) * s };
      // El grip sigue al tramo: se aprieta o se suelta al llegar a la pose.
      const grip = u >= 1 ? k[4] : prev[4];
      const w = p.marco.aMundo(l);
      p.mano({ hand: "right", px: w.x, py: w.y, pz: w.z, grip, trigger: 0 });
      return l;
    };
  }

  const fantasmas = DEMO ? Object.keys(GUIONES).map((id) => fantasma(id, GUIONES[id])).filter(Boolean) : [];
  // Una esferita donde está la mano fantasma, para verla en las capturas.
  const puntos = DEMO ? Object.keys(GUIONES).map((id) => paneles[id]
    ? paneles[id].crear("sphere", { sx: 0.025, sy: 0.025, sz: 0.025, color: "#FFFFFFB0", "material-alpha": "blend", touchable: "false" })
    : null) : [];

  // ── El estante gira ───────────────────────────────────────────────────────
  const piezas = raiz.getElementsByClass("pieza").map((el, i) => ({ el, fase: i * 0.7 }));

  let antes = null;
  function cuadro(t) {
    const dt = antes == null ? 0 : Math.min(0.05, (t - antes) / 1000);
    antes = t;
    fantasmas.forEach((f, i) => {
      const l = f(dt);
      if (puntos[i] && l) puntos[i].position = { x: l.x, y: l.y, z: l.z };
    });
    for (const id in paneles) paneles[id].cuadro(dt);
    for (const p of piezas) p.el.rotation = { x: 0.35, y: Math.sin(t / 1400 + p.fase) * 1.1, z: 0 };
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);
  console.log("[kit] " + Object.keys(paneles).length + " cajas" + (DEMO ? ", con mano fantasma" : ""));
});
