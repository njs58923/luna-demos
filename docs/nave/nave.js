// La nave: el que junta todo.
//
// Lee las consolas del propio documento, reparte las tareas de la partida con
// la semilla, mantiene el panel delante del jugador, abre los minijuegos y
// mueve la nave cuando alguien se mete en un conducto.
//
// Nada de esto escribe en el estado: todo pasa por acciones (ver estado.js).
// Cuando el juego sea en red, lo único que cambia es el transporte.

const raiz = hiperspace.dimention;
const byId = (id) => raiz.getElementById(id);

/** Los `<script src>` llegan en cualquier orden y el motor no garantiza
 *  ninguno; el framework de interfaz del motor (`UI`) tampoco. En vez de
 *  suponer, se espera a que los tres se hayan presentado. */
function cuandoEsten(nombres, seguir) {
  if (nombres.every((n) => globalThis[n])) return seguir();
  requestAnimationFrame(() => cuandoEsten(nombres, seguir));
}

cuandoEsten(["NAVE_ESTADO", "NAVE_NAV", "KIT", "JUEGOS_KIT", "UI"], () => arrancar(globalThis.NAVE_ESTADO, globalThis.JUEGOS_KIT));

function arrancar(EST, JUEGOS) {
  const TAREAS_POR_PARTIDA = 6;
  const CERCA = 3.2;          // m: a esta distancia se puede usar una consola
  const CERCA_CONDUCTO = 1.6; // m: y ésta para meterse en un conducto
  const CERCA_MATAR = 2.0;    // m: y ésta para matar, siendo el impostor
  // Ayuda de desarrollo y de juego: `?impostor` te hace impostor y
  // `?tripulante` te lo saca; sin nada, sale del sorteo (uno de cada seis).
  const ROL = /[?&]impostor\b/.test(location.search) ? "impostor"
    : /[?&]tripulante\b/.test(location.search) ? "tripulante" : undefined;

  const nave = byId("nave");
  const hud = byId("hud");
  // El vidrio negro del apagón. Va aparte del panel de tareas porque tiene que
  // quedar más lejos que él: el panel se lee igual con la luz cortada.
  const velo = byId("velo");
  const VELO_LEJOS = 2.6;

  // ── Catálogo: lo dicen las consolas del documento ──────────────────────────
  const consolas = raiz.getElementsByClass("consola").map((el) => ({
    el,
    id: String(el.id || "").replace(/^consola_/, ""),
    juego: el.getAttribute("juego"),
    titulo: el.getAttribute("titulo"),
    sala: el.getAttribute("sala"),
    despuesDe: el.getAttribute("despues-de") || null,
  }));
  const porId = new Map(consolas.map((c) => [c.id, c]));
  const conductos = raiz.getElementsByClass("conducto").map((el) => ({
    el, id: String(el.id || ""), anillo: el.getAttribute("anillo"),
    pos: { x: el.position.x, y: el.position.y, z: el.position.z },
  }));
  // La posición de un conducto es local a su grupo; hay que subir al padre.
  for (const c of conductos) {
    const padre = c.el.parent;
    if (padre) {
      c.pos = { x: c.pos.x + padre.position.x, y: c.pos.y + padre.position.y, z: c.pos.z + padre.position.z };
    }
  }

  // Los paneles de emergencia, que se describen igual que las consolas. No son
  // tareas: no los reparte nadie y sólo sirven mientras haya un sabotaje.
  const paneles = raiz.getElementsByClass("sabotaje").map((el) => ({
    el,
    id: String(el.getAttribute("punto") || ""),
    punto: el.getAttribute("punto"),
    arregla: el.getAttribute("arregla"),
    juego: el.getAttribute("juego"),
    titulo: el.getAttribute("titulo"),
    sala: el.getAttribute("sala"),
  }));
  // Lo que se apaga cuando cortan la luz. Cada pieza trae sus dos colores
  // escritos (ver mapa.ts): el cliente no sabe de paletas, copia atributos.
  const pintables = raiz.getElementsByClass("pintable").map((el) => ({
    el, claro: el.getAttribute("claro"), oscuro: el.getAttribute("oscuro"),
  }));
  const lamparas = raiz.getElementsByClass("lampara");
  // La tripulación: cada modelo lleva escrito quién es. Caminan, hacen sus
  // tareas, ven, reportan y votan adentro del reductor (estado.js); acá sólo se
  // los dibuja. Cuando haya red, cada uno de estos nodos va a ser alguien.
  const tripulantes = raiz.getElementsByClass("tripulante").map((el, i) => ({
    el,
    id: el.getAttribute("quien") || ("t" + i),
    nombre: el.getAttribute("nombre") || ("T" + i),
    color: el.getAttribute("tinte") || "#8E9CB4",
    base: { x: el.position.x, y: el.position.y, z: el.position.z },
    fase: i * 1.3,
    // Lo que hace falta para dibujarlo entre tic y tic: de dónde viene, a
    // dónde va, hacia dónde mira ahora y en qué punto del paso está.
    desde: null, hasta: null, yaw: 0, paso: 0, oculto: false,
  }));

  // Los cuerpos: uno por tripulante, escondidos. Aparecen cuando el impostor
  // mata y se tocan para reportar, que es la otra forma de llamar a reunión.
  const cuerpos = raiz.getElementsByClass("cuerpo").map((el) => ({
    el, quien: el.getAttribute("quien"), nombre: el.getAttribute("nombre"),
    pos: { x: el.position.x, z: el.position.z },
  }));

  // ── El mundo: por dónde se camina ─────────────────────────────────────────
  // Lo que necesita el reductor para mover a la tripulación, leído del propio
  // documento: la grilla de `#navegacion`, dónde se para uno en cada consola y
  // en cada conducto, los asientos de la mesa y las salas con su nombre. Es la
  // misma regla de siempre —el documento es la fuente— y es lo que va a hacer
  // que dos pantallas con el mismo documento vean caminar a los mismos.
  const NAV = globalThis.NAVE_NAV;
  const mundo = NAV.mundoDe({
    porId: (id) => { const el = byId(id); return el ? { attr: (k) => el.getAttribute(k) } : null; },
    porClase: (clase) => raiz.getElementsByClass(clase).map((el) => ({
      id: el.id, attr: (k) => el.getAttribute(k),
      x: el.position.x, z: el.position.z, sx: el.scale.x, sy: el.scale.y,
    })),
  });

  // ── La tienda ─────────────────────────────────────────────────────────────
  const tienda = EST.crearTienda();
  // La semilla es lo único que se saca de afuera del reductor: con red, la
  // manda el que abre la sala y con eso todos reparten las mismas tareas.
  const catalogo = consolas.map((c) => ({
    id: c.id, juego: c.juego, titulo: c.titulo, sala: c.sala, despuesDe: c.despuesDe,
  }));
  const semilla = (Date.now() ^ 0x5f3759df) >>> 0;
  const repartidas = EST.repartirTareas(catalogo, semilla, TAREAS_POR_PARTIDA);
  // Ayuda de desarrollo: `?abrir=<consola>` reparte esa tarea y abre su panel
  // al entrar. Sirve para mirar un minijuego desde afuera del visor —el MCP
  // puede mover la cámara y sacar capturas, pero no puede tocar— y para volver
  // a una consola sin caminar hasta ella.
  const pedida = (location.search.match(/[?&]abrir=([\w]+)/) || [])[1];
  if (pedida && porId.has(pedida) && !repartidas.some((t) => t.id === pedida)) {
    const c = porId.get(pedida);
    repartidas.push({ id: c.id, juego: c.juego, titulo: c.titulo, sala: c.sala });
  }
  const tripulacion = tripulantes.map((t) => ({ id: t.id, nombre: t.nombre, color: t.color }));
  tienda.despachar("PARTIDA_NUEVA", { semilla, jugador: "local", tareas: repartidas, tripulacion, mundo, rolJugador: ROL });

  /** Otra partida, con otra semilla: otras tareas y otro orden de sabotajes. */
  function nuevaPartida() {
    const otra = (Date.now() ^ 0x9e3779b9) >>> 0;
    cerrarJuego();
    tienda.despachar("PARTIDA_NUEVA", {
      semilla: otra, jugador: "local", tareas: EST.repartirTareas(catalogo, otra, TAREAS_POR_PARTIDA),
      tripulacion, mundo, rolJugador: ROL,
    });
  }



  // ── Panel de tareas ───────────────────────────────────────────────────────
  // Una aplicación del framework de interfaz, como las consolas. La lista es
  // un ItemsControl con plantilla: agregar o sacar tareas no toca el marcado.
  const panel = new UI.Aplicacion({
    malla: "ui_malla_hud",
    nodos: "ui_nodos_hud",
    ancho: 0.82,
    alto: 0.5,
    x: 0, y: 0, z: 0,
    datos: { titulo: "TAREAS", progreso: "0 / 0", p: 0, filas: [], aviso: "", alarma: "" },
    plantillas: {
      fila: `<TextBlock Text="{Binding texto}" FontSize="0.028" Foreground="{Binding color}"/>`,
    },
  });
  panel.cargar(`<Border Background="#0E1218" CornerRadius="0.03" Padding="0.022">
    <StackPanel Orientation="Vertical" Spacing="0.012">
      <Grid ColumnDefinitions="*,Auto">
        <TextBlock Text="{Binding titulo}" FontSize="0.038" Foreground="#F1C40F"/>
        <TextBlock Grid.Column="1" Text="{Binding progreso}" FontSize="0.038" Foreground="#FFFFFF"/>
      </Grid>
      <ProgressBar Value="{Binding p}" Minimum="0" Maximum="1" Height="0.02"
                   Foreground="#2ECC71" Background="#1B2028"/>
      <TextBlock Text="{Binding alarma}" FontSize="0.034" Foreground="#E74C3C"/>
      <ItemsControl ItemsSource="{Binding filas}" ItemTemplate="fila"/>
      <TextBlock Text="{Binding aviso}" FontSize="0.03" Foreground="#E67E22"/>
    </StackPanel>
  </Border>`);
  panel.correr();

  // Los nombres de las salas vienen escritos en cada piso (ver mapa.ts).
  const NOMBRES_SALA = {};
  for (const s of (mundo && mundo.salas) || []) NOMBRES_SALA[s.id] = s.nombre;

  function pintarPanel() {
    const e = tienda.estado();
    const lista = Object.entries(e.tareas);
    const hechas = lista.filter(([, t]) => t.hecha).length;
    // Las hechas al final: lo que falta va siempre arriba.
    const orden = lista.slice().sort((a, b) => Number(a[1].hecha) - Number(b[1].hecha));
    // Mientras hay reunión, el panel de tareas se corre: el de la votación va
    // en el mismo lugar y tapaba la mitad de los botones.
    if (hud) hud.setAttribute("visible", e.fase === "reunion" ? "false" : "true");
    const miRol = (e.jugadores[e.yo] || {});
    panel.datos.titulo = e.fase === "reunion" ? "REUNION" : miRol.rol === "impostor" ? "IMPOSTOR"
      : !miRol.vivo ? "FANTASMA" : "TAREAS";
    panel.datos.progreso = hechas + " / " + lista.length;
    // La barra es la de toda la tripulación, como en el juego real: las del
    // jugador y las de los que caminan. El número, las del jugador.
    const equipo = EST.tareasDeEquipo(e);
    panel.datos.p = equipo.total ? equipo.hechas / equipo.total : 0;
    // Comunicaciones caídas: el panel deja de mostrar las tareas. Es el
    // sabotaje que no rompe nada y molesta igual.
    const mudo = e.sabotaje && e.sabotaje.tipo === "comunicaciones";
    panel.datos.filas = mudo
      ? [{ texto: "-- sin comunicaciones --", color: "#7F8C8D" }]
      : orden.slice(0, 9).map(([, t]) => ({
        texto: (t.hecha ? "[x] " : "[ ] ") + (NOMBRES_SALA[t.sala] || t.sala) + ": " + t.titulo,
        color: t.hecha ? "#4E5A6B" : "#C8CCD8",
      }));
    if (mudo) { panel.datos.progreso = "? / ?"; panel.datos.p = 0; }
    // El impostor no tiene tareas: tiene un cuchillo, los sabotajes y los
    // conductos, y la barra de la tripulación para saber cuánto le queda.
    if (miRol.rol === "impostor") {
      panel.datos.progreso = equipo.hechas + " / " + equipo.total;
      const listo = "#E74C3C", espera = "#7F8C8D";
      panel.datos.filas = [
        { texto: e.recarga > 0 ? "matar en " + Math.ceil(e.recarga) + " s" : "matar: tocá a alguien de cerca", color: e.recarga > 0 ? espera : listo },
        { texto: e.sabotaje ? "sabotaje en curso" : e.proximo > 0 ? "sabotear en " + Math.ceil(e.proximo) + " s" : "sabotear: tocá un panel rojo", color: e.sabotaje || e.proximo > 0 ? espera : listo },
        { texto: "conductos: tocá una tapa", color: "#C8CCD8" },
        { texto: "que no te vea nadie", color: "#8E9CB4" },
      ];
    } else if (!miRol.vivo && e.fase !== "reunion") {
      panel.datos.filas = [{ texto: "te echaron: seguí con tus tareas", color: "#8E9CB4" }].concat(panel.datos.filas);
    }
    panel.datos.aviso = e.aviso || "";
    panel.datos.alarma = renglonAlarma(e);
    panel.invalidar();
  }

  /** El renglón rojo de arriba de la lista: qué se está rompiendo y cuánto
   *  queda. La cuenta sale del estado, no de un reloj de acá: el que la baja
   *  es el reductor, y con red la va a bajar el mismo tic para todos. */
  function renglonAlarma(e) {
    if (e.fin) {
      const malo = Object.keys(e.jugadores).find((id) => e.jugadores[id].rol === "impostor");
      const quien = malo ? "  (era " + e.jugadores[malo].nombre + ")" : "";
      return (e.fin === "tripulantes" ? "GANARON LOS TRIPULANTES" : "GANARON LOS IMPOSTORES") + quien;
    }
    const s = e.sabotaje;
    if (!s) return "";
    const cat = EST.SABOTAJES[s.tipo];
    const faltan = Object.keys(s.puntos).filter((p) => !s.puntos[p]).length;
    const cuenta = cat.limite ? "  " + Math.max(0, Math.ceil(s.restante)) + "s" : "";
    const puntos = Object.keys(s.puntos).length > 1 ? "  (" + faltan + " puntos)" : "";
    return cat.nombre + cuenta + puntos;
  }

  /** Las luces de los paneles de emergencia: apagadas si no pasa nada, rojas
   *  si hay que ir, verdes si ese punto ya se arregló. */
  function pintarAlarmas() {
    const e = tienda.estado();
    for (const pnl of paneles) {
      const luz = byId("alarma_" + pnl.punto);
      if (!luz) continue;
      const activo = e.sabotaje && e.sabotaje.tipo === pnl.arregla;
      luz.setAttribute("color", !activo ? "#3D4654" : e.sabotaje.puntos[pnl.punto] ? "#2ECC71" : "#E74C3C");
    }
  }

  /** El apagón. El motor dibuja las primitivas de HSML sin iluminar, así que
   *  no hay ninguna luz que bajar: cortar la luz es repintar la nave con el
   *  color oscuro que cada pieza trae escrito, y apagar los tubos del techo
   *  —que son modelos y no se pueden repintar, pero sí esconder—. */
  let apagon = null;
  function pintarLuz() {
    const e = tienda.estado();
    const oscuro = !!(e.sabotaje && e.sabotaje.tipo === "luces");
    if (oscuro === apagon) return;
    apagon = oscuro;
    for (const t of pintables) t.el.setAttribute("color", oscuro ? t.oscuro : t.claro);
    for (const l of lamparas) l.setAttribute("visible", oscuro ? "false" : "true");
    // Los modelos no se pueden repintar —el .glb trae su material y la luz
    // ambiente del motor no baja desde un script—, así que lo que los apaga es
    // el velo: un vidrio negro delante de la cara. Ver pagina.ts.
    if (velo) velo.setAttribute("visible", oscuro ? "true" : "false");
  }

  function pintarLuces() {
    const e = tienda.estado();
    for (const c of consolas) {
      const t = e.tareas[c.id];
      const luz = byId("luz_" + c.id);
      if (!luz) continue;
      const bloqueada = t && c.despuesDe && !(e.tareas[c.despuesDe] || {}).hecha;
      luz.setAttribute("color", !t ? "#3D4654" : t.hecha ? "#2ECC71" : bloqueada ? "#7F8C8D" : "#F1C40F");
    }
  }

  // El sonido de los cambios de estado se decide comparando con lo anterior:
  // así no hay que acordarse de tocar un clip en cada lugar que despacha.
  let eco = { sabotaje: null, fase: "jugando", fin: null, resultado: null, muertos: 0 };
  function sonarCambios() {
    const e = tienda.estado();
    const tipo = e.sabotaje && e.sabotaje.tipo;
    if (tipo !== eco.sabotaje) {
      if (tipo === "luces") sonar("apagon");
      else if (tipo && EST.SABOTAJES[tipo].critico) sonar("alarma");
      else if (tipo) sonar("error");
      eco.sabotaje = tipo;
    }
    if (e.fase !== eco.fase) {
      if (e.fase === "reunion") sonar("alarma");
      eco.fase = e.fase;
    }
    const res = e.reunion && e.reunion.resultado;
    if (res !== eco.resultado) {
      if (res && res !== "nadie") sonar("expulsion");
      eco.resultado = res;
    }
    const muertos = Object.keys(e.cuerpos).length;
    if (muertos > eco.muertos) {
      // Sólo si el cuerpo está cerca: enterarse de una muerte al otro lado de
      // la nave sería saber algo que el jugador no puede saber.
      const p = jugador();
      const cerca = p && cuerpos.some((c) => e.cuerpos[c.quien] && distancia(p, c.pos) < 14);
      if (cerca) sonar("error");
      eco.muertos = muertos;
    } else if (muertos < eco.muertos) eco.muertos = muertos;
    if (e.fin !== eco.fin) {
      if (e.fin === "tripulantes") sonar("listo");
      else if (e.fin) sonar("expulsion");
      eco.fin = e.fin;
    }
  }

  tienda.suscribir(() => {
    pintarPanel(); pintarLuces(); pintarAlarmas(); pintarLuz(); pintarTripulacion(); sonarCambios();
    // Un sabotaje deja `abierta` en null: la tarea que estaba a medio hacer se
    // cancela. El panel de interfaz hay que tirarlo acá, porque el reductor no
    // sabe de nodos.
    const e = tienda.estado();
    if (abierto && !abierto.sabotaje && e.abierta !== abierto.cosa.id) cerrarJuego();
  });
  pintarPanel();
  pintarLuces();
  pintarAlarmas();

  /** El sonido es opcional: si el permiso `audio` no está, sonido.js deja
   *  `tocar` en nada y acá no hay que preguntar nada. */
  const sonar = (nombre) => { if (globalThis.SONIDO) globalThis.SONIDO.tocar(nombre); };

  let avisoHasta = 0;
  function avisar(texto, ms) {
    tienda.despachar("AVISO", { texto });
    avisoHasta = performance.now() + (ms || 2500);
  }

  /** Un aviso de "no se puede": el mismo texto de siempre, más el zumbido. */
  function negar(texto) {
    sonar("error");
    return avisar(texto);
  }

  // ── Dónde está el jugador ─────────────────────────────────────────────────
  const desplazamiento = { x: 0, y: 0, z: 0 };   // lo que se movió la nave
  let pose = null;

  function leerPose() {
    if (typeof raiz.readViewerPose !== "function") return null;
    const p = raiz.readViewerPose();
    return p && Number.isFinite(p.px) ? p : null;
  }
  /** La posición del jugador en coordenadas de nave. */
  function jugador() {
    if (!pose) return null;
    return { x: pose.px - desplazamiento.x, y: pose.py - desplazamiento.y, z: pose.pz - desplazamiento.z };
  }
  const distancia = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const yo = () => tienda.estado().jugadores[tienda.estado().yo] || {};
  const soyImpostor = () => yo().rol === "impostor";

  // ── Minijuegos ────────────────────────────────────────────────────────────
  // Un juego a la vez, montado con el kit (kit.js + juegos.js) sobre el grupo
  // `cara_<id>` del mueble: piezas físicas de verdad, no una pantalla plana.
  let abierto = null;   // { cosa, ctl, grupo, sinDistancia, sabotaje }

  function cerrarJuego(motivo) {
    if (!abierto) return;
    if (abierto.ctl) {
      try { abierto.ctl.cerrar(); } catch (e) { console.error("[nave] cerrar:", e && e.message || e); }
    }
    const era = abierto;
    abierto = null;
    // El vidrio vuelve a ser el que se toca para abrir; mientras el juego
    // estaba montado, tocar el fondo no tenía que reabrirlo de cero.
    era.cosa.el.setAttribute("touchable", "true");
    // Un panel de emergencia no es una tarea: no hay ninguna que cerrar.
    if (!era.sabotaje) tienda.despachar("TAREA_CERRADA", {});
    if (motivo) avisar(motivo);
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /** Monta un juego sobre la cara de una caja de tarea.
   *
   *  Es el mismo trabajo para una consola de tarea y para un panel de
   *  emergencia —el kit adentro del grupo `cara_<id>`, y tirarlo al cerrar—,
   *  así que lo único que cambia va por parámetro: qué se despacha al
   *  terminar. Devuelve si quedó abierto. */
  function montar(cosa, o) {
    const grupo = byId("grupo_" + cosa.id);
    const cara = byId("cara_" + cosa.id);
    if (!grupo || !cara) return false;
    if (!JUEGOS[cosa.juego]) { avisar("sin juego: " + cosa.juego); return false; }
    const p = jugador();
    if (!o.sinDistancia && p && distancia(p, { x: grupo.position.x, z: grupo.position.z }) > CERCA) {
      negar(o.cerca);
      return false;
    }
    if (abierto) cerrarJuego();

    const mensajeEl = byId("mensaje_" + cosa.id);
    const azar = EST.azarDe((tienda.estado().semilla ^ hash(cosa.id)) >>> 0);
    let ctl;
    try {
      ctl = JUEGOS._montar(raiz, cara, cosa.juego, {
        base: cara.getAttribute("base"),
        version: cara.getAttribute("version"),
        azar,
        alMensaje: (txt) => { if (mensajeEl) mensajeEl.setAttribute("value", txt || ""); },
        alCompletar: () => { cerrarJuego(); o.alCompletar(cosa); },
      });
    } catch (err) {
      console.error("[nave] al abrir " + cosa.juego + ":", err && err.message || err);
      return false;
    }
    // `sinDistancia` viene de las ayudas `?abrir=` y `?sabotaje=`: si además no
    // se exime del cierre por alejarse, el panel se cierra al cuadro siguiente,
    // porque el que mira está lejos. Costó un rato entenderlo.
    abierto = { cosa, ctl, grupo, sinDistancia: o.sinDistancia, sabotaje: !!o.sabotaje };
    // Con el juego montado, el vidrio de fondo deja de ser tocable: si no, un
    // toque en el hueco entre piezas volvía a montar todo de cero y se perdía
    // lo que ya se había hecho.
    cosa.el.setAttribute("touchable", "false");
    sonar("panel");
    return true;
  }

  function abrirJuego(c, sinDistancia) {
    const e = tienda.estado();
    const t = e.tareas[c.id];
    if (e.fin) return;
    // Con la nave fundiéndose no se hacen tareas. Es la regla del juego real y
    // además es la que hace que un sabotaje crítico se sienta crítico.
    const sab = e.sabotaje && EST.SABOTAJES[e.sabotaje.tipo];
    if (sab && sab.critico) return negar("primero arreglá la nave");
    if (soyImpostor()) return negar("sos el impostor: las tareas son de mentira");
    if (!t) return negar("esa tarea no es tuya");
    if (t.hecha) return negar("ya la hiciste");
    if (!sinDistancia && c.despuesDe && !(e.tareas[c.despuesDe] || {}).hecha) {
      const previa = porId.get(c.despuesDe);
      return negar("primero: " + (previa ? previa.titulo.toLowerCase() : c.despuesDe));
    }
    const ok = montar(c, {
      y: 1.72, z: 0.16, sinDistancia, cerca: "acercate a la consola",
      alCompletar: (x) => { sonar("listo"); tienda.despachar("TAREA_HECHA", { consola: x.id }); avisar("tarea lista"); },
    });
    if (ok) tienda.despachar("TAREA_ABIERTA", { consola: c.id });
  }

  function abrirSabotaje(pnl, sinDistancia) {
    const e = tienda.estado();
    // Siendo el impostor, un panel de emergencia sin nada roto es el lugar
    // desde donde se rompe. Hay que ir hasta ahí: el que te vea en el reactor
    // justo cuando empieza a fundirse, se va a acordar.
    if (soyImpostor() && !e.sabotaje) {
      if (e.proximo > 0) return negar("podés sabotear en " + Math.ceil(e.proximo) + " s");
      const p = jugador();
      if (!sinDistancia && p && distancia(p, { x: pnl.el.parent.position.x, z: pnl.el.parent.position.z }) > CERCA) return negar("acercate al panel");
      sonar("error");
      return tienda.despachar("SABOTAJE", { tipo: pnl.arregla });
    }
    if (!e.sabotaje) return negar("no hay nada roto");
    if (e.sabotaje.tipo !== pnl.arregla) return negar("esto no es lo que falla");
    if (e.sabotaje.puntos[pnl.punto]) return negar("este punto ya está");
    montar(pnl, {
      y: 1.62, z: 0.12, sinDistancia, sabotaje: true, cerca: "acercate al panel",
      alCompletar: (x) => { sonar("listo"); tienda.despachar("SABOTAJE_ARREGLADO", { punto: x.id }); },
    });
  }

  for (const c of consolas) c.el.addEventListener("toque", () => abrirJuego(c));
  for (const pnl of paneles) pnl.el.addEventListener("toque", () => abrirSabotaje(pnl));

  // Las manos: el posezone `zona` cubre toda la planta (ver pagina.ts) y manda
  // un posemove por mando en cada cuadro; se lo pasa al panel abierto, si hay
  // uno. Sin nada montado, no hay a quién dárselo.
  const zona = byId("zona");
  if (zona) zona.addEventListener("posemove", (evt) => { if (abierto) abierto.ctl.mano(evt); });

  // ── Conductos ─────────────────────────────────────────────────────────────
  // El motor no deja mover al jugador, así que se mueve la nave: el jugador
  // queda quieto en el mundo y aparece en otra sala del barco.
  for (const v of conductos) {
    v.el.addEventListener("toque", () => {
      const p = jugador();
      if (p && distancia(p, v.pos) > CERCA_CONDUCTO) return negar("parate sobre el conducto");
      const anillo = conductos.filter((o) => o.anillo === v.anillo);
      const i = anillo.findIndex((o) => o.id === v.id);
      const destino = anillo[(i + 1) % anillo.length];
      if (!destino || !p) return;
      desplazamiento.x += p.x - destino.pos.x;
      desplazamiento.z += p.z - destino.pos.z;
      nave.position = { x: desplazamiento.x, y: desplazamiento.y, z: desplazamiento.z };
      tienda.despachar("VENTEO", { jugador: "local", desde: v.id, hasta: destino.id });
      sonar("conducto");
      avisar("conducto: " + destino.id.replace("conducto_", ""));
      cerrarJuego();
    });
  }

  // ── Botón de emergencia ───────────────────────────────────────────────────
  const boton = byId("boton_emergencia");
  if (boton) {
    boton.addEventListener("toque", () => {
      const e = tienda.estado();
      if (e.fase === "reunion" || e.fin) return;
      if (!yo().vivo) return negar("los fantasmas no llaman reuniones");
      // Con la nave a punto de romperse no hay asamblea: es la regla del juego
      // real y evita que el botón sea una salida de emergencia.
      const sab = e.sabotaje && EST.SABOTAJES[e.sabotaje.tipo];
      if (sab && sab.critico) return negar("no con la nave rompiéndose");
      cerrarJuego();
      tienda.despachar("REUNION_LLAMADA", { por: "vos" });
    });
  }

  // ── La reunión ────────────────────────────────────────────────────────────
  // Un panel más del framework, que se arma al abrirse la reunión y se tira al
  // cerrarla. Lo que hace no es decidir nada: manda un VOTO y espera a que el
  // reductor cuente. Los demás dicen lo suyo y votan adentro del reductor (ver
  // la reunión, dicha por ellos, en estado.js): acá sólo se muestra.
  const grupoReunion = byId("grupo_reunion");
  let reunion = null;   // { app, t, cerrarEn, dichos }

  function abrirReunion() {
    const e = tienda.estado();
    const vivos = Object.keys(e.jugadores).filter((id) => e.jugadores[id].vivo);
    const app = new UI.Aplicacion({
      malla: "ui_malla_reunion", nodos: "ui_nodos_reunion",
      ancho: 1.16, alto: 0.8, x: 0, y: 0, z: 0,
      datos: { reloj: "", pie: "tocá a quién echás", titulo: "REUNION DE EMERGENCIA", dichos: [] },
      plantillas: {
        dicho: `<TextBlock Text="{Binding texto}" FontSize="0.034" Foreground="{Binding color}"/>`,
      },
    });
    const boton = (id, i) => {
      const j = e.jugadores[id];
      return `<Button Name="v_${id}" Click="v_${id}" Grid.Row="${Math.floor(i / 2)}" Grid.Column="${i % 2}"
                      Content="${j.nombre}" FontSize="0.05" Foreground="#0B0E14"
                      Background="${j.color}" Margin="0.012" CornerRadius="0.02"/>`;
    };
    const filas = Math.ceil((vivos.length + 1) / 2);
    app.cargar(`<Border Background="#0B1018" CornerRadius="0.03" Padding="0.024">
      <DockPanel>
        <Grid DockPanel.Dock="Top" ColumnDefinitions="*,Auto">
          <TextBlock Text="{Binding titulo}" FontSize="0.05" Foreground="#E74C3C"/>
          <TextBlock Grid.Column="1" Text="{Binding reloj}" FontSize="0.05" Foreground="#FFFFFF"/>
        </Grid>
        <TextBlock DockPanel.Dock="Bottom" Text="{Binding pie}" FontSize="0.042" Foreground="#8E9CB4"/>
        <Border DockPanel.Dock="Bottom" Background="#060A10" CornerRadius="0.015" Padding="0.012" Margin="0,0.01,0,0.01">
          <ItemsControl ItemsSource="{Binding dichos}" ItemTemplate="dicho"/>
        </Border>
        <Grid ColumnDefinitions="*,*" RowDefinitions="${Array(filas).fill("*").join(",")}">
          ${vivos.map(boton).join("")}
          <Button Name="v_nadie" Click="v_nadie" Grid.Row="${Math.floor(vivos.length / 2)}"
                  Grid.Column="${vivos.length % 2}" Content="saltear" FontSize="0.05"
                  Background="#2A303B" Margin="0.012" CornerRadius="0.02"/>
        </Grid>
      </DockPanel>
    </Border>`);
    for (const id of vivos.concat("nadie")) {
      app.manejadores["v_" + id] = () => {
        if (tienda.estado().reunion && tienda.estado().reunion.votos.local !== undefined) return;
        sonar("voto");
        tienda.despachar("VOTO", { por: "local", a: id });
      };
    }
    app.correr();

    reunion = { app, t: 0, cerrarEn: 0, dichos: -1 };
    // Todos a la mesa, como en el juego real: los que caminan ya los sentó el
    // reductor, y al jugador se lo lleva corriendo la nave —como en un
    // conducto—, hasta el primer asiento.
    const p = jugador();
    const lugar = mundo && mundo.asientos[0];
    if (p && lugar) {
      desplazamiento.x += p.x - lugar.x;
      desplazamiento.z += p.z - lugar.z;
      nave.position = { x: desplazamiento.x, y: desplazamiento.y, z: desplazamiento.z };
    }
  }

  function cerrarReunion() {
    if (!reunion) return;
    try { reunion.app.dispose(); } catch (err) { console.error("[nave] reunión:", err && err.message || err); }
    reunion = null;
  }

  function correrReunion(dt) {
    const e = tienda.estado();
    if (e.fase !== "reunion") return cerrarReunion();
    if (!reunion) abrirReunion();
    if (!reunion) return;
    reunion.t += dt;
    const r = e.reunion || {};
    // Lo que dijo cada uno hasta ahora: el reductor ya sabe todo lo que se va
    // a decir y en qué segundo; acá se muestra lo que ya llegó.
    const pasado = EST.REUNION_SEG - (r.restante || 0);
    const dichos = (r.dichos || []).filter((d) => d.en <= pasado);
    if (dichos.length !== reunion.dichos) {
      reunion.dichos = dichos.length;
      reunion.app.datos.dichos = dichos.slice(-5).map((d) => ({
        texto: (e.jugadores[d.quien] || {}).nombre + ": " + d.texto,
        color: (e.jugadores[d.quien] || {}).color || "#C8CCD8",
      }));
      if (dichos.length) sonar("voto");
    }
    if (!r.resultado) {
      const puestos = Object.keys(r.votos || {}).length;
      reunion.app.datos.reloj = Math.max(0, Math.ceil(r.restante || 0)) + "s";
      reunion.app.datos.pie = (r.votos || {}).local !== undefined
        ? "votaste: esperando a los demás (" + puestos + ")"
        : "tocá a quién echás";
    } else {
      reunion.app.datos.reloj = "";
      reunion.app.datos.pie = e.aviso || "";
      if (!reunion.cerrarEn) reunion.cerrarEn = reunion.t + 4;
      if (reunion.t > reunion.cerrarEn) return tienda.despachar("REUNION_CERRADA", {});
    }
    reunion.app.invalidar();
  }

  /** Quién se ve parado, quién tirado y quién ya no está.
   *
   *  Un muerto sin reportar es un cuerpo en el piso; uno reportado o expulsado
   *  no está más. Los tres estados salen del mismo lugar —`jugadores` y
   *  `cuerpos`—, así que no hay forma de que la escena y el estado discutan. */
  function pintarTripulacion() {
    const e = tienda.estado();
    for (const t of tripulantes) {
      const j = e.jugadores[t.id];
      // Uno metido en un conducto tampoco se ve: si no, cada tic lo volvía a
      // mostrar un cuadro, hasta que el dibujo lo escondía de nuevo.
      const enConducto = e.bots && e.bots[t.id] && e.bots[t.id].oculto > 0;
      t.el.setAttribute("visible", (j && !j.vivo) || enConducto ? "false" : "true");
    }
    for (const c of cuerpos) {
      const cuerpo = e.cuerpos[c.quien];
      const ver = !!(cuerpo && !cuerpo.reportado);
      // Donde cayó. Si el reductor no sabe dónde (una muerte sin tripulación
      // que camine), queda en el lugar del documento.
      if (ver && cuerpo.x != null && (c.pos.x !== cuerpo.x || c.pos.z !== cuerpo.z)) {
        c.pos = { x: cuerpo.x, z: cuerpo.z };
        c.el.position = { x: cuerpo.x, y: 0.3, z: cuerpo.z };
      }
      c.el.setAttribute("visible", ver ? "true" : "false");
    }
  }

  for (const c of cuerpos) {
    c.el.addEventListener("toque", () => {
      const e = tienda.estado();
      const cuerpo = e.cuerpos[c.quien];
      if (!cuerpo || cuerpo.reportado) return;
      if (!yo().vivo) return negar("los fantasmas no reportan");
      const p = jugador();
      if (p && distancia(p, c.pos) > CERCA) return negar("acercate al cuerpo");
      cerrarJuego();
      sonar("expulsion");
      tienda.despachar("REPORTE", { por: "local", quien: c.quien });
    });
  }

  // ── Matar ─────────────────────────────────────────────────────────────────
  // Siendo el impostor, tocar a un tripulante de cerca lo mata. Lo que decide
  // si se puede —el cuchillo cargado, que esté vivo— lo decide el reductor
  // (MATAR); acá sólo la distancia, que es lo que sabe la pantalla. Siendo
  // tripulante, tocar a otro no hace nada.
  for (const t of tripulantes) {
    t.el.addEventListener("toque", () => {
      const e = tienda.estado();
      if (!soyImpostor() || e.fase !== "jugando" || e.fin) return;
      if (!yo().vivo) return;
      if (e.recarga > 0) return negar("podés matar en " + Math.ceil(e.recarga) + " s");
      const p = jugador(), b = e.bots[t.id];
      if (!p || !b) return;
      if (distancia(p, b) > CERCA_MATAR) return negar("más cerca");
      cerrarJuego();
      sonar("expulsion");
      tienda.despachar("MATAR", { por: e.yo, quien: t.id, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 });
    });
  }

  // ── Cuadro ────────────────────────────────────────────────────────────────
  let salaActual = null;
  let antes = null;
  let reloj = 0;        // lo que falta para el próximo tic
  let insiste = 0;      // cada cuánto vuelve a sonar la alarma del crítico
  let reinicioEn = 0;   // cuándo empieza la partida que sigue

  /** El tic de la partida. No va por cuadro: el reductor tiene que poder
   *  llegar por la red, y sesenta acciones por segundo no llegan a ningún
   *  lado. Cuatro por segundo alcanzan para una cuenta regresiva que se lee. */
  const TIC = 0.25;

  function cuadro(t) {
    const dt = antes == null ? 0 : Math.min(0.05, (t - antes) / 1000);
    antes = t;
    pose = leerPose() || pose;

    reloj += dt;
    if (reloj >= TIC) { tienda.despachar("TIC", { dt: reloj }); reloj = 0; }

    // La alarma de un crítico insiste cada cinco segundos: sonar una sola vez
    // al principio no alcanza para que alguien que estaba en otra sala entienda
    // que hay que correr.
    const sabAhora = tienda.estado().sabotaje;
    if (sabAhora && EST.SABOTAJES[sabAhora.tipo].critico) {
      insiste -= dt;
      if (insiste <= 0) { sonar("alarma"); insiste = 5; }
    } else insiste = 0;

    // Terminó la partida: se muestra un rato y arranca otra. Con red esto lo
    // va a decidir la sala, no el cliente.
    const fin = tienda.estado().fin;
    if (fin && !reinicioEn) reinicioEn = performance.now() + 8000;
    if (reinicioEn && performance.now() > reinicioEn) { reinicioEn = 0; nuevaPartida(); }

    const p = jugador();
    if (p && hud) {
      // El panel, a metro y medio adelante y mirando al jugador. Si no hay
      // orientación (sólo read_camera_pose), se queda donde está y sólo
      // acompaña la posición.
      const yaw = Number.isFinite(pose.yaw) ? pose.yaw : null;
      if (yaw != null) {
        // Adelante y a la derecha, como un reloj: en el medio de la vista
        // tapaba justo lo que uno mira.
        const fx = Math.sin(yaw), fz = -Math.cos(yaw);
        const dx = Math.cos(yaw), dz = Math.sin(yaw);
        hud.position = {
          x: pose.px + fx * 1.25 + dx * 0.33,
          y: 1.28,
          z: pose.pz + fz * 1.25 + dz * 0.33,
        };
        // El frente de un nodo es su +Z, y mirar a un punto es atan2(dx, dz):
        // desde el panel, el jugador está justo detrás, así que el ángulo es el
        // mismo yaw. Con yaw+π el panel daba la espalda y se veía una caja
        // negra y vacía.
        hud.rotation = { x: 0, y: yaw, z: 0 };
        // El panel de la reunión, un poco más lejos y en el medio: es lo único
        // que importa mientras dura.
        if (grupoReunion) {
          grupoReunion.position = { x: pose.px + fx * 1.4, y: 1.4, z: pose.pz + fz * 1.4 };
          grupoReunion.rotation = { x: 0, y: yaw, z: 0 };
        }
        // El velo acompaña, más lejos que el panel: lo que está más cerca que
        // él se sigue viendo, que es el radio de visión del apagón.
        if (velo && apagon) {
          velo.position = { x: pose.px + fx * VELO_LEJOS, y: 1.6, z: pose.pz + fz * VELO_LEJOS };
          velo.rotation = { x: 0, y: yaw, z: 0 };
        }
      } else {
        hud.position = { x: pose.px, y: 1.45, z: pose.pz - 1.5 };
      }

      const sala = salaDe(p);
      if (sala !== salaActual) {
        salaActual = sala;
        tienda.despachar("SALA_CAMBIADA", { jugador: "local", sala });
      }

      // El punto del mapa de administración. Se mueve cuando hay algo que
      // mover: acomodar la interfaz en cada cuadro por dos centímetros es
      // trabajo tirado.
      if (mesaMapa) {
        const x = mesaMapa.aX(p.x) - 0.015, y = mesaMapa.aZ(p.z) - 0.015;
        const u = mesaMapa.ultimo;
        if (!u || Math.abs(u.x - x) > 0.002 || Math.abs(u.y - y) > 0.002) {
          const yo = mesaMapa.app.buscar("yo");
          if (yo) {
            yo.attr["Canvas.Left"] = String(x);
            yo.attr["Canvas.Top"] = String(y);
            mesaMapa.app.invalidateArrange();
          }
          mesaMapa.ultimo = { x, y };
        }
      }
    }

    if (p) mandarPosicion(p, dt);
    dibujarTripulacion(dt, reloj / TIC);

    correrReunion(dt);

    if (abierto && abierto.ctl) {
      try { abierto.ctl.cuadro(dt); } catch (err) { console.error("[nave] juego:", err && err.message || err); cerrarJuego("el panel falló"); }
    }
    // Alejarse de la consola cierra el juego: en el juego real, moverse
    // cancela la tarea.
    if (abierto && p && !abierto.sinDistancia) {
      const g = abierto.grupo;
      if (g && distancia(p, { x: g.position.x, z: g.position.z }) > CERCA + 1.5) cerrarJuego("te alejaste");
    }
    if (avisoHasta && performance.now() > avisoHasta && tienda.estado().aviso) {
      avisoHasta = 0;
      if (tienda.estado().fase !== "reunion") tienda.despachar("AVISO", { texto: "" });
    }
    requestAnimationFrame(cuadro);
  }

  // ── Los que caminan ───────────────────────────────────────────────────────
  // El reductor los mueve a saltos de un cuarto de segundo; acá se los dibuja
  // entre tic y tic, con el bamboleo de un tripulante que camina: se inclina
  // de un lado al otro y rebota un poco a cada paso. Nada de esto vuelve al
  // estado: es cómo se ve, no dónde están.
  let posEnviada = null, posHace = 0;
  /** Dónde está el jugador, para el reductor: los que caminan lo ven y el
   *  impostor se cuida de él. Dos veces por segundo, y sólo si se movió. */
  function mandarPosicion(p, dt) {
    posHace += dt;
    if (posHace < 0.5) return;
    if (posEnviada && Math.hypot(p.x - posEnviada.x, p.z - posEnviada.z) < 0.25 && posHace < 3) return;
    posHace = 0;
    posEnviada = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
    tienda.despachar("POSICION", { jugador: "local", x: posEnviada.x, z: posEnviada.z });
  }

  /** Cada tic trae a dónde fue cada uno: lo que estaba en `hasta` pasa a
   *  `desde`, y el cuadro interpola entre los dos. */
  function nuevoTic(e) {
    const p = jugador();
    for (const t of tripulantes) {
      const b = e.bots && e.bots[t.id];
      if (!b) continue;
      const nuevo = { x: b.x, z: b.z, yaw: b.yaw };
      const antes = t.hasta || nuevo;
      // Un salto de más de dos metros no se camina: es un conducto o la mesa
      // de la reunión, y se aparece ahí.
      t.desde = Math.hypot(nuevo.x - antes.x, nuevo.z - antes.z) > 2 ? nuevo : antes;
      t.hasta = nuevo;
      const oculto = b.oculto > 0;
      // Meterse en un conducto hace ruido: si pasa cerca, se oye.
      if (oculto && !t.oculto && p && Math.hypot(p.x - b.x, p.z - b.z) < 10) sonar("conducto");
      t.oculto = oculto;
    }
  }
  tienda.suscribir((e, accion) => { if (accion.tipo === "TIC" || accion.tipo === "PARTIDA_NUEVA" || accion.tipo === "REUNION_LLAMADA") nuevoTic(e); });

  const suave = (a, b, k) => a + (((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, k);

  // ── Las patas ─────────────────────────────────────────────────────────────
  // El tripulante tiene esqueleto (blender/assets.py): el cuerpo y una pata de
  // cada lado, colgadas de la cadera. El motor no reproduce nada —el modelo va
  // con pose-source="script"— y acá se escribe el giro de cada pata con
  // setJointBatch, un lote por tripulante y por cuadro.
  //
  // El catálogo del rig (`animation-joints`) aparece recién cuando el motor
  // dice `pose-status="script"`; hasta entonces no se escribe nada y el
  // tripulante camina con las patas quietas, que es lo mismo que antes.
  const patas = new Map();   // id -> { binding, buf, nodo } | { roto: true }
  function engancharPatas(t) {
    const hecho = patas.get(t.id);
    if (hecho) return hecho;
    if (t.el.getAttribute("pose-status") !== "script") return null;
    let cat = null;
    try { cat = JSON.parse(t.el.getAttribute("animation-joints") || "null"); } catch (err) { return null; }
    if (!cat || !cat.binding || !cat.nodes) return null;
    const indice = {};
    for (const n of cat.nodes) indice[n.name] = n.index;
    if (indice.pierna_i === undefined || indice.pierna_d === undefined) {
      console.error("[nave] al tripulante " + t.id + " le faltan las patas en el rig");
      patas.set(t.id, { roto: true });
      return patas.get(t.id);
    }
    // El índice de cada pata se escribe una vez; por cuadro, sólo el giro.
    const buf = new Float32Array(10);
    buf[0] = indice.pierna_i;
    buf[5] = indice.pierna_d;
    buf[4] = buf[9] = 1;
    const r = { binding: cat.binding, buf, nodo: typeof t.el.nodeId === "number" ? t.el.nodeId : -1, angulo: 0 };
    if (r.nodo < 0 && typeof t.el._onResolved === "function") t.el._onResolved((id) => { r.nodo = id; });
    patas.set(t.id, r);
    return r;
  }

  /** Las dos patas, `a` radianes hacia adelante y hacia atrás. Quieto no se
   *  escribe nada: la última pose en reposo ya quedó puesta. */
  function moverPatas(t, a) {
    const r = engancharPatas(t);
    if (!r || r.roto || r.nodo < 0) return;
    if (Math.abs(a) < 1e-3 && Math.abs(r.angulo) < 1e-3) return;
    r.angulo = a;
    r.buf[1] = Math.sin(a / 2); r.buf[4] = Math.cos(a / 2);
    r.buf[6] = Math.sin(-a / 2); r.buf[9] = Math.cos(-a / 2);
    try { raiz.setJointBatch(r.nodo, r.buf, { binding: r.binding }); }
    catch (err) { console.error("[nave] patas:", err && err.message || err); patas.set(t.id, { roto: true }); }
  }

  function dibujarTripulacion(dt, f) {
    const e = tienda.estado();
    const k = Math.max(0, Math.min(1, f));
    for (const t of tripulantes) {
      const j = e.jugadores[t.id];
      if (!t.hasta || !j) continue;
      if (!j.vivo || t.oculto) {
        if (t.el.getAttribute("visible") !== "false") t.el.setAttribute("visible", "false");
        continue;
      }
      if (t.el.getAttribute("visible") !== "true") t.el.setAttribute("visible", "true");
      const x = t.desde.x + (t.hasta.x - t.desde.x) * k;
      const z = t.desde.z + (t.hasta.z - t.desde.z) * k;
      const anda = Math.hypot(t.hasta.x - t.desde.x, t.hasta.z - t.desde.z) / TIC;
      t.yaw = suave(t.yaw, t.hasta.yaw, dt * 9);
      let y = 0, rz = 0, pata = 0;
      if (anda > 0.3 && e.fase === "jugando") {
        // Un paso cada 0,55 m: el bamboleo va con lo que avanza, no con el reloj.
        t.paso += anda * dt / 0.55 * Math.PI;
        y = Math.abs(Math.sin(t.paso)) * 0.05;
        rz = Math.sin(t.paso) * 0.08;
        pata = Math.sin(t.paso) * 0.6;
      } else {
        y = Math.sin(t.fase + performance.now() / 700) * 0.012 + 0.012;
      }
      // Al frenar, las patas vuelven juntas en un par de cuadros y no de golpe.
      t.pata = (t.pata || 0) + (pata - (t.pata || 0)) * Math.min(1, dt * 14);
      moverPatas(t, t.pata);
      t.el.position = { x, y, z };
      // El .glb mira a su -Z (ver pagina.ts): media vuelta respecto de hacia
      // dónde camina.
      t.el.rotation = { x: 0, y: t.yaw + Math.PI, z: rz };
    }
  }

  // ── La mesa del mapa de administración ────────────────────────────────────
  // Otra aplicación de interfaz, ésta sin juego: dibuja la planta de la nave y
  // un punto por cada uno. El plano no sale de ninguna tabla nueva; sale de los
  // pisos que ya están en el documento, así que mover una sala mueve el dibujo.
  // Es la misma idea que las consolas: el documento es la fuente.
  function armarMesaMapa() {
    if (!byId("grupo_mapa")) return null;
    const rects = [];
    for (const s of salas) {
      const piso = byId("piso_" + s.id);
      rects.push({ ...s, color: piso.getAttribute("claro") || "#2B2A33", franja: piso.getAttribute("franja") });
    }
    for (let i = 0; ; i++) {
      const piso = byId("piso_pasillo_" + i);
      if (!piso) break;
      const e = piso.scale, pos = piso.position;
      rects.push({ id: "pasillo", x0: pos.x - e.x / 2, x1: pos.x + e.x / 2, z0: pos.z - e.y / 2, z1: pos.z + e.y / 2,
                   color: piso.getAttribute("claro") || "#20242C" });
    }
    if (!rects.length) return null;

    const b = rects.reduce((a, r) => ({
      x0: Math.min(a.x0, r.x0), x1: Math.max(a.x1, r.x1), z0: Math.min(a.z0, r.z0), z1: Math.max(a.z1, r.z1),
    }), { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity });
    const ANCHO = 1.24, MARGEN = 0.03;
    const k = (ANCHO - MARGEN * 2) / (b.x1 - b.x0);
    const alto = (b.z1 - b.z0) * k + MARGEN * 2 + 0.1;
    const aX = (x) => MARGEN + (x - b.x0) * k;
    const aZ = (z) => MARGEN + 0.1 + (z - b.z0) * k;

    // Cada sala, con un reborde de su color: los pisos son todos oscuros y sin
    // eso el plano es una mancha. El color lo trae el piso escrito encima, así
    // que sigue saliendo del documento y no de una paleta repetida acá.
    const caja = (x0, z0, x1, z1, color, r) =>
      `<Border Canvas.Left="${aX(x0).toFixed(3)}" Canvas.Top="${aZ(z0).toFixed(3)}" ` +
      `Width="${((x1 - x0) * k).toFixed(3)}" Height="${((z1 - z0) * k).toFixed(3)}" ` +
      `Background="${color}" CornerRadius="${r}"/>`;
    // El reborde va como cuatro barras alrededor y no como un rectángulo más
    // grande por detrás: dos rectángulos en el mismo plano pelean por el mismo
    // pixel y cada sala salía partida en diagonal —las dos mitades del triángulo
    // de su cuadrado ganando cada una por su lado—.
    const grueso = 0.004 / k;
    const marco = (r) => [
      caja(r.x0 - grueso, r.z0 - grueso, r.x1 + grueso, r.z0, r.franja, "0"),
      caja(r.x0 - grueso, r.z1, r.x1 + grueso, r.z1 + grueso, r.franja, "0"),
      caja(r.x0 - grueso, r.z0, r.x0, r.z1, r.franja, "0"),
      caja(r.x1, r.z0, r.x1 + grueso, r.z1, r.franja, "0"),
    ].join("");
    const piezas = rects.map((r) =>
      caja(r.x0, r.z0, r.x1, r.z1, r.color, "0.006") + (r.franja ? marco(r) : "")).join("");
    // Un punto por tripulante y uno por mí: el mío arriba de todo.
    const puntos = tripulantes.map((t, i) =>
      `<Ellipse Name="pt${i}" Canvas.Left="0" Canvas.Top="0" Width="0.022" Height="0.022" Fill="#8E9CB4"/>`).join("");

    const app = new UI.Aplicacion({
      malla: "ui_malla_mapa", nodos: "ui_nodos_mapa",
      ancho: ANCHO, alto: alto, x: 0, y: 0, z: 0,
      datos: { sala: "ADMINISTRACION" },
    });
    app.cargar(`<Border Background="#070C12" CornerRadius="0.02" Padding="0.01">
      <Canvas>
        <TextBlock Canvas.Left="0.02" Canvas.Top="0.012" Text="{Binding sala}" FontSize="0.05" Foreground="#9B59B6"/>
        ${piezas}${puntos}
        <Ellipse Name="yo" Canvas.Left="0" Canvas.Top="0" Width="0.03" Height="0.03" Fill="#E74C3C"/>
      </Canvas>
    </Border>`);
    app.correr();

    // Los puntos de la tripulación: se mueven con ellos (ver moverMapa).
    const mesa = { app, aX, aZ, ultimo: null, puntos: {} };
    tripulantes.forEach((t, i) => {
      const e = app.buscar("pt" + i);
      if (!e) return;
      e.attr["Canvas.Left"] = String(aX(t.base.x) - 0.011);
      e.attr["Canvas.Top"] = String(aZ(t.base.z) - 0.011);
    });
    app.invalidateArrange();
    return mesa;
  }

  /** Los puntos del mapa de administración, donde está cada uno. Como en el
   *  juego real, la mesa de administración es lo único que dice dónde anda
   *  todo el mundo: de ahí su gracia. Un muerto o alguien adentro de un
   *  conducto no aparece. Una vez por tic alcanza. */
  function moverMapa(e) {
    if (!mesaMapa) return;
    let cambio = false;
    tripulantes.forEach((t, i) => {
      const el = mesaMapa.app.buscar("pt" + i);
      const b = e.bots && e.bots[t.id];
      if (!el || !b) return;
      const ver = e.jugadores[t.id] && e.jugadores[t.id].vivo && !(b.oculto > 0);
      const x = ver ? mesaMapa.aX(b.x) - 0.011 : -10, y = ver ? mesaMapa.aZ(b.z) - 0.011 : -10;
      const antes = mesaMapa.puntos[t.id];
      if (antes && Math.abs(antes.x - x) < 0.002 && Math.abs(antes.y - y) < 0.002) return;
      mesaMapa.puntos[t.id] = { x, y };
      el.attr["Canvas.Left"] = String(x);
      el.attr["Canvas.Top"] = String(y);
      cambio = true;
    });
    if (cambio) mesaMapa.app.invalidateArrange();
  }

  // ── En qué sala está un punto ─────────────────────────────────────────────
  // Las salas se deducen de los pisos del documento: `piso_<id>` con su
  // posición y su escala. Otra vez, el documento es la fuente.
  const salas = [];
  for (const c of consolas) {
    if (salas.some((s) => s.id === c.sala)) continue;
    const piso = byId("piso_" + c.sala);
    if (!piso) continue;
    const s = piso.scale, pos = piso.position;
    salas.push({ id: c.sala, x0: pos.x - s.x / 2, x1: pos.x + s.x / 2, z0: pos.z - s.y / 2, z1: pos.z + s.y / 2 });
  }
  function salaDe(p) {
    const s = salas.find((s) => p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1);
    return s ? s.id : null;
  }

  if (pedida && porId.has(pedida)) {
    // Se espera un cuadro: los contenedores de la interfaz tienen que existir.
    requestAnimationFrame(() => abrirJuego(porId.get(pedida), true));
  }

  // Ayuda de desarrollo: `?sabotaje=luces|reactor|o2|comunicaciones` lo dispara
  // al entrar, y `?sabotaje=luces&panel` abre además su panel de arreglo. Sin
  // esto, revisar un apagón es esperar setenta y cinco segundos y tener suerte
  // con el sorteo.
  const roto = (location.search.match(/[?&]sabotaje=(\w+)/) || [])[1];
  if (roto && EST.SABOTAJES[roto]) {
    tienda.despachar("SABOTAJE", { tipo: roto });
    if (/[?&]panel\b/.test(location.search)) {
      const pnl = paneles.find((p) => p.arregla === roto);
      if (pnl) requestAnimationFrame(() => abrirSabotaje(pnl, true));
    }
  }

  // `?matar` deja un cuerpo tirado al entrar, para poder mirarlo y reportarlo
  // sin esperar los cincuenta segundos del impostor.
  if (/[?&]matar\b/.test(location.search)) {
    const e = tienda.estado();
    const presa = Object.keys(e.jugadores).find(
      (id) => id !== "local" && e.jugadores[id].rol !== "impostor" && e.jugadores[id].vivo);
    if (presa) tienda.despachar("MUERTE", { quien: presa });
  }

  // Y `?reunion` la abre al entrar, que es la única forma de mirarla desde
  // afuera del visor: el botón rojo hay que tocarlo.
  if (/[?&]reunion\b/.test(location.search)) tienda.despachar("REUNION_LLAMADA", { por: "vos" });

  const mesaMapa = armarMesaMapa();
  tienda.suscribir((e, accion) => { if (accion.tipo === "TIC") moverMapa(e); });
  nuevoTic(tienda.estado());

  requestAnimationFrame(cuadro);
  console.log("[nave] " + consolas.length + " consolas, " + conductos.length + " conductos, " +
              paneles.length + " paneles de emergencia, " +
              Object.keys(tienda.estado().tareas).length + " tareas repartidas");

  // Sólo para las pruebas: lo que está montado ahora y la tienda entera, sin
  // que el juego mismo lo use ni lo necesite. Reemplaza al `s.app()` que daba
  // el framework de interfaz viejo — el kit no crea ninguna `UI.Aplicacion`.
  globalThis.__nave_depurar = () => ({ abierto, tienda });
}
