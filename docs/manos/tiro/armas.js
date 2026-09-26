// Las armas de la mesa: cómo son, cómo tiran y cómo se recargan, armadas con
// las piezas de comun/interaccion.js.
//
// Todas comparten el marco local: la empuñadura en el origen, el cañón hacia
// −Z y la parte de arriba hacia +Y. En la mano, el −Z va sobre el rayo del
// mando; `boca` es de donde sale el tiro.
//
// Cada tipo declara sus mecanismos, y con eso se arma solo:
//
//   cierre      "cerrado": tira la bala de la recámara y cada tiro mete la
//               siguiente del cargador (pistola, MP5). "abierto": el cerrojo se
//               monta atrás, el gatillo lo suelta y tira directo del cargador;
//               al vaciarse cierra adelante y hay que volver a montarlo (MAC-10).
//   corredera   el riel que se tira a mano: la corredera, la manija de carga o
//               la perilla del cerrojo. Llevarla al tope y soltarla recarga la
//               recámara (cerrado) o monta el cerrojo (abierto).
//   pozo        la guía del cargador: la boca, el eje, cuánto recorre hasta
//               calzar y el giro que tiene que traer.
//   delantera   si tiene, dónde toma la otra mano para tirar con dos.
//
// Los modelos son .glb de public/modelos/, uno para el cuerpo y otro para la
// pieza que se mueve: los "Low-Poly" de TastyTony en Sketchfab (CC-BY 4.0),
// adaptados con blender/sketchfab.py. Las medidas de acá salen de ellos.
// `modelo` es la versión de esa geometría: si cambia, los puntos ajustados y
// guardados de la versión anterior se descartan (tiro/ajustes.js).
//
// Además cada arma tiene su `empunadura`: dónde queda respecto del mando al
// tomarla (posición en metros y giro en grados, en el marco del rayo). Los
// valores de fábrica salen de ajustarlas a mano con Quest (tiro/ajustes.js);
// cada mando tiene el gatillo en otro lado, así que se reajustan y se guardan.
//
// La dispersión y la subida son en grados y se acumulan tiro a tiro (`porTiro`)
// hasta `max`, y vuelven solas a razón de `vuelve` por segundo; con dos manos,
// a la mitad. La base es 0: el primer tiro de una ráfaga sale exacto. La
// pistola no tiene ni una ni otra: su retroceso es sólo visual.
(globalThis.__modulos ||= []).push(["tiro/armas", [
  "comun/algebra", "comun/interaccion", "tiro/config", "tiro/escena", "tiro/sonidos", "tiro/juego", "tiro/cargadores",
], (A, I, C, E, S, J, K) => {
  const { v3, suma, resta, por, largo, unitario, rotar, qMul, qConj, qEnX, qDeEuler, qMirando, ADELANTE, ARRIBA } = A;
  const { MESA, MESA_RIFLES, ARRIBA_MANDO } = C;
  const { crear, modelo, poner, escenario, otroAzar } = E;
  const grados = (g) => (g * Math.PI) / 180;
  /** El eje de una empuñadura inclinada `a` radianes en X: por ahí entra el cargador. */
  const ejeInclinado = (a) => v3(0, Math.cos(a), Math.sin(a));

  /** El pozo: el cargador entra por abajo y calza con la boca en `tope`,
   *  subiendo por un eje inclinado `inclinacion` radianes en X. */
  function pozoEnEmpunadura(tope, inclinacion, recorrido) {
    const eje = ejeInclinado(inclinacion);
    return { entrada: resta(tope, por(eje, recorrido)), eje, largo: recorrido, q: qEnX(inclinacion) };
  }

  const TIPOS = {
    // ── Pistola ─────────────────────────────────────────────────────────────
    // La corredera entera es el riel: se toma por las estrías de atrás. El
    // cargador sube por toda la empuñadura (10 cm) y, vacío, deja la corredera
    // trabada atrás.
    pistola: {
      nombre: "pistola", modelo: 2, automatica: false, rpm: 0, cierre: "cerrado",
      sonido: "disparo", nombreCorredera: "corredera",
      boca: v3(0, 0.072, -0.1304),
      centro: v3(0, 0.04, -0.06),
      mesa: { dx: -0.42, dz: -0.02, alto: 0.014 },
      patada: { ang: 0.3, atras: 0.025, ms: 130 },
      dispersion: { base: 0, porTiro: 0, max: 0, vuelve: 0 },
      subida: { porTiro: 0, max: 0, vuelve: 0 },
      contador: v3(0, 0.115, 0.03),
      empunadura: { p: v3(0, 0.009, -0.025), r: v3(10, 0, 0) },
      // La zona es un cilindro a lo largo de toda la corredera; se llega de
      // arriba o de costado (casi cualquier dirección menos subiendo).
      corredera: { eje: v3(0, 0, 1), largo: 0.04, agarre: v3(0, 0.086, -0.045), radio: 0.065, forma: "cilindro", largoZona: 0.19,
                   dir: { rumbo: 0, altura: -90, cono: 160 }, resorte: 1.5, trabaVacia: true, reciproca: true },
      pozo: pozoEnEmpunadura(v3(0, 0.0788, -0.0119), -0.332, 0.1),
      construir(g, id) {
        modelo(g, "pistola_cuerpo.glb");
        const corredera = crear("group", { id: "corredera_" + id }, g);
        modelo(corredera, "pistola_corredera.glb");
        return corredera;
      },
    },

    // ── MP5 ─────────────────────────────────────────────────────────────────
    // La manija de carga va en el tubo de arriba, a la izquierda: la manija es
    // chica y corre 8 cm por la ranura. El cargador curvo calza con un
    // recorrido corto (3,5 cm). Se toma con dos manos por el guardamanos.
    mp5: {
      nombre: "MP5", modelo: 2, automatica: true, rpm: 800, cierre: "cerrado",
      sonido: "disparo_mp5", nombreCorredera: "manija",
      boca: v3(0, 0.048, -0.366),
      centro: v3(0, 0.03, -0.1),
      mesa: { dx: 0.02, dz: 0.1, alto: 0.026 },
      patada: { ang: 0.06, atras: 0.012, ms: 60 },
      dispersion: { base: 0, porTiro: 0.08, max: 1.0, vuelve: 5 },
      subida: { porTiro: 0.3, max: 3, vuelve: 6 },
      contador: v3(0, 0.12, 0.07),
      empunadura: { p: v3(0, 0.025, -0.018), r: v3(5, 0, 0) },
      // La manija: un cilindro a lo largo del tubo, al que la mano llega de
      // costado (desde la izquierda, hacia +X). Casi en el mismo lugar está el
      // guardamanos, al que se llega de abajo: la dirección los separa.
      corredera: { eje: v3(0, 0, 1), largo: 0.08, agarre: v3(-0.045, 0.074, -0.25), radio: 0.045, forma: "cilindro", largoZona: 0.08,
                   dir: { rumbo: 90, altura: 0, cono: 110 }, resorte: 1.2, trabaVacia: false },
      pozo: pozoEnEmpunadura(v3(0, -0.0028, -0.1179), 0.2, 0.035),
      delantera: { punto: v3(0, 0.035, -0.26), radio: 0.08, dir: { rumbo: 0, altura: 90, cono: 120 } },
      construir(g, id) {
        modelo(g, "mp5_cuerpo.glb");
        const manija = crear("group", { id: "corredera_" + id }, g);
        modelo(manija, "mp5_manija.glb");
        return manija;
      },
    },

    // ── MAC-10 ──────────────────────────────────────────────────────────────
    // Cerrojo abierto: la perilla de arriba se tira atrás y queda montada.
    // Más de mil tiros por minuto: se abre y sube mucho, que es su fama. El
    // cargador sube por la empuñadura, como en la pistola, 14 cm.
    mac10: {
      nombre: "MAC-10", modelo: 2, automatica: true, rpm: 1100, cierre: "abierto",
      sonido: "disparo_mac10", nombreCorredera: "perilla",
      boca: v3(0, 0.045, -0.1948),
      centro: v3(0, 0.0, -0.05),
      mesa: { dx: 0.42, dz: -0.05, alto: 0.025 },
      patada: { ang: 0.09, atras: 0.015, ms: 50 },
      dispersion: { base: 0, porTiro: 0.2, max: 2.5, vuelve: 4 },
      subida: { porTiro: 0.7, max: 6, vuelve: 5 },
      contador: v3(0, 0.11, 0.035),
      empunadura: { p: v3(0, 0.06, -0.01), r: v3(5, 0, 0) },
      // La perilla: una esfera arriba, a la que se llega bajando la mano.
      corredera: { eje: v3(0, 0, 1), largo: 0.08, agarre: v3(0, 0.119, -0.094), radio: 0.055,
                   dir: { rumbo: 0, altura: -90, cono: 60 }, resorte: 2, trabaVacia: false },
      pozo: pozoEnEmpunadura(v3(0, 0.048, 0.0007), 0.028, 0.14),
      construir(g, id) {
        modelo(g, "mac10_cuerpo.glb");
        const cerrojo = crear("group", { id: "corredera_" + id }, g);
        modelo(cerrojo, "mac10_perilla.glb");
        return cerrojo;
      },
    },

    // ── AK-47 ───────────────────────────────────────────────────────────────
    // La manija va a la derecha, sobre el portacerrojo: va y viene con cada
    // tiro. 600 por minuto, cierre cerrado y sin traba al vaciarse. El
    // cargador curvo entra corto, adelante del guardamonte. A dos manos por el
    // guardamanos de madera.
    ak47: {
      nombre: "AK-47", modelo: 2, automatica: true, rpm: 600, cierre: "cerrado",
      sonido: "disparo_rifle", nombreCorredera: "manija de carga", rifle: true,
      boca: v3(0, 0.045, -0.5786),
      centro: v3(0, 0.03, -0.1),
      mesa: { tabla: "rifles", dx: 0.15, dz: 0.2, alto: 0.018 },
      patada: { ang: 0.12, atras: 0.02, ms: 90 },
      dispersion: { base: 0, porTiro: 0.12, max: 1.6, vuelve: 4 },
      subida: { porTiro: 0.55, max: 4.5, vuelve: 5 },
      contador: v3(0, 0.1, 0.03),
      empunadura: { p: v3(0, 0.025, -0.018), r: v3(5, 0, 0) },
      // La manija: a la derecha del cajón, se llega de costado (hacia −X).
      corredera: { eje: v3(0, 0, 1), largo: 0.1, agarre: v3(0.033, 0.065, -0.185), radio: 0.045,
                   dir: { rumbo: -90, altura: 0, cono: 120 }, resorte: 1.4, trabaVacia: false, reciproca: true },
      pozo: pozoEnEmpunadura(v3(0, 0.0454, -0.1249), 0.007, 0.04),
      delantera: { punto: v3(0, 0.03, -0.34), radio: 0.08, dir: { rumbo: 0, altura: 90, cono: 120 } },
      construir(g, id) {
        modelo(g, "ak47_cuerpo.glb");
        const manija = crear("group", { id: "corredera_" + id }, g);
        modelo(manija, "ak47_manija.glb");
        return manija;
      },
    },

    // ── M14 ─────────────────────────────────────────────────────────────────
    // Semiautomático de culata entera de madera. La varilla de operación va a
    // la derecha y va y viene con el tiro; con el último, el cerrojo queda
    // atrás. Cargador recto de 20, que calza corto. Patea más que todos: sube
    // en cada tiro seguido.
    m14: {
      nombre: "M14", modelo: 2, automatica: false, rpm: 0, cierre: "cerrado",
      sonido: "disparo_rifle", nombreCorredera: "varilla de operación", rifle: true,
      boca: v3(0, 0.045, -0.7806),
      centro: v3(0, 0.02, -0.12),
      mesa: { tabla: "rifles", dx: 0.12, dz: -0.33, alto: 0.028 },
      patada: { ang: 0.22, atras: 0.03, ms: 150 },
      dispersion: { base: 0, porTiro: 0, max: 0, vuelve: 0 },
      subida: { porTiro: 1.2, max: 4, vuelve: 5 },
      contador: v3(0, 0.1, 0.05),
      empunadura: { p: v3(0, 0.025, -0.018), r: v3(5, 0, 0) },
      // La manija de la varilla: a la derecha, se llega de costado (hacia −X).
      corredera: { eje: v3(0, 0, 1), largo: 0.1, agarre: v3(0.045, 0.04, -0.128), radio: 0.045,
                   dir: { rumbo: -90, altura: 0, cono: 120 }, resorte: 1.6, trabaVacia: true, reciproca: true },
      pozo: pozoEnEmpunadura(v3(0, 0.0316, -0.1079), 0.162, 0.035),
      delantera: { punto: v3(0, 0.02, -0.38), radio: 0.08, dir: { rumbo: 0, altura: 90, cono: 120 } },
      construir(g, id) {
        modelo(g, "m14_cuerpo.glb");
        const varilla = crear("group", { id: "corredera_" + id }, g);
        modelo(varilla, "m14_varilla.glb");
        return varilla;
      },
    },

    // ── M4A1 ────────────────────────────────────────────────────────────────
    // La carabina Colt: 5,56, automática a 800. La manija de carga es la "T"
    // de atrás, arriba del cajón: se toma bajando la mano y se tira hacia la
    // cara; no va y viene con los tiros. Cargador casi recto de 30. A dos
    // manos por el guardamanos.
    m4: {
      nombre: "M4A1", modelo: 2, automatica: true, rpm: 800, cierre: "cerrado",
      sonido: "disparo_rifle", nombreCorredera: "manija de carga", rifle: true,
      boca: v3(0, 0.055, -0.5463),
      centro: v3(0, 0.03, -0.1),
      mesa: { tabla: "rifles", dx: 0.15, dz: -0.08, alto: 0.04 },
      patada: { ang: 0.08, atras: 0.015, ms: 70 },
      dispersion: { base: 0, porTiro: 0.09, max: 1.2, vuelve: 5 },
      subida: { porTiro: 0.35, max: 3.5, vuelve: 6 },
      contador: v3(0, 0.13, 0.03),
      empunadura: { p: v3(0, 0.025, -0.018), r: v3(5, 0, 0) },
      corredera: { eje: v3(0, 0, 1), largo: 0.07, agarre: v3(0, 0.078, 0.022), radio: 0.045,
                   dir: { rumbo: 0, altura: -90, cono: 120 }, resorte: 1.5, trabaVacia: false },
      pozo: pozoEnEmpunadura(v3(0, 0.0494, -0.0979), 0.199, 0.045),
      delantera: { punto: v3(0, 0.045, -0.3), radio: 0.08, dir: { rumbo: 0, altura: 90, cono: 120 } },
      construir(g, id) {
        modelo(g, "m4_cuerpo.glb");
        const manija = crear("group", { id: "corredera_" + id }, g);
        modelo(manija, "m4_manija.glb");
        return manija;
      },
    },
  };

  /** Apoyadas de costado sobre la mesa, con el cañón hacia adelante. Los
   *  rifles, a lo ancho de la suya: el cañón hacia −X y la parte de arriba
   *  hacia el que llega. */
  const Q_MESA = qMirando(ADELANTE, v3(1, 0, 0));
  const Q_RIFLES = qMirando(v3(-1, 0, 0), v3(0, 0, 1));

  const armas = Object.keys(TIPOS).map((id) => {
    const tipo = TIPOS[id];
    const el = crear("group", { id: "arma_" + id }, escenario);
    const nodoCorredera = tipo.construir(el, id);
    /** Las balas que quedan, en la cola: se leen apuntando. */
    const contador = crear("text", { id: "contador_" + id, x: tipo.contador.x, y: tipo.contador.y, z: tipo.contador.z, value: "", size: 0.026, color: "#40E0D0" }, el);
    const mesa = tipo.mesa.tabla === "rifles" ? MESA_RIFLES : MESA;
    const enMesa = { p: v3(mesa.x + tipo.mesa.dx, mesa.y + tipo.mesa.alto, mesa.z + tipo.mesa.dz), q: tipo.mesa.tabla === "rifles" ? Q_RIFLES : Q_MESA };
    const a = {
      id, tipo, el, contador, enMesa,
      mano: null,          // la que la tiene de la empuñadura
      empunadura: { p: { ...tipo.empunadura.p }, r: { ...tipo.empunadura.r } },
      /** Dónde queda el mando de adelante respecto del guardamanos (sólo las
       *  que se toman con dos manos): de fábrica, justo en él. */
      manoDelantera: { p: v3(0, 0, 0) },
      /** Desde dónde se la toma de la mesa: una zona alrededor de su centro. */
      zonaToma: { forma: "esfera", radio: C.RADIO_TOMAR, largoZona: 0.2 },
      ajustando: false,    // en modo ajuste: no tira y sus piezas no se tocan
      delantera: null,     // la otra, si la toma del guardamanos
      posDelantera: null,
      /** La pose sin la patada (la de la mano o la de la mesa), y la que se ve. */
      pose: enMesa, vista: enMesa,
      cargador: null,      // el suelto que está calzado en el pozo
      recamara: false,     // cierre cerrado: hay bala en la recámara
      montada: false,      // cierre abierto: el cerrojo está atrás, listo
      patada: 0,
      subida: 0,           // grados
      dispersion: tipo.dispersion.base,
      proximo: 0,          // automáticas: cuándo puede salir el tiro siguiente
    };
    const marco = () => a.vista;
    const enMano = () => !!a.mano;
    /** Las piezas del arma: con ella en la mano y fuera del modo ajuste. */
    const operable = () => !!a.mano && !a.ajustando;

    a.corredera = I.riel({
      marco, nodo: nodoCorredera, desde: v3(0, 0, 0), ...tipo.corredera, disponible: operable,
      // Cerrado: la vuelta es la que mete bala. Abierto: el tope es el que monta.
      alLlegar() {
        if (tipo.cierre === "abierto") {
          a.montada = true;
          a.corredera.trabar();
          mostrarBalas(a);
        }
      },
      // Mientras la mano la corre, roza; contra el tope, el golpe.
      alMover(ds) { roce(a, ds); },
      alTope() { S.sonar("tope", 0.9); },
      alVolver() {
        if (tipo.cierre !== "cerrado") return;
        S.sonar("corredera", 0.8);
        // Si había una en la recámara, sale expulsada: se pierde.
        a.recamara = false;
        alimentar(a);
        mostrarBalas(a);
      },
    });

    a.pozo = I.guia({
      marco, ...tipo.pozo, holgura: 0.04, tolerancia: 30, disponible: operable,
      acepta: (u) => u.tipo === id,
      alAsentar(u) {
        a.cargador = u;
        S.sonar("cargador", 0.9);
        mostrarBalas(a);
        J.ultimo(tipo.cierre === "abierto"
          ? (a.montada ? "cargada" : "cargador puesto: tirá de la perilla para montarla")
          : (a.recamara ? "cargada" : "cargador puesto: tirá de la " + tipo.nombreCorredera + " para meter bala"));
      },
      alSalir() {
        a.cargador = null;
        S.sonar("vacio", 0.5);
        mostrarBalas(a);
      },
    });

    if (tipo.delantera) {
      a.agarreDelantero = I.agarre({
        marco, punto: () => tipo.delantera.punto,
        radio: tipo.delantera.radio, dir: tipo.delantera.dir,
        disponible: enMano,
        tomar(mano, ctx) { a.delantera = mano; a.posDelantera = ctx.pos; reposar(a); },
        // Si la otra mano la soltó, esta también. Si no, el arma se reorienta
        // ya, con lo último de la mano de atrás: no espera a que ella se mueva.
        mover(mano, ctx) { if (!a.mano) return "soltar"; a.posDelantera = ctx.pos; reposar(a); },
        soltar() { a.delantera = null; a.posDelantera = null; reposar(a); },
      });
    }

    // Sale de fábrica cargada y lista: cargador lleno, bala en la recámara o
    // el cerrojo montado.
    K.puestoEn(id, a.pozo);
    a.cargador = a.pozo.ocupante;
    if (tipo.cierre === "cerrado") alimentar(a);
    else { a.montada = true; a.corredera.trabar(); }
    return a;
  });
  K.conectar(() => armas.map((a) => a.pozo));

  /** El roce de la corredera mientras la mano la mueve: un clip corto que se
   *  vuelve a tocar cada ~70 ms mientras se mueva, más fuerte cuanto más rápido. */
  function roce(a, ds) {
    const ahora = performance.now();
    a.roceAcum = (a.roceAcum || 0) + Math.abs(ds);
    const dt = ahora - (a.roceUlt || 0);
    if (dt < 70 || a.roceAcum < 0.004) return;
    const velocidad = a.roceAcum / (Math.min(dt, 250) / 1000);   // m/s
    S.sonar("roce", Math.max(0.2, Math.min(0.8, velocidad / 0.6)));
    a.roceAcum = 0;
    a.roceUlt = ahora;
  }

  /** Meter en la recámara la de arriba del cargador. Sin balas, la pistola
   *  queda con la corredera trabada atrás (si hay cargador: es su elevador el
   *  que la traba). */
  function alimentar(a) {
    if (a.cargador && a.cargador.balas > 0) {
      a.cargador.balas--;
      a.recamara = true;
    } else if (a.tipo.corredera.trabaVacia && a.cargador) a.corredera.trabar();
  }

  /** Las balas que tiene: las del cargador más la de la recámara. */
  const balas = (a) => (a.cargador ? a.cargador.balas : 0) + (a.recamara ? 1 : 0);
  const puedeTirar = (a) => (a.tipo.cierre === "cerrado" ? a.recamara : a.montada && !!a.cargador && a.cargador.balas > 0);
  function mostrarBalas(a) {
    a.contador.setAttribute("value", (a.cargador ? "" : "—") + String(balas(a)));
    a.contador.setAttribute("color", puedeTirar(a) ? "#40E0D0" : "#FF3B30");
  }

  /** El retén: suelta el cargador, que se desliza fuera del pozo y cae. Sin
   *  cargador, desde ya no alimenta la recámara; el aviso y el sonido son de
   *  la guía, cuando termina de salir. */
  function soltarCargador(a) {
    const u = a.cargador;
    if (!u || u.estado !== "puesto") return false;
    u.estado = "sale";
    a.cargador = null;
    mostrarBalas(a);
    return true;
  }

  /** Apretar sin que salga el tiro: el martillo cae en vacío, o el cerrojo
   *  abierto se cierra solo sobre una recámara vacía. */
  function gatilloEnVacio(a) {
    S.sonar("vacio", 0.9);
    if (a.tipo.cierre === "abierto" && a.montada) {
      a.montada = false;
      a.corredera.destrabar();
    }
    J.ultimo(!a.cargador ? "sin cargador" : balas(a) ? "tirá de la " + a.tipo.nombreCorredera : "sin balas: cambiá el cargador");
    mostrarBalas(a);
  }

  /** Lo que deja un tiro en el arma: la bala, la patada, la subida y la
   *  dispersión que se abre, y el ciclo del cierre. */
  function gastar(a) {
    const t = a.tipo, k = a.delantera ? 0.5 : 1;
    a.patada = 1;
    a.subida = Math.min(t.subida.max, a.subida + t.subida.porTiro * k);
    a.dispersion = Math.min(t.dispersion.max, a.dispersion + t.dispersion.porTiro * k);
    if (t.cierre === "cerrado") {
      a.recamara = false;
      // La corredera de la pistola va y viene con el tiro; la manija de la MP5 no.
      if (t.corredera.reciproca) a.corredera.golpe();
      alimentar(a);
    } else {
      a.cargador.balas--;
      // La última: el cerrojo va adelante y queda cerrado.
      if (!a.cargador.balas) { a.montada = false; a.corredera.destrabar(); }
    }
    mostrarBalas(a);
  }

  /** La pose del arma en la mano `m` ({ pos, q, d }): el frente es el rayo y
   *  el arriba, el del mando, y encima la empuñadura ajustada (corrida y
   *  girada respecto del mando).
   *
   *  Con la otra mano en el guardamanos, el arma gira sobre la de atrás hasta
   *  que el punto de la mano de adelante (el del guardamanos más su ajuste,
   *  "Mano de adelante") quede sobre la recta entre los dos mandos. La
   *  empuñadura entra en la cuenta: si se aplicara después, correría y giraría
   *  el arma y el guardamanos quedaría lejos de la mano. */
  function poseEnMano(a, m) {
    const arriba = m.q ? rotar(m.q, ARRIBA_MANDO) : ARRIBA;
    const e = a.empunadura, g = Math.PI / 180;
    const giro = qDeEuler(e.r.x * g, e.r.y * g, e.r.z * g);
    let base;
    if (a.delantera && a.posDelantera && largo(resta(a.posDelantera, m.pos)) > 0.05) {
      // Del mando de atrás a la mano de adelante, en el marco del mando.
      const adelante = suma(a.tipo.delantera.punto, a.manoDelantera.p);
      const v = unitario(suma(e.p, rotar(giro, adelante)));
      base = qMul(qMirando(unitario(resta(a.posDelantera, m.pos)), arriba), qConj(qMirando(v, ARRIBA)));
    } else {
      const d = m.d || (m.q ? rotar(m.q, v3(0, -1, 0)) : ADELANTE);
      base = qMirando(d, arriba);
    }
    return { p: suma(m.pos, rotar(base, e.p)), q: qMul(base, giro) };
  }

  /** El arma como agarrable: se toma de la mesa por su centro, y al soltarla vuelve. */
  const centroEnMesa = (a) => suma(a.enMesa.p, rotar(a.enMesa.q, a.tipo.centro));
  for (const a of armas) {
    a.agarrable = {
      arma: a,
      distancia(pos, llegada) {
        if (a.mano) return null;
        return I.enZona(a.zonaToma, a.enMesa, a.tipo.centro, pos, llegada);
      },
      tomar(mano, ctx) {
        a.mano = mano;
        a.ctxMano = ctx;
        a.pose = poseEnMano(a, ctx);
        S.sonar("tomar", 0.8);
        J.ultimo(a.tipo.nombre + (a.tipo.automatica ? ": gatillo sostenido para ráfaga" : ": gatillo para tirar")
          + (a.tipo.delantera ? " · la otra mano en el guardamanos" : ""));
        dibujar(a);
      },
      mover(mano, ctx) { a.ctxMano = ctx; a.pose = poseEnMano(a, ctx); dibujar(a); },
      soltar() { aLaMesa(a); S.sonar("tomar", 0.45); },
    };
  }

  /** Recalcular la pose en la mano con lo último que mandó la de atrás. */
  function reposar(a) {
    if (!a.mano || !a.ctxMano) return;
    a.pose = poseEnMano(a, a.ctxMano);
    dibujar(a);
  }
  function dibujar(a) {
    const { p, q } = a.pose;
    const k = a.patada;
    const sube = (a.tipo.patada.ang * k) + grados(a.subida);
    const qv = sube ? qMul(q, qEnX(sube)) : q;
    a.vista = { p: suma(p, rotar(q, v3(0, 0, a.tipo.patada.atras * k))), q: qv };
    poner(a.el, a.vista.p, a.vista.q);
  }
  function aLaMesa(a) {
    a.mano = null;
    a.delantera = null;
    a.posDelantera = null;
    a.pose = a.enMesa;
    a.patada = 0;
    a.subida = 0;
    dibujar(a);
  }

  /** La dirección de un tiro con el arma en `q`: el cañón, más lo que subió y
   *  un punto al azar dentro del cono de dispersión (parejo en el disco). */
  function direccion(a, q) {
    const d = rotar(q, ADELANTE);
    if (!a.subida && !a.dispersion) return d;
    const arriba = rotar(q, ARRIBA), der = rotar(q, v3(1, 0, 0));
    const ang = otroAzar() * Math.PI * 2, r = Math.sqrt(otroAzar()) * Math.tan(grados(a.dispersion));
    return unitario(suma(d, suma(por(arriba, Math.tan(grados(a.subida)) + r * Math.sin(ang)), por(der, r * Math.cos(ang)))));
  }
  const intervalo = (a) => 60000 / a.tipo.rpm;

  function animar(t, dt) {
    for (const a of armas) {
      let cambio = false;
      if (a.patada > 0) {
        a.patada = Math.max(0, a.patada - (dt * 1000) / a.tipo.patada.ms);
        cambio = true;
      }
      if (a.subida > 0) {
        a.subida *= Math.exp(-a.tipo.subida.vuelve * dt);
        if (a.subida < 0.02) a.subida = 0;
        cambio = true;
      }
      const base = a.tipo.dispersion.base;
      if (a.dispersion > base) {
        a.dispersion = base + (a.dispersion - base) * Math.exp(-a.tipo.dispersion.vuelve * dt);
        if (a.dispersion - base < 0.02) a.dispersion = base;
      }
      if (cambio) dibujar(a);
      a.corredera.animar(dt);
    }
  }

  for (const a of armas) { dibujar(a); mostrarBalas(a); }

  /** Volver a poner el arma donde va, con lo último de su mano (después de
   *  ajustar la empuñadura, por ejemplo). */
  function reponer(a) {
    if (a.mano) reposar(a);
    else dibujar(a);
  }

  return {
    TIPOS, armas, balas, puedeTirar, gatilloEnVacio, soltarCargador, gastar, poseEnMano, direccion, intervalo, animar,
    reponer, centroEnMesa,
    /** Todo lo que una mano puede tomar de las armas. */
    agarrables: () => armas.flatMap((a) => [a.agarrable, a.corredera, ...(a.agarreDelantero ? [a.agarreDelantero] : [])]),
  };
}]);
