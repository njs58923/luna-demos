// Sables de Luna: cortar cubos al ritmo de la música. Este módulo conecta:
// escucha los mandos, lleva los estados y mueve el cuadro.
//
//   comun/modulos.js     espera a que lleguen todos los <script src>
//   comun/algebra.js     vectores y cuaterniones
//   comun/sintesis.js    clips sintetizados como WAV en memoria
//   sables/datos.js      canciones, dificultades y geometría (lo arma el servidor)
//   sables/config.js     corte, puntaje, energía
//   sables/sonidos.js    los clips
//   sables/escena.js     nodos, atributos sin repetir, reservas de piezas
//   sables/musica.js     la canción y el reloj del juego
//   sables/sables.js     los sables: pose, barrido, historia
//   sables/efectos.js    mitades, chispas, carteles
//   sables/luces.js      anillos, tubos y rayos al ritmo
//   sables/marcador.js   puntos, combo, multiplicador, energía
//   sables/notas.js      cubos, bombas y paredes; el corte
//   sables/demo.js       los sables solos
//   sables/menu.js       menú, resultados y pausa
//
// Estados: menu → cargando → jugando ⇄ pausa → resultados → menu
(globalThis.__modulos ||= []).push(["sables/main", [
  "sables/datos", "sables/config", "sables/escena", "sables/musica", "sables/sables", "sables/efectos", "sables/luces",
  "sables/marcador", "sables/notas", "sables/demo", "sables/menu", "sables/sonidos",
], (D, C, E, MU, S, F, L, M, N, DE, ME, SN) => {
  const juego = { estado: "menu", cancion: null, dificultad: null, t: 0, partida: 0, cuenta: 0 };

  S.escucharPausa(pausaOSeguir);
  if (E.zona) E.zona.addEventListener("posemove", (evt) => {
    const ahora = performance.now() / 1000;
    if (S.onPose(evt, ahora)) pausaOSeguir();
  });
  E.root.addEventListener && E.root.addEventListener("keydown", (e) => {
    const k = (e && (e.key || e.code)) || "";
    if (/^(Escape|p|P|KeyP)$/.test(k)) pausaOSeguir();
  });

  function pausaOSeguir() {
    if (juego.estado === "jugando") pausar();
    else if (juego.estado === "pausa") seguir();
  }

  async function jugar() {
    const c = D.canciones[ME.sel.cancion], d = D.dificultades[ME.sel.dificultad];
    const partida = ++juego.partida;
    juego.estado = "cargando"; juego.cancion = c; juego.dificultad = d;
    ME.mostrar("ninguna");
    MU.callar();
    F.limpiar(); N.limpiar();
    M.avisar("cargando…", performance.now() / 1000, 30);
    M.empezar(0, ME.sel.sinFallar);
    let mapa;
    try {
      const url = (c.mapas.find((m) => m.id === d.id) || {}).url || `${D.base}/mapas/${c.id}/${d.id}.json`;
      const r = await fetch(url);
      mapa = await r.json();
      if (!r.ok) throw new Error("HTTP " + r.status);
    } catch (e) {
      if (partida !== juego.partida) return;
      aMenu(); ME.avisar("no se pudo bajar el mapa: " + ((e && e.message) || e));
      return;
    }
    await MU.cargar(c.audio);
    if (partida !== juego.partida) return;
    const cabeza = E.leerCabeza();
    const cuantos = N.cargar(mapa, c, cabeza ? cabeza.py : C.ALTURA);
    M.empezar(cuantos, ME.sel.sinFallar);
    L.usar(c);
    // Sin mandos (escritorio), la demo corta sola.
    const demo = ME.sel.demo || !S.hayMandos(performance.now() / 1000);
    DE.activar(demo);
    juego.demo = demo;
    M.avisar(demo && !ME.sel.demo ? "sin mandos: modo demo" : `${c.titulo} · ${d.nombre}`, performance.now() / 1000, 2.5);
    juego.estado = "jugando";
    juego.t = 0;
    await MU.empezar(0);
  }

  function pausar() {
    juego.estado = "pausa";
    MU.pausar();
    ME.mostrar("pausa");
  }
  function seguir() {
    ME.mostrar("ninguna");
    juego.estado = "jugando";
    MU.seguir();
  }
  function aMenu() {
    juego.partida++;
    juego.estado = "menu";
    MU.parar();
    N.limpiar(); F.limpiar(); M.ocultar(); L.usar(null);
    if (DE.activa) S.ocultar();
    DE.activar(false);
    ME.mostrar("menu");
    ME.avisar("");
  }
  function terminar() {
    juego.estado = "resultados";
    const r = { ...M.resumen(), demo: juego.demo };
    MU.parar();
    N.limpiar(); M.ocultar();
    if (juego.demo) S.ocultar();
    DE.activar(false);
    SN.sonar(r.fallado ? "derrota" : "exito");
    ME.mostrarResultados(r);
  }

  ME.iniciar({ jugar, aMenu, seguir });

  // ?jugar=<canción>&dif=<dificultad>&demo=1: arrancar directo (para compartir
  // una canción o mirarla en demo).
  try {
    const q = new URL(location.href).searchParams;
    const c = D.canciones.findIndex((x) => x.id === q.get("jugar"));
    if (c >= 0) {
      ME.sel.cancion = c;
      const d = D.dificultades.findIndex((x) => x.id === q.get("dif"));
      if (d >= 0) ME.sel.dificultad = d;
      ME.sel.demo = q.get("demo") === "1";
      setTimeout(jugar, 1500);
    }
  } catch (e) { /* sin parámetros */ }

  let antes = null;
  function cuadro(tRaf) {
    const ahora = performance.now() / 1000;
    const dt = antes == null ? 0 : Math.min(0.05, (tRaf - antes) / 1000);
    antes = tRaf;
    if (juego.estado === "jugando") {
      const t = MU.avanzar(dt);
      juego.t = t;
      DE.animar(t, ahora, dt);
      N.actualizar(t, ahora, dt, E.leerCabeza());
      L.animar(t, dt);
      M.pintar(Math.min(1, t / juego.cancion.duracion), ahora);
      if (M.estado.fallado) terminar();
      else if (N.terminada(t)) terminar();
    } else {
      L.animar(null, dt);
      if (juego.estado === "menu" || juego.estado === "resultados" || juego.estado === "pausa") ME.cortarBotones();
      if (juego.estado === "cargando") M.pintar(0, ahora);
    }
    F.animar(ahora, dt);
    S.cerrarCuadro();
    requestAnimationFrame(cuadro);
  }
  requestAnimationFrame(cuadro);

  globalThis.SABLES = { juego, jugar, aMenu, pausar, seguir, terminar, D, C, E, MU, S, F, L, M, N, DE, ME };
}]);
