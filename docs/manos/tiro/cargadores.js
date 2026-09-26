// Los cargadores: objetos sueltos (comun/interaccion.js) que se sacan de un
// arma, caen, se toman de la mesa y se meten en el pozo de otra.
//
// Cada uno lleva sus balas. Su marco local: el punto de referencia es la boca
// (arriba, de donde sale la bala), el cuerpo va hacia −Y y el espesor sobre X,
// que es sobre lo que se acuesta al caer.
//
// En la mesa hay siempre uno de repuesto por arma, adelante de ella: cuando se
// lo lleva, otro aparece en su lugar. Hay un tope de sueltos por tipo; los más
// viejos tirados se borran.
//
// Uno vacío lleva una franja roja, no se levanta (sí se saca del arma) y,
// tirado, se borra a los 5 s.
(globalThis.__modulos ||= []).push(["tiro/cargadores", [
  "comun/algebra", "comun/interaccion", "tiro/config", "tiro/escena",
], (A, I, C, E) => {
  const { v3, largo, resta, suma, por, rotar, qMul, qMirando, qDeEuler, qDeBase } = A;
  const { MESA, MESA_RIFLES, G, ARRIBA_MANDO } = C;
  const GR = Math.PI / 180;
  const { crear, escenario } = E;

  const MODELOS = {
    pistola: {
      capacidad: 8, grosor: 0.012, agarre: v3(0, -0.11, 0), radio: 0.07,
      enMano: { p: v3(0, 0.1, 0), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "pistola_cargador.glb"); },
    },
    // Curvo: el segundo tramo se va hacia adelante (−Z).
    mp5: {
      capacidad: 30, grosor: 0.011, agarre: v3(0, -0.115, -0.035), radio: 0.07,
      enMano: { p: v3(0, 0.11, 0.035), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "mp5_cargador.glb"); },
    },
    mac10: {
      capacidad: 32, grosor: 0.014, agarre: v3(0, -0.19, 0), radio: 0.07,
      enMano: { p: v3(0, 0.19, 0), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "mac10_cargador.glb"); },
    },
    // El "banana" de la AK: 30 de 7,62×39, bien curvo hacia adelante.
    ak47: {
      capacidad: 30, grosor: 0.011, agarre: v3(0, -0.18, -0.07), radio: 0.08,
      enMano: { p: v3(0, 0.18, 0.07), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "ak47_cargador.glb"); },
    },
    // El de la M14: recto, 20 de 7,62×51.
    m14: {
      capacidad: 20, grosor: 0.012, agarre: v3(0, -0.11, 0), radio: 0.07,
      enMano: { p: v3(0, 0.11, 0), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "m14_cargador.glb"); },
    },
    // El STANAG de la M4: 30 de 5,56, apenas curvo.
    m4: {
      capacidad: 30, grosor: 0.014, agarre: v3(0, -0.12, -0.01), radio: 0.07,
      enMano: { p: v3(0, 0.12, 0.01), r: v3(0, 0, 0) },
      construir(g) { E.modelo(g, "m4_cargador.glb"); },
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

  /** Acostado en la mesa: el X local arriba y la boca hacia la derecha. */
  const Q_ACOSTADO = qDeBase(v3(0, 1, 0), v3(1, 0, 0), v3(0, 0, -1));
  /** El lugar del repuesto de cada arma: adelante de ella, en el borde de la mesa. */
  const REPUESTOS = {
    pistola: v3(0.12, 0, MESA.z + MESA.fondo / 2 - 0.08),
    mp5: v3(0.55, 0, MESA.z + MESA.fondo / 2 - 0.06),
    mac10: v3(0.98, 0, MESA.z + MESA.fondo / 2 - 0.07),
    // Los de los rifles, en el borde de su mesa, lejos de las armas.
    ak47: v3(MESA_RIFLES.x - 0.2, 0, MESA_RIFLES.z + MESA_RIFLES.fondo / 2 - 0.12),
    m14: v3(MESA_RIFLES.x - 0.47, 0, MESA_RIFLES.z + MESA_RIFLES.fondo / 2 - 0.12),
    m4: v3(MESA_RIFLES.x + 0.4, 0, MESA_RIFLES.z + MESA_RIFLES.fondo / 2 - 0.12),
  };
  const lugarDe = (tipo) => v3(REPUESTOS[tipo].x, E.apoyo(REPUESTOS[tipo].x, REPUESTOS[tipo].z) + MODELOS[tipo].grosor, REPUESTOS[tipo].z);
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

  const enSuLugar = (u) => u.estado === "apoyado" && largo(resta(u.p, lugarDe(u.tipo))) < 0.03;
  const reponerEn = {};
  for (const tipo in MODELOS) nuevo(tipo, { p: lugarDe(tipo), q: Q_ACOSTADO });

  function quitar(u) {
    u.el.remove();
    todos.splice(todos.indexOf(u), 1);
  }

  function animar(t, dt) {
    for (const u of todos) u.animar(dt);
    // Los vacíos: la franja, y los tirados se van a los 5 s.
    for (const u of todos.slice()) {
      const vacio = u.balas <= 0;
      if (vacio !== u.marcado) { u.marcado = vacio; u.franja.setAttribute("visible", vacio ? "inherit" : "false"); }
      if (!vacio || !tirado(u)) { u.vacioDesde = 0; continue; }
      if (!u.vacioDesde) u.vacioDesde = t;
      else if (t - u.vacioDesde >= VACIO_MS) quitar(u);
    }
    for (const tipo in MODELOS) {
      if (todos.some((u) => u.tipo === tipo && enSuLugar(u))) { reponerEn[tipo] = 0; continue; }
      if (!reponerEn[tipo]) { reponerEn[tipo] = t + REPONER_MS; continue; }
      if (t < reponerEn[tipo]) continue;
      reponerEn[tipo] = 0;
      nuevo(tipo, { p: lugarDe(tipo), q: Q_ACOSTADO });
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
