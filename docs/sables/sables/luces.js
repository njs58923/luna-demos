// Las luces: anillos, tubos, rayos y el logo laten con la música.
//
// Salen de la forma de la canción (sus secciones), no de un mapa de luces: en
// la descarga, un destello por pulso y los anillos girando; en la subida, cada
// dos pulsos; en la pausa, quietas y tenues. Cada destello se apaga en cinco
// escalones (no en un degradé continuo): el motor cachea un material por color
// y un degradé crearía cientos.
(globalThis.__modulos ||= []).push(["sables/luces", ["sables/config", "sables/escena"], (C, E) => {
  const NIVELES = [1, 0.62, 0.38, 0.22, 0.12];
  const anillos = [], rayos = [], tubos = [];
  for (let a = 0; a < C.anillos; a++) anillos.push({ g: E.byId("anillo_" + a), lados: [0, 1, 2, 3].map((k) => E.byId("anillo_" + a + "_" + k)), giro: 0 });
  for (let r = 0; r < C.rayos; r++) rayos.push({ g: E.byId("rayo_" + r), b: E.byId("rayo_" + r + "_b"), fase: r * 0.7 });
  for (let i = 0; i < 4; i++) tubos.push(E.byId("tubo_" + i));
  const logo = E.byId("logo");

  let cancion = null, colores = ["#FF2D55", "#0A84FF"], tablas = null;
  let ultimoPulso = -1, destello = { t: -10, color: 0 }, giroObjetivo = 0, giro = 0;
  const tabla = (hex) => NIVELES.map((k) => E.apagar(hex, k));

  function usar(c) {
    cancion = c;
    colores = c ? c.colores : ["#FF2D55", "#0A84FF"];
    tablas = colores.map(tabla);
    ultimoPulso = -1;
  }
  usar(null);

  /** La sección en el segundo `t` de la canción. */
  function seccion(t) {
    if (!cancion) return null;
    const compas = Math.floor((t * cancion.bpm) / 60 / 4);
    let k = 0;
    for (const s of cancion.secciones) { if (compas < k + s.compases) return { ...s, enSeccion: compas - k }; k += s.compases; }
    return null;
  }

  /** Un destello ya (un corte, una bomba), del color de ese lado. */
  let tActual = 0;
  function destellar(color) { destello = { t: tActual, color }; }

  function pintar(nivel, color) {
    const c = tablas[color][Math.min(NIVELES.length - 1, nivel)];
    for (const a of anillos) for (const l of a.lados) E.attr(l, "color", c);
    for (const t of tubos) E.attr(t, "color", c);
    for (const r of rayos) E.attr(r.b, "color", c);
    E.attr(logo, "color", tablas[1 - color][Math.min(NIVELES.length - 1, nivel + 1)]);
  }

  /** `t`: segundos de la canción, o null en el menú (latido lento). */
  function animar(t, dt) {
    let energia = 0;
    if (t == null) {
      const u = (performance.now() / 1000) % 2.4;
      pintar(u < 0.12 ? 1 : 3, Math.floor(performance.now() / 2400) % 2);
    } else {
      tActual = t;
      const s = seccion(t);
      energia = s ? s.energia : 0;
      const pulso = Math.floor((t * cancion.bpm) / 60);
      if (pulso !== ultimoPulso) {
        ultimoPulso = pulso;
        const cada = energia === 3 ? 1 : energia >= 1 ? 2 : 0;
        if (cada && pulso % cada === 0) destello = { t, color: Math.floor(pulso / 4) % 2 };
        // Al empezar cada compás de la descarga, los anillos dan un cuarto de vuelta.
        if (energia === 3 && pulso % 4 === 0) giroObjetivo += Math.PI / 4;
      }
      const desde = (t - destello.t) / 0.07;
      const base = energia === 0 ? 4 : energia === 3 ? 2 : 3;
      pintar(Math.min(base, Math.max(0, Math.floor(desde))), destello.color);
    }
    giro += (giroObjetivo - giro) * Math.min(1, dt * 4);
    const ahora = performance.now() / 1000;
    anillos.forEach((a, i) => E.rot(a.g, 0, 0, giro * (i % 2 ? -1 : 1) + i * 0.08));
    const amp = energia === 3 ? 0.7 : energia >= 1 ? 0.35 : 0.12;
    rayos.forEach((r, i) => E.rot(r.g, 0, 0, Math.sin(ahora * (energia === 3 ? 1.6 : 0.6) + r.fase) * amp * (i < rayos.length / 2 ? 1 : -1)));
  }

  return { usar, animar, destellar, seccion };
}]);
