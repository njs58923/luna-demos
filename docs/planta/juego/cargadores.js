// Los cargadores: objetos sueltos (comun/interaccion.js) que se sacan de un
// arma, caen, se toman del bolsillo y se meten en el pozo de otra.
//
// Cada uno lleva sus balas. Su marco local: el punto de referencia es la boca
// (arriba, de donde sale la bala), el cuerpo va hacia −Y y el espesor sobre X,
// que es sobre lo que se acuesta al caer.
//
// En el cinturón hay siempre uno de repuesto por arma, en su bolsillo
// (cuerpo.js): parado, con la boca arriba, siguiendo al jugador. Cuando se lo
// lleva, otro aparece en su lugar. Hay un tope de sueltos por tipo; los más
// viejos tirados se borran.
//
// Uno vacío lleva una franja roja, no se levanta (sí se saca del arma) y,
// tirado, se borra a los 5 s.
(globalThis.__modulos ||= []).push(["juego/cargadores", [
  "comun/algebra", "comun/interaccion", "juego/config", "juego/escena", "juego/cuerpo",
], (A, I, C, E, P) => {
  const { v3, largo, resta, suma, por, rotar, qMul, qMirando, qDeEuler, qDeBase } = A;
  const { G, ARRIBA_MANDO } = C;
  const GR = Math.PI / 180;
  const { crear, escenario } = E;

  const MODELOS = {
    pistola: {
      capacidad: 8, grosor: 0.012, agarre: v3(0, -0.11, 0), radio: 0.07,
      enMano: { p: v3(0, 0.1, 0), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "pistola_cargador.glb"); },
    },
    // El de la Desert Eagle: siete de .50.
    deagle: {
      capacidad: 7, grosor: 0.013, agarre: v3(0, -0.11, 0), radio: 0.07,
      enMano: { p: v3(0, 0.1, 0), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "deagle_cargador.glb"); },
    },
  };

  /** En la mano, cada cargador va **fijo respecto del mando**, no como se lo
   *  agarró: así el gesto de cargar es siempre el mismo. El marco es el de las
   *  armas (el −Z sobre el rayo del mando, el +Y hacia su cara de arriba), y
   *  `enMano` (en cada modelo) lo corre y lo gira ahí. De fábrica la base del
   *  cargador queda en la mano, con la boca para arriba y el frente hacia
   *  adelante: con el arma derecha en la otra mano, ya viene alineado con el
   *  pozo. Se ajusta por arma (ajustes.js, "Cargador en la mano"). */
  function poseEnMano(tipo, ctx) {
    const e = MODELOS[tipo].enMano;
    const d = ctx.d || rotar(ctx.q, v3(0, -1, 0));
    const marco = qMirando(d, rotar(ctx.q, ARRIBA_MANDO));
    return { p: suma(ctx.pos, rotar(marco, e.p)), q: qMul(marco, qDeEuler(e.r.x * GR, e.r.y * GR, e.r.z * GR)) };
  }

  /** El bolsillo de cada tipo: el de la G17, a la izquierda (la mano que no
   *  tira la saca), y el de la Desert Eagle, a la derecha. */
  const BOLSILLOS = { pistola: "left", deagle: "right" };
  /** El repuesto en su bolsillo: parado, con la boca arriba y el frente del
   *  cargador hacia el frente del cuerpo. */
  const enBolsillo = (tipo) => ({ p: P.bolsillo(BOLSILLOS[tipo] || "left"), q: qMirando(P.frente, v3(0, 1, 0)) });
  const TOPE_POR_TIPO = 5;
  const REPONER_MS = 600;
  /** Un cargador vacío tirado se borra solo a los 5 s. */
  const VACIO_MS = 5000;
  /** Dónde está un cargador que no está en un arma ni en una mano. */
  const tirado = (u) => !u.mano && (u.estado === "apoyado" || u.estado === "cae");

  const todos = [];
  let guias = () => [];
  let cuenta = 0;

  function nuevo(tipo, pose) {
    const m = MODELOS[tipo];
    const el = crear("group", { id: "cargador_" + tipo + "_" + ++cuenta }, escenario);
    m.construir(el);
    // Vacío se marca: una franja roja que lo abraza a media altura, sin luz
    // para que se vea igual de lejos. Apagada mientras tenga balas.
    const franja = crear("box", {
      class: "vacio", x: m.agarre.x, y: m.agarre.y * 0.55, z: m.agarre.z * 0.55,
      sx: m.grosor * 2 + 0.006, sy: 0.012, sz: 0.085, color: "#FF2D2D",
      "material-unlit": "true", visible: "false", touchable: "false",
    }, el);
    const u = I.suelto({
      nodo: el, agarre: m.agarre, radio: m.radio, grosor: m.grosor, apoyo: E.apoyo, guias: () => guias(), G,
      enMano: (ctx) => poseEnMano(tipo, ctx),
    });
    u.id = "cargador_" + tipo + "_" + cuenta;
    u.el = el;
    u.tipo = tipo;
    u.balas = m.capacidad;
    u.creado = cuenta;
    u.franja = franja;
    u.marcado = false;
    u.vacioDesde = 0;
    if (pose) u.poner(pose);
    todos.push(u);
    return u;
  }

  /** Uno puesto en una guía, como sale de fábrica el arma. */
  function puestoEn(tipo, guia) {
    const u = nuevo(tipo, guia.pose(guia.o.largo));
    u.estado = "puesto";
    u.guia = guia;
    u.s = guia.o.largo;
    guia.ocupante = u;
    return u;
  }

  /** El de repuesto de cada tipo, mientras está en el bolsillo. */
  const repuestos = {};
  const enSuLugar = (u) => repuestos[u.tipo] === u;
  const reponerEn = {};
  function reponer(tipo) {
    const u = nuevo(tipo, enBolsillo(tipo));
    repuestos[tipo] = u;
  }
  for (const tipo in MODELOS) reponer(tipo);

  function quitar(u) {
    u.el.remove();
    todos.splice(todos.indexOf(u), 1);
  }

  function animar(t, dt) {
    // El repuesto sigue al bolsillo hasta que una mano lo toma.
    for (const tipo in repuestos) {
      const u = repuestos[tipo];
      if (!u) continue;
      if (u.mano || u.estado !== "apoyado") { repuestos[tipo] = null; continue; }
      u.poner(enBolsillo(tipo));
    }
    for (const u of todos) if (!enSuLugar(u)) u.animar(dt);
    // Los vacíos: la franja, y los tirados se van a los 5 s.
    for (const u of todos.slice()) {
      const vacio = u.balas <= 0;
      if (vacio !== u.marcado) { u.marcado = vacio; u.franja.setAttribute("visible", vacio ? "inherit" : "false"); }
      if (!vacio || !tirado(u)) { u.vacioDesde = 0; continue; }
      if (!u.vacioDesde) u.vacioDesde = t;
      else if (t - u.vacioDesde >= VACIO_MS) quitar(u);
    }
    for (const tipo in MODELOS) {
      if (repuestos[tipo]) { reponerEn[tipo] = 0; continue; }
      if (!reponerEn[tipo]) { reponerEn[tipo] = t + REPONER_MS; continue; }
      if (t < reponerEn[tipo]) continue;
      reponerEn[tipo] = 0;
      reponer(tipo);
      // El tope: se borran los más viejos que estén tirados (ni en una mano,
      // ni en un arma, ni el de repuesto).
      const deTipo = todos.filter((u) => u.tipo === tipo);
      let sobran = deTipo.length - TOPE_POR_TIPO;
      for (const u of deTipo) {
        if (sobran <= 0) break;
        if (u.mano || u.estado === "puesto" || u.estado === "guia" || enSuLugar(u)) continue;
        quitar(u);
        sobran--;
      }
    }
  }

  return {
    MODELOS, todos, nuevo, puestoEn, animar,
    /** Las guías donde puede entrar un cargador: las pone armas.js. */
    conectar(fn) { guias = fn; },
    /** Los que se pueden tomar: vacíos, sólo para sacarlos del arma. */
    agarrables: () => todos.filter((u) => u.balas > 0 || u.estado === "puesto" || u.estado === "guia" || u.mano),
  };
}]);
