// Acciones básicas de interacción con las manos, para armar objetos que se
// desarman: seis piezas que no saben nada de armas.
//
//   riel     una pieza que se arrastra por un eje de su padre, entre el inicio
//            y un tope; con resorte vuelve sola, y se puede trabar en el tope.
//            (la corredera de una pistola, la manija de carga, un cerrojo)
//   suelto   un objeto que se toma "como está", se lleva en la mano, y al
//            soltarlo cae con la velocidad que traía hasta apoyarse.
//            (un cargador)
//   guia     un riel de inserción: capta un objeto sólo si entra por la boca y
//            con la orientación justa, y desde ahí lo obliga a recorrerlo
//            entero, sin saltos ni giros, hasta asentarlo en el tope. Sacarlo
//            es el mismo camino al revés. (el pozo de un cargador)
//   arrastre un punto que la mano lleva adonde quiera, en el marco del padre.
//            (una zona que se está ajustando)
//   bisagra  una tapa que gira sobre un eje entre cerrada y abierta, y va sola;
//            se alterna tocándola o tomándola. (la tapa de una caja)
//   agarre   una zona que se toma y le avisa a su dueño.
//            (la empuñadura delantera, para tirar con dos manos)
//
// Todas se hablan con las manos por la misma interfaz, la de un "agarrable":
//
//   distancia(pos)       a cuánto está la mano, o null si no se puede tomar
//   tomar(mano, ctx)     la mano apretó el grip sobre él
//   mover(mano, ctx)     la mano se movió; devolver "soltar" la libera (la
//                        pieza ya limpió lo suyo: no se le llama soltar)
//   soltar(mano, ctx)    la mano soltó el grip
//
// `ctx` es la mano en ese momento: { pos, q, vel } en coordenadas de mundo
// (q, el giro del mando; vel, su velocidad en m/s).
//
// Las poses son { p, q } en mundo. Un "marco" es una función que devuelve la
// pose de mundo del padre en este momento: las piezas viven en su espacio
// local y se recalculan cuando el padre se mueve.
(globalThis.__modulos ||= []).push(["comun/interaccion", ["comun/algebra"], (A) => {
  const { v3, suma, resta, por, punto, largo, unitario, acotar, rotar, qMul, qConj, qDeBase, cruz, eulerDeQ, ARRIBA } = A;

  const aMundo = (m, v) => suma(m.p, rotar(m.q, v));
  const aLocal = (m, w) => rotar(qConj(m.q), resta(w, m.p));
  /** El ángulo entre dos giros, en radianes. */
  const angulo = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(qMul(qConj(a), b).w)));
  const grados = (g) => (g * Math.PI) / 180;
  function ponerNodo(el, pose) {
    el.position = pose.p;
    el.rotation = eulerDeQ(pose.q);
  }

  // ── zonas ─────────────────────────────────────────────────────────────────
  /** Dónde se toma una pieza. Todas la leen de sus opciones, en el momento:
   *
   *    forma       "esfera" (de fábrica) o "cilindro"
   *    radio       el de la esfera, o el del cilindro alrededor de su eje
   *    largoZona   el largo del cilindro, centrado en el punto de agarre
   *    ejeZona     el eje del cilindro, en el marco de la pieza (si falta, el
   *                de la pieza: el riel por donde corre, o +Z)
   *    dir         { rumbo, altura, cono } en grados: de dónde tiene que venir
   *                la mano. `rumbo` gira alrededor de Y desde −Z, `altura`
   *                sube hacia +Y. Con cono de 180° (o sin dir) da igual.
   *
   *  La dirección sirve cuando dos zonas se pisan: en la MP5 la manija de
   *  carga y el guardamanos están casi en el mismo lugar, pero al guardamanos
   *  la mano llega de abajo hacia arriba y a la manija, de costado. `llegada`
   *  es hacia dónde venía moviéndose la mano (en mundo), o null si estaba
   *  quieta: quieta, cuenta sólo la distancia. */
  const direccionDe = (d) => {
    const r = grados(d.rumbo), a = grados(d.altura);
    return v3(Math.sin(r) * Math.cos(a), Math.sin(a), -Math.cos(r) * Math.cos(a));
  };
  function enZona(o, marco, centro, pos, llegada, ejeDefecto) {
    const r = resta(aLocal(marco, pos), centro);
    let d;
    if (o.forma === "cilindro") {
      const e = unitario(o.ejeZona || ejeDefecto || v3(0, 0, 1));
      const ax = punto(r, e);
      if (Math.abs(ax) > (o.largoZona || 0) / 2) return null;
      d = largo(resta(r, por(e, ax)));
    } else d = largo(r);
    if (d > o.radio) return null;
    if (o.dir && o.dir.cono < 180 && llegada) {
      const vista = unitario(rotar(qConj(marco.q), llegada));
      if (punto(vista, direccionDe(o.dir)) < Math.cos(grados(o.dir.cono))) return null;
    }
    return d;
  }

  // ── riel ──────────────────────────────────────────────────────────────────
  /** o = {
   *    marco()           la pose de mundo del padre
   *    nodo              el nodo que se mueve, hijo del padre
   *    desde, eje        dónde está el nodo con s = 0 y hacia dónde se tira (locales)
   *    largo             el recorrido hasta el tope
   *    agarre, radio     dónde se toma, relativo al nodo, y a qué distancia
   *                      (más forma, largoZona, ejeZona y dir: ver zonas)
   *    resorte           m/s con que vuelve solo al soltarlo (0: se queda)
   *    disponible()      si se puede tomar ahora
   *    alLlegar()        la mano lo llevó hasta el tope
   *    alVolver()        volvió al inicio después de haber llegado al tope
   *  } */
  function riel(o) {
    // `o` queda a la vista: sus números se pueden ajustar en vivo, porque cada
    // cuenta los lee de ahí en el momento.
    const r = { s: 0, mano: null, desfase: 0, trabado: false, llego: false, o };
    r.poner = (s) => {
      r.s = acotar(s, 0, o.largo);
      o.nodo.position = suma(o.desde, por(o.eje, r.s));
    };
    const proyectar = (pos) => punto(resta(aLocal(o.marco(), pos), o.desde), o.eje);

    r.distancia = (pos, llegada) => {
      if (r.mano || (o.disponible && !o.disponible())) return null;
      return enZona(o, o.marco(), suma(suma(o.desde, por(o.eje, r.s)), o.agarre), pos, llegada, o.eje);
    };
    r.tomar = (mano, ctx) => {
      r.mano = mano;
      // Tomarlo trabado lo destraba: tirar un poco y soltar es lo que lo libera.
      if (r.trabado) { r.trabado = false; r.llego = true; }
      r.desfase = proyectar(ctx.pos) - r.s;
    };
    r.mover = (mano, ctx) => {
      // El padre dejó de estar disponible (lo soltaron): suelta también esta mano.
      if (o.disponible && !o.disponible()) { r.mano = null; return "soltar"; }
      r.poner(proyectar(ctx.pos) - r.desfase);
      if (r.s >= o.largo - 1e-4 && !r.llego) {
        r.llego = true;
        if (o.alLlegar) o.alLlegar();
      }
    };
    r.soltar = () => { r.mano = null; };
    /** Un golpe desde adentro (un tiro): va al tope y vuelve, sin avisar. */
    r.golpe = () => { if (!r.mano && !r.trabado) r.poner(o.largo); };
    r.trabar = () => { r.trabado = true; r.llego = false; r.poner(o.largo); };
    r.destrabar = () => { r.trabado = false; };
    r.animar = (dt) => {
      if (r.mano || r.trabado || !o.resorte || r.s <= 0) return;
      r.poner(r.s - o.resorte * dt);
      if (r.s <= 0 && r.llego) {
        r.llego = false;
        if (o.alVolver) o.alVolver();
      }
    };
    r.poner(0);
    return r;
  }

  // ── guia ──────────────────────────────────────────────────────────────────
  /** o = {
   *    marco()            la pose de mundo del padre
   *    entrada, eje       dónde está el punto de referencia del objeto al entrar
   *                       (s = 0) y hacia dónde se empuja (locales)
   *    largo              el recorrido hasta asentarse
   *    q                  el giro que tiene que tener el objeto, en el padre
   *    holgura            cuánto puede errarle al eje, en metros
   *    tolerancia         cuánto puede errarle al giro, en grados
   *    acepta(obj)        si es un objeto que entra acá
   *    disponible()       si se puede meter o sacar algo ahora
   *    alAsentar(obj), alSalir(obj)
   *  } */
  function guia(o) {
    const g = { ocupante: null, o };
    g.pose = (s) => ({ p: aMundo(o.marco(), suma(o.entrada, por(o.eje, s))), q: qMul(o.marco().q, o.q) });
    g.ejeMundo = () => rotar(o.marco().q, o.eje);
    g.proyectar = (pw) => punto(resta(aLocal(o.marco(), pw), o.entrada), o.eje);
    g.disponible = () => !o.disponible || o.disponible();
    /** Capta sólo en la boca: entre un poco antes y un poco después de la
     *  entrada, cerca del eje y bien girado. Llegar de costado a la mitad del
     *  recorrido no entra: habría que atravesar el padre. */
    g.capta = (obj, pose) => {
      if (g.ocupante || !g.disponible() || (o.acepta && !o.acepta(obj))) return false;
      const s = g.proyectar(pose.p);
      if (s < -o.holgura || s > o.holgura) return false;
      const lado = largo(resta(resta(aLocal(o.marco(), pose.p), o.entrada), por(o.eje, s)));
      if (lado > o.holgura) return false;
      return angulo(pose.q, qMul(o.marco().q, o.q)) <= grados(o.tolerancia);
    };
    return g;
  }

  // ── suelto ────────────────────────────────────────────────────────────────
  /** o = {
   *    nodo               su nodo, hijo del escenario (no se reparenta nunca:
   *                       asentado, sigue a su guía cuadro a cuadro)
   *    agarre, radio      por dónde se toma (local) y a qué distancia
   *    grosor             medio espesor sobre su X local: acostado, apoya así
   *    apoyo(x, z)        la altura de lo que hay abajo
   *    guias()            las guías donde podría entrar
   *    enMano(ctx)        (opcional) la pose que tiene en la mano: fija respecto
   *                       del mando, no importa cómo se lo agarró. Sin esto, se
   *                       lleva como se lo tomó.
   *    G
   *  } */
  function suelto(o) {
    const u = { estado: "apoyado", p: v3(0, 0, 0), q: { x: 0, y: 0, z: 0, w: 1 }, v: v3(0, 0, 0), mano: null, rel: null, guia: null, s: 0, desfase: 0, o };
    /** Dónde lo pone la mano: la pose fija, o la relativa de cuando se tomó. */
    const enLaMano = (ctx) => (o.enMano ? o.enMano(ctx) : { p: suma(ctx.pos, rotar(ctx.q, u.rel.p)), q: qMul(ctx.q, u.rel.q) });
    u.poner = (pose) => { u.p = pose.p; u.q = pose.q; ponerNodo(o.nodo, pose); };

    u.distancia = (pos, llegada) => {
      if (u.mano) return null;
      if ((u.estado === "puesto" || u.estado === "guia") && !u.guia.disponible()) return null;
      return enZona(o, u, o.agarre, pos, llegada, v3(0, 1, 0));
    };
    u.tomar = (mano, ctx) => {
      u.mano = mano;
      // Como está: el giro y el lugar relativos a la mano quedan fijos.
      u.rel = { p: rotar(qConj(ctx.q), resta(u.p, ctx.pos)), q: qMul(qConj(ctx.q), u.q) };
      if (u.estado === "puesto") { u.estado = "guia"; u.s = u.guia.o.largo; }
      else if (u.estado !== "guia") u.estado = "mano";
      // Tomado dentro de una guía: se sigue desde donde está, sin salto, aunque
      // la pose fija en la mano no coincida con la de la guía.
      u.desfase = u.estado === "guia" ? u.s - u.guia.proyectar(enLaMano(ctx).p) : 0;
    };
    u.mover = (mano, ctx) => {
      const deseo = enLaMano(ctx);
      if (u.estado === "mano") {
        for (const g of o.guias()) {
          if (!g.capta(u, deseo)) continue;
          g.ocupante = u;
          u.guia = g;
          u.estado = "guia";
          u.s = g.proyectar(deseo.p);
          u.desfase = 0;
          break;
        }
        if (u.estado === "mano") { u.poner(deseo); return; }
      }
      // En la guía: la mano sólo decide cuánto entra; el giro y el eje son de la guía.
      const g = u.guia;
      if (!g.disponible()) { u.mano = null; u.estado = "sale"; return "soltar"; }
      const s = g.proyectar(deseo.p) + u.desfase;
      if (s < -g.o.holgura) {
        g.ocupante = null;
        u.guia = null;
        u.desfase = 0;
        u.estado = "mano";
        u.poner(deseo);
        if (g.o.alSalir) g.o.alSalir(u);
        return;
      }
      if (s >= g.o.largo) {
        u.s = g.o.largo;
        u.estado = "puesto";
        u.mano = null;
        u.poner(g.pose(u.s));
        if (g.o.alAsentar) g.o.alAsentar(u);
        return "soltar";
      }
      // Adentro, la mano sólo mueve a lo largo del eje: lo lateral y el giro no
      // cuentan, así que el objeto recorre la guía entera, sin atajos.
      u.s = s;
      u.poner(g.pose(Math.max(0, u.s)));
    };
    u.soltar = (mano, ctx) => {
      u.mano = null;
      if (u.estado === "mano") { u.estado = "cae"; u.v = ctx.vel || v3(0, 0, 0); }
      else if (u.estado === "guia") u.estado = "sale";   // a medio meter: se sale solo
    };
    /** Apoyado sobre su costado: el X local hacia arriba, el Y acostado. */
    function acostar() {
      let h = rotar(u.q, ARRIBA);
      h = v3(h.x, 0, h.z);
      h = largo(h) < 1e-3 ? v3(1, 0, 0) : unitario(h);
      const X = v3(0, 1, 0), Y = h, Z = cruz(X, Y);
      return qDeBase(X, Y, Z);
    }
    u.animar = (dt) => {
      if (u.estado === "puesto" || (u.estado === "guia" && u.mano)) {
        // Sigue a su guía aunque el padre se mueva.
        u.poner(u.guia.pose(Math.max(0, u.s)));
      } else if (u.estado === "sale") {
        u.s -= 1.2 * dt;
        if (u.s < 0) {
          const g = u.guia;
          g.ocupante = null;
          u.guia = null;
          u.estado = "cae";
          u.v = por(g.ejeMundo(), -1.2);
          if (g.o.alSalir) g.o.alSalir(u);
        } else u.poner(u.guia.pose(u.s));
      } else if (u.estado === "cae" && dt > 0) {
        u.v = v3(u.v.x, u.v.y - o.G * dt, u.v.z);
        const p = suma(u.p, por(u.v, dt));
        const piso = o.apoyo(p.x, p.z);
        if (p.y - o.grosor <= piso && u.v.y < 0) {
          u.estado = "apoyado";
          u.v = v3(0, 0, 0);
          u.poner({ p: v3(p.x, piso + o.grosor, p.z), q: acostar() });
        } else u.poner({ p, q: u.q });
      }
    };
    return u;
  }

  // ── arrastre ──────────────────────────────────────────────────────────────
  /** Un punto que la mano toma y lleva adonde quiera, en el marco de su padre:
   *  sin eje ni topes. Para mover a mano algo que no es una pieza (una zona que
   *  se está ajustando, un marcador).
   *
   *  o = {
   *    marco()            la pose de mundo del padre
   *    leer()             dónde está el punto, local al padre
   *    escribir(p)        llevarlo ahí
   *    radio              a qué distancia se toma
   *    disponible()
   *    alSoltar()
   *  } */
  function arrastre(o) {
    const a = { mano: null, desfase: v3(0, 0, 0), o };
    a.distancia = (pos) => {
      if (a.mano || (o.disponible && !o.disponible())) return null;
      const d = largo(resta(pos, aMundo(o.marco(), o.leer())));
      return d <= o.radio ? d : null;
    };
    a.tomar = (mano, ctx) => {
      a.mano = mano;
      a.desfase = resta(aLocal(o.marco(), ctx.pos), o.leer());
    };
    a.mover = (mano, ctx) => {
      if (o.disponible && !o.disponible()) { a.mano = null; return "soltar"; }
      o.escribir(resta(aLocal(o.marco(), ctx.pos), a.desfase));
    };
    a.soltar = () => { a.mano = null; if (o.alSoltar) o.alSoltar(); };
    return a;
  }

  // ── bisagra ───────────────────────────────────────────────────────────────
  /** Una tapa (o puerta, o compuerta) que gira sobre un eje de su padre entre
   *  cerrada y abierta, y va sola de una a otra. Se alterna tocándola o
   *  tomándola: el agarre la abre o la cierra y suelta la mano enseguida.
   *
   *  o = {
   *    nodo               el grupo que gira, puesto en la bisagra
   *    eje                el eje de giro, local al padre (unitario)
   *    abierta            el ángulo abierta, en radianes (cerrada es 0)
   *    velocidad          rad/s
   *    punto(), radio     dónde se toma, en mundo
   *    disponible()
   *    alAbrir(), alCerrar()   al empezar a abrirse o a cerrarse
   *  } */
  function bisagra(o) {
    const b = { angulo: 0, abierta: false };
    const poner = (a) => {
      b.angulo = a;
      const s = Math.sin(a / 2);
      o.nodo.rotation = eulerDeQ({ x: o.eje.x * s, y: o.eje.y * s, z: o.eje.z * s, w: Math.cos(a / 2) });
    };
    b.abrir = () => { if (b.abierta) return; b.abierta = true; if (o.alAbrir) o.alAbrir(); };
    b.cerrar = () => { if (!b.abierta) return; b.abierta = false; if (o.alCerrar) o.alCerrar(); };
    b.alternar = () => (b.abierta ? b.cerrar() : b.abrir());
    b.distancia = (pos) => {
      if (o.disponible && !o.disponible()) return null;
      const d = largo(resta(pos, o.punto()));
      return d <= o.radio ? d : null;
    };
    b.tomar = () => b.alternar();
    b.mover = () => "soltar";
    b.soltar = () => {};
    b.animar = (dt) => {
      const meta = b.abierta ? o.abierta : 0;
      if (b.angulo === meta) return;
      const paso = o.velocidad * dt;
      poner(Math.abs(meta - b.angulo) <= paso ? meta : b.angulo + Math.sign(meta - b.angulo) * paso);
    };
    poner(0);
    return b;
  }

  // ── agarre ────────────────────────────────────────────────────────────────
  /** o = { marco(), punto (local al marco), radio (y el resto de una zona),
   *        disponible(), tomar, mover, soltar } */
  function agarre(o) {
    const a = { mano: null, o };
    a.distancia = (pos, llegada) => {
      if (a.mano || (o.disponible && !o.disponible())) return null;
      return enZona(o, o.marco(), typeof o.punto === "function" ? o.punto() : o.punto, pos, llegada);
    };
    a.tomar = (mano, ctx) => { a.mano = mano; if (o.tomar) o.tomar(mano, ctx); };
    // Devolver "soltar" quiere decir que la pieza ya se soltó sola: se limpia acá.
    a.mover = (mano, ctx) => {
      const r = o.mover ? o.mover(mano, ctx) : undefined;
      if (r === "soltar") { a.mano = null; if (o.soltar) o.soltar(mano, ctx); }
      return r;
    };
    a.soltar = (mano, ctx) => { a.mano = null; if (o.soltar) o.soltar(mano, ctx); };
    return a;
  }

  return { riel, guia, suelto, arrastre, bisagra, agarre, enZona, direccionDe, aMundo, aLocal, angulo, ponerNodo };
}]);
