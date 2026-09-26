// Ajustar arma: las zonas y los puntos de cada arma, a la vista y editables.
//
// Las armas se arman con números (armas.js, cargadores.js): dónde se toma cada
// pieza y a qué distancia, dónde empieza un riel y cuánto recorre, la boca del
// pozo, de dónde sale el tiro. Acá cada uno es una **referencia**: tiene su
// valor de fábrica, su valor actual (guardado en localStorage por arma), una
// figura transparente que la muestra, y se ajusta en vivo.
//
// La que más hace falta es la **empuñadura**: dónde queda el arma respecto del
// mando al tomarla. Cada modelo de mando tiene el gatillo en otro lado, y con
// la de fábrica puede quedar unos centímetros corrida.
//
// Se entra desde el botón de la tapa de su caja (cajas.js). En modo ajuste esa
// arma no tira ni se le mueven las piezas: el gatillo queda libre para tocar el
// panel (panel_ajustes.js), aunque se la tenga en esa mano. La referencia
// elegida, si tiene un punto, además se puede arrastrar con la mano libre.
//
// Sin interfaz también se usa: está en globalThis.TIRO_AJUSTES.
//
//   TIRO_AJUSTES.activar("pistola");
//   TIRO_AJUSTES.elegir("empunadura");
//   TIRO_AJUSTES.mover("y", -4);          // mm
//   TIRO_AJUSTES.girar("x", 5);           // grados
//   TIRO_AJUSTES.cambiar("radio", 5);     // mm (o grados, en tolerancia)
//   TIRO_AJUSTES.alternarForma();         // esfera ↔ cilindro
//   TIRO_AJUSTES.cambiarDir("altura", 5); // de dónde llega la mano, en grados
(globalThis.__modulos ||= []).push(["tiro/ajustes", [
  "comun/algebra", "comun/interaccion", "tiro/config", "tiro/escena", "tiro/sonidos", "tiro/juego",
  "tiro/armas", "tiro/cargadores", "tiro/cajas",
], (A, I, C, E, S, J, W, K, X) => {
  const { v3, suma, resta, por, rotar, qMul, qConj, qEnX, qDeEuler, qMirando, qEjeY, eulerDeQ } = A;
  const { crear } = E;
  const G = Math.PI / 180;
  const copia = (x) => JSON.parse(JSON.stringify(x));
  const CLAVE = (id) => "tiro:ajustes:" + id;

  /** Qué se puede cambiar de cada campo, y cómo se lee en el panel. */
  const CAMPOS = {
    radio: { nombre: "radio", unidad: "mm", escala: 1000, min: 0.005 },
    largo: { nombre: "recorrido", unidad: "mm", escala: 1000, min: 0.005 },
    holgura: { nombre: "holgura", unidad: "mm", escala: 1000, min: 0.002 },
    tolerancia: { nombre: "tolerancia", unidad: "°", escala: 1, min: 1 },
    largoZona: { nombre: "largo zona", unidad: "mm", escala: 1000, min: 0.005 },
  };
  /** La dirección de llegada de una zona: grados, con sus topes. */
  const DIR = {
    rumbo: { nombre: "dir. rumbo", min: -180, max: 180, vuelta: true },
    altura: { nombre: "dir. altura", min: -90, max: 90 },
    cono: { nombre: "dir. cono", min: 5, max: 180 },
  };

  // ── Zonas (comun/interaccion.js, enZona) ──────────────────────────────────
  /** Lo editable de una zona de agarre, sacado de las opciones de su pieza. */
  const zonaDe = (o) => ({
    radio: o.radio, forma: o.forma || "esfera", largoZona: o.largoZona || 0.08,
    dir: o.dir ? { rumbo: o.dir.rumbo, altura: o.dir.altura, cono: o.dir.cono } : { rumbo: 0, altura: 0, cono: 180 },
  });
  /** Y de vuelta: con cono de 180° la dirección no cuenta, y no se guarda. */
  function escribirZona(o, v) {
    o.radio = v.radio;
    o.forma = v.forma;
    o.largoZona = v.largoZona;
    o.dir = v.dir.cono >= 180 ? null : { rumbo: v.dir.rumbo, altura: v.dir.altura, cono: v.dir.cono };
  }

  // ── Las figuras ───────────────────────────────────────────────────────────
  /** El color de una figura: más transparente si no es la elegida. */
  const tono = (color, sel, fuerte) => color + (fuerte ? (sel ? "E6" : "99") : (sel ? "70" : "30"));
  // El alfa del color sólo se ve con material-alpha="blend" (guides/documento.md):
  // sin eso, el nodo va por un material opaco.
  const figura = (padre, tag, attrs) => crear(tag, {
    class: "ajuste", touchable: "false", "material-alpha": "blend", "material-unlit": "true", ...attrs,
  }, padre);
  function esfera(padre, p, radio, color) {
    return figura(padre, "sphere", { x: p.x, y: p.y, z: p.z, sx: radio * 2, sy: radio * 2, sz: radio * 2, color });
  }
  /** Una barra de `a` a `b`, fina. */
  function barra(padre, a, b, grueso, color) {
    const d = resta(b, a), l = Math.hypot(d.x, d.y, d.z) || 1e-4;
    const r = eulerDeQ(qMirando(d));
    const c = suma(a, por(d, 0.5));
    return figura(padre, "box", { x: c.x, y: c.y, z: c.z, rx: r.x, ry: r.y, rz: r.z, sx: grueso, sy: grueso, sz: l, color });
  }

  /** Una zona de agarre: su forma (esfera o cilindro sobre `ejeDef`) y, si
   *  tiene dirección, una flecha que llega desde donde tiene que venir la mano. */
  function figuraZona(padre, centro, v, ejeDef, color, sel) {
    if (v.forma === "cilindro") {
      const r = eulerDeQ(qEjeY(ejeDef));
      figura(padre, "cylinder", { x: centro.x, y: centro.y, z: centro.z, rx: r.x, ry: r.y, rz: r.z, sx: v.radio * 2, sy: v.largoZona, sz: v.radio * 2, color: tono(color, sel) });
    } else esfera(padre, centro, v.radio, tono(color, sel));
    esfera(padre, centro, 0.005, tono(color, sel, true));
    if (v.dir && v.dir.cono < 180) {
      const d = I.direccionDe(v.dir), desde = suma(centro, por(d, -(v.radio + 0.08)));
      barra(padre, desde, suma(centro, por(d, -v.radio * 0.6)), 0.004, tono("#FFFFFF", sel, true));
      esfera(padre, desde, 0.008, tono("#FFFFFF", sel, true));
    }
  }

  // ── Las referencias de cada arma ──────────────────────────────────────────
  function referencias(a) {
    const t = a.tipo, id = a.id;
    const gun = () => a.vista;
    const lista = [];

    lista.push({
      id: "empunadura", nombre: "Empuñadura", color: "#FFD60A",
      ayuda: "Dónde queda el arma respecto del mando. Movela hasta que el gatillo quede bajo el índice y el cañón siga la muñeca.",
      valor: { p: a.empunadura.p, r: a.empunadura.r },
      aplicar(v) { a.empunadura = { p: v.p, r: v.r }; W.reponer(a); },
      marco: gun,
      /** El mando visto desde el arma: la empuñadura al revés. */
      punto(v) { const q = qDeEuler(v.r.x * G, v.r.y * G, v.r.z * G); return por(rotar(qConj(q), v.p), -1); },
      moverA(v, m) { const q = qDeEuler(v.r.x * G, v.r.y * G, v.r.z * G); v.p = por(rotar(q, m), -1); },
      // Con el arma en la mano, el marcador está siempre en la mano: arrastrarlo no tiene sentido.
      arrastrable: () => !a.mano,
      figuras(v, sel) {
        const q = qDeEuler(v.r.x * G, v.r.y * G, v.r.z * G), qi = qConj(q);
        const g = crear("group", { class: "ajuste" }, a.el);
        const m = this.punto(v), r = eulerDeQ(qi);
        const mando = crear("group", { class: "ajuste", x: m.x, y: m.y, z: m.z, rx: r.x, ry: r.y, rz: r.z }, g);
        esfera(mando, v3(0, 0, 0), 0.025, tono(this.color, sel));
        esfera(mando, v3(0, 0, 0), 0.006, tono(this.color, sel, true));
        barra(mando, v3(0, 0, 0), v3(0, 0, -0.12), 0.003, tono("#FF453A", sel, true));   // el rayo
        barra(mando, v3(0, 0, 0), v3(0, 0.05, 0), 0.003, tono("#30D158", sel, true));    // arriba
        barra(mando, v3(0, 0, 0), v3(0.04, 0, 0), 0.003, tono("#0A84FF", sel, true));    // derecha
        return g;
      },
    });

    lista.push({
      id: "boca", nombre: "Boca", color: "#FF453A",
      ayuda: "De dónde sale el tiro. La línea es hacia dónde va.",
      valor: { p: t.boca },
      aplicar(v) { t.boca = v.p; },
      marco: gun, punto: (v) => v.p, moverA(v, m) { v.p = m; }, arrastrable: () => true,
      figuras(v, sel) {
        const g = crear("group", { class: "ajuste" }, a.el);
        esfera(g, v.p, 0.008, tono(this.color, sel, true));
        barra(g, v.p, suma(v.p, v3(0, 0, -0.25)), 0.002, tono(this.color, sel, true));
        return g;
      },
    });

    lista.push({
      id: "toma", nombre: "Toma en la mesa", color: "#AEAEB2",
      ayuda: "Desde dónde se toma el arma apoyada, y a qué distancia llega la mano.",
      valor: { p: t.centro, ...zonaDe(a.zonaToma) },
      aplicar(v) { t.centro = v.p; escribirZona(a.zonaToma, v); },
      marco: gun, punto: (v) => v.p, moverA(v, m) { v.p = m; }, arrastrable: () => true,
      figuras(v, sel) {
        const g = crear("group", { class: "ajuste" }, a.el);
        figuraZona(g, v.p, v, v3(0, 0, 1), this.color, sel);
        return g;
      },
    });

    const corredera = a.corredera.o;
    const nombreCorredera = { pistola: "Corredera", mp5: "Manija de carga", mac10: "Perilla del cerrojo" }[id]
      || t.nombreCorredera[0].toUpperCase() + t.nombreCorredera.slice(1);
    lista.push({
      id: "corredera", nombre: nombreCorredera, color: "#0A84FF",
      ayuda: "Dónde se toma y cuánto recorre hasta el tope. La barra es el recorrido.",
      valor: { p: corredera.agarre, largo: corredera.largo, ...zonaDe(corredera) },
      aplicar(v) {
        corredera.agarre = v.p;
        escribirZona(corredera, v);
        corredera.largo = v.largo;
        a.corredera.poner(Math.min(a.corredera.s, v.largo));
        if (a.corredera.trabado) a.corredera.poner(v.largo);
      },
      /** El agarre vive en la pieza que se mueve: el marco es el arma corrida lo recorrido. */
      marco: () => ({ p: suma(a.vista.p, rotar(a.vista.q, suma(corredera.desde, por(corredera.eje, a.corredera.s)))), q: a.vista.q }),
      punto: (v) => v.p, moverA(v, m) { v.p = m; }, arrastrable: () => true,
      figuras(v, sel) {
        const g = crear("group", { class: "ajuste" }, a.el);
        const inicio = suma(corredera.desde, v.p);
        barra(g, inicio, suma(inicio, por(corredera.eje, v.largo)), 0.006, tono(this.color, sel, true));
        const enPieza = crear("group", { class: "ajuste" }, a.corredera.o.nodo);
        figuraZona(enPieza, v.p, v, corredera.eje, this.color, sel);
        return [g, enPieza];
      },
    });

    // El pozo se ajusta por lo que se ve: dónde calza la boca del cargador (el
    // tope), la inclinación y cuánto recorre. La entrada sale de ahí.
    const pozo = a.pozo.o;
    const inclinacion = Math.atan2(pozo.eje.z, pozo.eje.y) / G;
    lista.push({
      id: "pozo", nombre: "Pozo del cargador", color: "#30D158", ejesR: "x",
      ayuda: "Dónde calza el cargador (el tope), cuánto recorre y con qué inclinación entra. La holgura y la tolerancia deciden cuánto se le perdona al meterlo.",
      valor: { p: suma(pozo.entrada, por(pozo.eje, pozo.largo)), r: v3(inclinacion, 0, 0), largo: pozo.largo, holgura: pozo.holgura, tolerancia: pozo.tolerancia },
      aplicar(v) {
        const ang = v.r.x * G;
        pozo.eje = v3(0, Math.cos(ang), Math.sin(ang));
        pozo.q = qEnX(ang);
        pozo.largo = v.largo;
        pozo.entrada = resta(v.p, por(pozo.eje, v.largo));
        pozo.holgura = v.holgura;
        pozo.tolerancia = v.tolerancia;
        const u = a.pozo.ocupante;
        if (u && u.estado === "puesto") u.s = v.largo;
      },
      marco: gun, punto: (v) => v.p, moverA(v, m) { v.p = m; }, arrastrable: () => true,
      figuras(v, sel) {
        const ang = v.r.x * G, eje = v3(0, Math.cos(ang), Math.sin(ang));
        const entrada = resta(v.p, por(eje, v.largo));
        const g = crear("group", { class: "ajuste" }, a.el);
        const tubo = crear("group", { class: "ajuste", x: entrada.x, y: entrada.y, z: entrada.z, rx: ang }, g);
        figura(tubo, "cylinder", { y: v.largo / 2, sx: v.holgura * 2, sy: v.largo, sz: v.holgura * 2, color: tono(this.color, sel) });
        esfera(tubo, v3(0, 0, 0), 0.008, tono(this.color, sel, true));        // la boca del pozo
        esfera(tubo, v3(0, v.largo, 0), 0.006, tono("#FFFFFF", sel, true));   // el tope
        return g;
      },
    });

    if (t.delantera) {
      lista.push({
        id: "delantera", nombre: "Guardamanos", color: "#BF5AF2",
        ayuda: "Dónde toma la otra mano para tirar con dos, y a qué distancia.",
        valor: { p: t.delantera.punto, ...zonaDe(a.agarreDelantero.o) },
        aplicar(v) { t.delantera.punto = v.p; escribirZona(a.agarreDelantero.o, v); },
        marco: gun, punto: (v) => v.p, moverA(v, m) { v.p = m; }, arrastrable: () => true,
        figuras(v, sel) {
          const g = crear("group", { class: "ajuste" }, a.el);
          figuraZona(g, v.p, v, v3(0, 0, 1), this.color, sel);
          return g;
        },
      });

      lista.push({
        id: "delanteraMano", nombre: "Mano de adelante", color: "#FF6FD8",
        ayuda: "Dónde queda el mando de adelante respecto del guardamanos al tirar con dos manos: el arma apunta para que este punto caiga en la mano. La línea sale del guardamanos.",
        valor: { p: a.manoDelantera.p },
        aplicar(v) { a.manoDelantera = { p: v.p }; W.reponer(a); },
        marco: gun,
        // Se muestra y se arrastra donde queda, en el marco del arma; se guarda
        // como un desfase del guardamanos.
        punto: (v) => suma(t.delantera.punto, v.p),
        moverA(v, m) { v.p = resta(m, t.delantera.punto); },
        arrastrable: () => true,
        figuras(v, sel) {
          const g = crear("group", { class: "ajuste" }, a.el);
          const m = suma(t.delantera.punto, v.p);
          esfera(g, m, 0.02, tono(this.color, sel));
          esfera(g, m, 0.005, tono(this.color, sel, true));
          barra(g, t.delantera.punto, m, 0.002, tono(this.color, sel, true));
          return g;
        },
      });
    }

    const modelo = K.MODELOS[id];
    lista.push({
      id: "cargador", nombre: "Agarre del cargador", color: "#FF9F0A",
      ayuda: "Por dónde se toma el cargador para sacarlo o meterlo, y a qué distancia. Vale para todos los de esta arma.",
      valor: { p: modelo.agarre, ...zonaDe(modelo) },
      aplicar(v) {
        modelo.agarre = v.p;
        escribirZona(modelo, v);
        for (const u of K.todos) if (u.tipo === id) { u.o.agarre = v.p; escribirZona(u.o, v); }
      },
      marco: () => (a.cargador ? { p: a.cargador.p, q: a.cargador.q } : a.vista),
      punto: (v) => v.p, moverA(v, m) { v.p = m; }, arrastrable: () => !!a.cargador,
      figuras(v, sel) {
        if (!a.cargador) return null;
        const g = crear("group", { class: "ajuste" }, a.cargador.el);
        figuraZona(g, v.p, v, v3(0, 1, 0), this.color, sel);
        return g;
      },
    });

    lista.push({
      id: "cargadorMano", nombre: "Cargador en la mano", color: "#64D2FF",
      ayuda: "Cómo queda el cargador en la mano al tomarlo: fijo respecto del mando, no importa cómo se lo agarró. El marcador es el mando visto desde el cargador puesto.",
      valor: { p: modelo.enMano.p, r: modelo.enMano.r },
      aplicar(v) { modelo.enMano = { p: v.p, r: v.r }; },
      marco: () => (a.cargador ? { p: a.cargador.p, q: a.cargador.q } : a.vista),
      /** La mano vista desde el cargador: la pose en la mano al revés. */
      punto(v) { const q = qDeEuler(v.r.x * G, v.r.y * G, v.r.z * G); return por(rotar(qConj(q), v.p), -1); },
      moverA(v, m) { const q = qDeEuler(v.r.x * G, v.r.y * G, v.r.z * G); v.p = por(rotar(q, m), -1); },
      arrastrable: () => !!a.cargador,
      figuras(v, sel) {
        if (!a.cargador) return null;
        const q = qDeEuler(v.r.x * G, v.r.y * G, v.r.z * G);
        const g = crear("group", { class: "ajuste" }, a.cargador.el);
        const m = this.punto(v), r = eulerDeQ(qConj(q));
        const mando = crear("group", { class: "ajuste", x: m.x, y: m.y, z: m.z, rx: r.x, ry: r.y, rz: r.z }, g);
        esfera(mando, v3(0, 0, 0), 0.025, tono(this.color, sel));
        esfera(mando, v3(0, 0, 0), 0.006, tono(this.color, sel, true));
        barra(mando, v3(0, 0, 0), v3(0, 0, -0.12), 0.003, tono("#FF453A", sel, true));   // el rayo
        barra(mando, v3(0, 0, 0), v3(0, 0.05, 0), 0.003, tono("#30D158", sel, true));    // arriba
        return g;
      },
    });

    for (const r of lista) {
      r.valor = copia(r.valor);
      r.defecto = copia(r.valor);
    }
    return lista;
  }

  /** Lo que depende de la mano y no del modelo: sobrevive a un cambio de
   *  modelo. El resto (la boca, la corredera, el pozo...) son puntos del
   *  modelo, y si el modelo cambió lo guardado ya no vale. */
  const DE_LA_MANO = new Set(["empunadura", "cargadorMano", "delanteraMano"]);

  const porArma = {};
  for (const a of W.armas) {
    porArma[a.id] = { arma: a, refs: referencias(a) };
    // Lo guardado, encima de lo de fábrica: campo por campo, y sólo números.
    let guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE(a.id)) || "null"); } catch (e) { /* sin almacén o roto */ }
    const mismoModelo = !!guardado && guardado._modelo === a.tipo.modelo;
    for (const r of porArma[a.id].refs) {
      const g = guardado && (mismoModelo || DE_LA_MANO.has(r.id)) && guardado[r.id];
      if (g && typeof g === "object") {
        for (const k in r.valor) {
          if (typeof r.valor[k] === "number" && Number.isFinite(g[k])) r.valor[k] = g[k];
          else if (k === "forma" && (g[k] === "esfera" || g[k] === "cilindro")) r.valor[k] = g[k];
          else if (k === "dir" && g[k] && ["rumbo", "altura", "cono"].every((e) => Number.isFinite(g[k][e]))) r.valor[k] = { rumbo: g[k].rumbo, altura: g[k].altura, cono: g[k].cono };
          else if (r.valor[k] && typeof r.valor[k] === "object" && g[k] && ["x", "y", "z"].every((e) => Number.isFinite(g[k][e]))) r.valor[k] = v3(g[k].x, g[k].y, g[k].z);
        }
      }
      r.aplicar(r.valor);
    }
  }

  function guardar(armaId) {
    const datos = { _modelo: porArma[armaId].arma.tipo.modelo };
    for (const r of porArma[armaId].refs) datos[r.id] = r.valor;
    try { localStorage.setItem(CLAVE(armaId), JSON.stringify(datos)); } catch (e) { /* sin almacén */ }
  }

  // ── Estado del modo ajuste ────────────────────────────────────────────────
  const estado = { activa: null, elegida: null };
  const escuchas = [];
  const avisar = () => { for (const f of escuchas) f(estado); };
  let figuras = [];
  let sucio = false;
  let cargadorVisto = null;

  function borrarFiguras() {
    for (const f of figuras) f.remove();
    figuras = [];
  }
  function dibujar() {
    borrarFiguras();
    if (!estado.activa) return;
    const { refs, arma } = porArma[estado.activa];
    cargadorVisto = arma.cargador;
    for (const r of refs) {
      const hechas = r.figuras(r.valor, r.id === estado.elegida);
      for (const f of [].concat(hechas || [])) figuras.push(f);
    }
  }
  const ref = () => (estado.activa && estado.elegida ? porArma[estado.activa].refs.find((r) => r.id === estado.elegida) : null);
  /** Después de cada cambio: aplicarlo al arma, guardarlo y redibujar. */
  function cambio(r) {
    r.aplicar(r.valor);
    guardar(estado.activa);
    sucio = true;
    avisar();
  }

  function activar(id) {
    if (!porArma[id]) return;
    if (estado.activa && estado.activa !== id) desactivar();
    estado.activa = id;
    estado.elegida = estado.elegida && porArma[id].refs.some((r) => r.id === estado.elegida) ? estado.elegida : "empunadura";
    porArma[id].arma.ajustando = true;
    if (X.porArma[id]) X.porArma[id].marcarAjuste(true);
    S.sonar("corredera", 0.4);
    J.ultimo("ajustando la " + porArma[id].arma.tipo.nombre + ": el gatillo toca el panel");
    dibujar();
    avisar();
  }
  function desactivar() {
    if (!estado.activa) return;
    const id = estado.activa;
    porArma[id].arma.ajustando = false;
    if (X.porArma[id]) X.porArma[id].marcarAjuste(false);
    estado.activa = null;
    borrarFiguras();
    S.sonar("corredera", 0.4);
    J.ultimo("ajustes guardados");
    avisar();
  }
  const alternar = (id) => (estado.activa === id ? desactivar() : activar(id));
  function elegir(refId) {
    if (!estado.activa || !porArma[estado.activa].refs.some((r) => r.id === refId)) return;
    estado.elegida = refId;
    sucio = true;
    avisar();
  }

  /** Correr el punto de la elegida, en mm, sobre un eje de su marco. */
  function mover(eje, mm) {
    const r = ref();
    if (!r || !r.valor.p) return;
    r.valor.p = { ...r.valor.p, [eje]: r.valor.p[eje] + mm / 1000 };
    cambio(r);
  }
  /** Girar la elegida, en grados. */
  function girar(eje, grados) {
    const r = ref();
    if (!r || !r.valor.r || !(r.ejesR || "xyz").includes(eje)) return;
    r.valor.r = { ...r.valor.r, [eje]: r.valor.r[eje] + grados };
    cambio(r);
  }
  /** Agrandar o achicar un campo: mm para las medidas, grados para la tolerancia. */
  function cambiar(campo, delta) {
    const r = ref(), c = CAMPOS[campo];
    if (!r || !c || typeof r.valor[campo] !== "number") return;
    r.valor[campo] = Math.max(c.min, r.valor[campo] + delta / c.escala);
    cambio(r);
  }
  /** La forma de la zona de la elegida: esfera ↔ cilindro. */
  function alternarForma() {
    const r = ref();
    if (!r || !r.valor.forma) return;
    r.valor.forma = r.valor.forma === "cilindro" ? "esfera" : "cilindro";
    cambio(r);
  }
  /** Usar o no la dirección de llegada (un cono de 60°, o 180°: sin dirección). */
  function alternarDireccion() {
    const r = ref();
    if (!r || !r.valor.dir) return;
    r.valor.dir = { ...r.valor.dir, cono: r.valor.dir.cono >= 180 ? 60 : 180 };
    cambio(r);
  }
  /** Cambiar rumbo, altura o cono de la dirección, en grados. */
  function cambiarDir(campo, grados) {
    const r = ref(), c = DIR[campo];
    if (!r || !r.valor.dir || !c) return;
    let x = r.valor.dir[campo] + grados;
    if (c.vuelta) x = ((x + 540) % 360) - 180;
    r.valor.dir = { ...r.valor.dir, [campo]: Math.max(c.min, Math.min(c.max, x)) };
    cambio(r);
  }
  function restablecer(refId = estado.elegida) {
    if (!estado.activa) return;
    const r = porArma[estado.activa].refs.find((x) => x.id === refId);
    if (!r) return;
    r.valor = copia(r.defecto);
    cambio(r);
  }
  function restablecerTodo() {
    if (!estado.activa) return;
    for (const r of porArma[estado.activa].refs) { r.valor = copia(r.defecto); r.aplicar(r.valor); }
    guardar(estado.activa);
    sucio = true;
    avisar();
  }

  /** Lo que muestra el panel: las referencias, y los campos de la elegida. */
  function resumen() {
    if (!estado.activa) return null;
    const { arma, refs } = porArma[estado.activa];
    const r = ref();
    const filas = [];
    if (r) {
      if (r.valor.p) for (const e of ["x", "y", "z"]) filas.push({ tipo: "p", eje: e, etiqueta: e.toUpperCase(), valor: (r.valor.p[e] * 1000).toFixed(1) + " mm", paso: 1 });
      if (r.valor.r) for (const e of (r.ejesR || "xyz")) filas.push({ tipo: "r", eje: e, etiqueta: "giro " + e.toUpperCase(), valor: r.valor.r[e].toFixed(1) + "°", paso: 1 });
      for (const k in CAMPOS) {
        if (k === "largoZona" && r.valor.forma !== "cilindro") continue;
        if (typeof r.valor[k] === "number") filas.push({ tipo: "c", campo: k, etiqueta: CAMPOS[k].nombre, valor: (r.valor[k] * CAMPOS[k].escala).toFixed(1) + " " + CAMPOS[k].unidad, paso: k === "tolerancia" ? 5 : 1 });
      }
      if (r.valor.dir) {
        const conDir = r.valor.dir.cono < 180;
        for (const k of ["rumbo", "altura", "cono"]) {
          if (k !== "cono" && !conDir) continue;
          filas.push({ tipo: "d", campo: k, etiqueta: DIR[k].nombre, valor: conDir || k !== "cono" ? r.valor.dir[k].toFixed(0) + "°" : "sin dirección", paso: 5 });
        }
      }
    }
    return {
      arma: arma.id, nombreArma: arma.tipo.nombre,
      refs: refs.map((x) => ({ id: x.id, nombre: x.nombre, color: x.color, elegida: x.id === estado.elegida })),
      elegida: r && {
        id: r.id, nombre: r.nombre, color: r.color, ayuda: r.ayuda, arrastrable: r.arrastrable(),
        zona: !!r.valor.forma, forma: r.valor.forma || null, direccion: !!(r.valor.dir && r.valor.dir.cono < 180),
      },
      filas,
    };
  }
  /** Un paso de una fila del panel: `mult` es −5, −1, +1 o +5 veces su paso. */
  function pasoDeFila(fila, mult) {
    if (fila.tipo === "p") mover(fila.eje, fila.paso * mult);
    else if (fila.tipo === "r") girar(fila.eje, fila.paso * mult);
    else if (fila.tipo === "d") cambiarDir(fila.campo, fila.paso * mult);
    else cambiar(fila.campo, fila.paso * mult);
  }

  // ── Arrastrar la elegida con la mano libre ────────────────────────────────
  const arrastre = I.arrastre({
    marco: () => ref().marco(),
    leer: () => { const r = ref(); return r.punto(r.valor); },
    escribir(m) { const r = ref(); r.moverA(r.valor, m); r.aplicar(r.valor); sucio = true; },
    radio: 0.04,
    disponible: () => { const r = ref(); return !!r && !!r.valor.p && r.arrastrable(); },
    alSoltar() { guardar(estado.activa); avisar(); },
  });

  // El botón de la tapa de cada caja entra y sale del modo.
  for (const id in X.porArma) X.porArma[id].alAjustar = () => alternar(id);

  /** Dónde va el panel: arriba de la caja del arma que se ajusta. */
  function lugarDelPanel() {
    if (!estado.activa || !X.porArma[estado.activa]) return null;
    const p = X.porArma[estado.activa].base;
    return v3(p.x, p.y + 0.58, p.z + 0.03);
  }

  const api = {
    get activa() { return estado.activa; },
    get elegida() { return estado.elegida; },
    activar, desactivar, alternar, elegir, mover, girar, cambiar, alternarForma, alternarDireccion, cambiarDir,
    restablecer, restablecerTodo,
    resumen, pasoDeFila, lugarDelPanel,
    /** El valor de una referencia de un arma (una copia). */
    valor: (armaId, refId) => copia(porArma[armaId].refs.find((r) => r.id === refId).valor),
    escuchar(f) { escuchas.push(f); },
    agarrables: () => (estado.activa ? [arrastre] : []),
    animar() {
      // Un cargador nuevo en el pozo mueve su figura: se redibuja.
      if (estado.activa && porArma[estado.activa].arma.cargador !== cargadorVisto) sucio = true;
      if (sucio) { sucio = false; dibujar(); }
    },
  };
  globalThis.TIRO_AJUSTES = api;
  return api;
}]);
