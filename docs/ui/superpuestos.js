// superpuestos.js — la capa de arriba: desplegables, globos y diálogos.
//
// Todo lo que había hasta acá vive **adentro** del rectángulo de la aplicación y
// se acomoda con sus hermanos. Un desplegable no: se abre encima, tapa lo que
// haya debajo, y si no entra hacia abajo se abre hacia arriba. Un globo de ayuda
// tampoco: aparece al lado del control y no empuja a nadie.
//
// En WPF eso es el `Popup`, que no es un control sino **otra ventana**. Acá no
// hay ventanas, pero hay algo equivalente y más barato: la pasada emite la malla
// en orden y `g.z` sube a medida que avanza, así que **emitir después es estar
// más adelante**. Una capa superpuesta es simplemente lo último que se emite,
// con un salto de z que la despega de todo el resto.
//
// Eso alcanza también para el toque, y no por casualidad: el rayo se queda con
// el nodo tocable más cercano, así que el blanco de un desplegable abierto le
// gana al del control que quedó debajo. No hay que desactivar nada.
//
// Lo que **no** se puede hacer, medido: un velo semitransparente. Un `<plane>`
// toma un color plano y `material-alpha` mira el alfa de la textura, que acá no
// existe. Así que un diálogo modal oscurece con un rectángulo **opaco** —que es
// como se ve un modal de todos modos— y un desplegable no pone velo: se cierra
// eligiendo, o volviendo a tocar el control.
(function () {
  "use strict";

  const U = globalThis.UI;
  const heredar = U.heredar;
  const num = U.numero;
  const grosor = U.grosor;
  const anchoDe = U.anchoDe;
  const altoDe = U.altoDe;
  const medirTexto = U.medirTexto;
  const C = (U.CFG && U.CFG.C) || {};

  /** El salto de z entre capas. Muy por encima de PASO_Z, que separa las partes
   *  de un mismo control: una capa tiene que despegarse de **todo** el árbol de
   *  abajo, no del último rectángulo emitido. */
  const SALTO_CAPA = 0.02;

  /** `marco` toma un grosor de los cuatro lados, no un numero. */
  const GROSOR_BORDE = grosor("0.003");
  const GROSOR_GLOBO = grosor("0.002");

  // ── El registro de capas ──────────────────────────────────────────────────

  /** Abrir una capa.
   *
   *  @param el     un árbol de elementos ya inflado
   *  @param op.x,y esquina superior izquierda pedida, en coordenadas de la
   *                aplicación. Se corrige para que la capa no se salga.
   *  @param op.ancho,alto  el espacio máximo que se le ofrece al medir
   *  @param op.modal       oscurecer y tragarse los toques de abajo
   *  @param op.duenio      quién la abrió, para poder cerrarla por dueño
   *  @param op.alCerrar    aviso, una sola vez
   *  @return un identificador para `cerrar` */
  U.Aplicacion.prototype.superponer = function (el, op) {
    const o = op || {};
    if (!this.capas) this.capas = [];
    el.app = this;
    this.capaSiguiente = (this.capaSiguiente || 0) + 1;
    const capa = {
      id: this.capaSiguiente,
      el: el,
      x: o.x || 0,
      y: o.y || 0,
      ancho: o.ancho || this.ancho,
      alto: o.alto || this.alto,
      modal: !!o.modal,
      centrar: !!o.centrar,
      alturaAncla: o.alturaAncla,
      duenio: o.duenio || null,
      alCerrar: o.alCerrar || null,
    };
    this.capas.push(capa);
    this.invalidar();
    return capa.id;
  };

  /** Cerrar por id, por dueño, o todas. */
  U.Aplicacion.prototype.cerrarCapa = function (que) {
    if (!this.capas || !this.capas.length) return false;
    const quedan = [];
    let cerradas = 0;
    for (let i = 0; i < this.capas.length; i++) {
      const c = this.capas[i];
      const coincide = que === undefined || que === null ? true
                     : typeof que === "number" ? c.id === que
                     : c.duenio === que;
      if (!coincide) { quedan.push(c); continue; }
      cerradas++;
      if (c.alCerrar) c.alCerrar();
    }
    this.capas = quedan;
    if (cerradas) this.invalidar();
    return cerradas > 0;
  };

  U.Aplicacion.prototype.tieneCapa = function (duenio) {
    if (!this.capas) return false;
    for (let i = 0; i < this.capas.length; i++) {
      if (this.capas[i].duenio === duenio) return true;
    }
    return false;
  };

  /** Lo que llama el host después de emitir el árbol principal.
   *
   *  Cada capa se mide y se acomoda **acá**, no en la pasada de layout: su
   *  posición depende de dónde quedó el control que la abrió, y eso recién se
   *  sabe cuando el árbol ya se acomodó. */
  U.Aplicacion.prototype.emitirCapas = function (ctx) {
    // Se crea acá y no en el constructor para no tocar host.js, que no tiene por
    // qué saber que existen las capas. Después de la primera pasada el arreglo
    // está siempre, que es lo que esperan los que lo consultan.
    if (!this.capas) this.capas = [];
    if (!this.capas.length) return;

    for (let i = 0; i < this.capas.length; i++) {
      const c = this.capas[i];
      const el = c.el;

      // Los enlaces tambien valen en una capa: un dialogo que muestra un dato
      // del modelo es el caso normal, no la excepcion.
      el.aplicarEnlaces(this.datos, this);
      el.medir(c.ancho, c.alto);
      const w = Math.min(el.deseado.w, c.ancho);
      const h = Math.min(el.deseado.h, c.alto);

      // Que no se salga del panel. Primero se prueba tal cual; si no entra hacia
      // abajo, se vuelca hacia arriba del ancla — que es lo que hace cualquier
      // desplegable cerca del borde inferior de una pantalla.
      let x = Math.max(0, Math.min(c.x, this.ancho - w));
      let y = c.y;
      if (c.centrar) {
        // El centrado se resuelve aca y no al abrir: el tamanio de la capa sale
        // de medirla, y medirla necesita el espacio que recien se conoce ahora.
        x = Math.max(0, (this.ancho - w) / 2);
        y = Math.max(0, (this.alto - h) / 2);
      } else if (y + h > this.alto) {
        const arriba = (c.alturaAncla !== undefined ? c.y - c.alturaAncla : c.y) - h;
        y = arriba >= 0 ? arriba : Math.max(0, this.alto - h);
      }

      ctx.g.z += SALTO_CAPA;

      if (c.modal) {
        // El velo. Opaco, porque no hay alfa: oscurece el fondo con un
        // rectángulo del color de la sala y se traga el toque.
        const self = this;
        const idCapa = c.id;
        ctx.g.rect(0, 0, this.ancho, this.alto, U.tinte(C.fondo || "#08080C", 0.85));
        ctx.blanco(0, 0, this.ancho, this.alto, U.tinte(C.fondo || "#08080C", 0.85),
                   function (app) { self.cerrarCapa(idCapa); void app; }, null);
        ctx.g.z += SALTO_CAPA;
      }

      el.acomodar(x, y, w, h);
      // Popups absorb the gaps between options. Tooltips must not steal hover
      // from the control that keeps them open.
      if(ctx.bloquear && c.id !== this.globoCapa && el.pointerBlocking !== false)
        ctx.bloquear(x,y,w,h,el.radio||0);
      el.emitir(ctx);
    }
  };

  // ── ComboBox ──────────────────────────────────────────────────────────────
  //
  // El desplegable. Cerrado es un botón que dice qué está elegido; abierto es
  // una capa con una fila por opción.
  //
  // Las opciones se declaran como texto separado por `;` —`Items="Bajo;Medio;
  // Alto"`— o se enlazan a un arreglo de strings. No acepta plantillas todavía:
  // un ComboBox con plantilla es un ListBox con más pasos, y el ListBox no está.

  function ComboBox(a) {
    U.Interactivo.call(this, a);
    this.opciones = ComboBox.leerOpciones(a.Items);
    this.elegida = num(a.SelectedIndex, 0);
    this.tam = num(a.FontSize, 0.03);
    this.fondo = a.Background || C.superficieAlta || "#2A2A38";
    this.color = a.Foreground || C.texto || "#FFFFFF";
    this.acento = a.Accent || C.azul || "#0A84FF";
    this.radio = num(a.CornerRadius, 0.01);
    this.relleno = grosor(a.Padding || "0.016,0.01");
    this.alCambiar = a.SelectionChanged || null;
  }
  heredar(ComboBox, U.Interactivo);

  ComboBox.leerOpciones = function (v) {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === "string" && v.length) return v.split(";");
    return [];
  };

  /** El ancho es el de la opción más larga, no el de la elegida: si cambiara de
   *  tamaño al elegir, el panel entero se reacomodaría a cada selección. */
  ComboBox.prototype.medirContenido = function () {
    let w = 0;
    for (let i = 0; i < this.opciones.length; i++) {
      const m = medirTexto(this.opciones[i], this.tam);
      if (m.w > w) w = m.w;
    }
    return {
      w: w + anchoDe(this.relleno) + this.tam * 1.4,
      h: this.tam + altoDe(this.relleno),
    };
  };

  ComboBox.prototype.abierto = function () {
    return !!(this.app && this.app.tieneCapa(this));
  };

  ComboBox.prototype.alternar = function (app) {
    if (app.tieneCapa(this)) { app.cerrarCapa(this); return; }
    // Una sola capa de desplegable a la vez: dos abiertos se pisarían y el de
    // abajo quedaría inalcanzable.
    app.cerrarCapa();

    const lista = new ListaDeOpciones({
      opciones: this.opciones,
      elegida: this.elegida,
      tam: this.tam,
      fondo: this.fondo,
      color: this.color,
      acento: this.acento,
      radio: this.radio,
      relleno: this.relleno,
      Width: String(this.caja.w),
      duenio: this,
    });

    app.superponer(lista, {
      x: this.caja.x,
      y: this.caja.y + this.caja.h + 0.004,
      alturaAncla: this.caja.h + 0.008,
      ancho: app.ancho,
      alto: app.alto,
      duenio: this,
    });
  };

  ComboBox.prototype.elegir = function (i, app) {
    if (i === this.elegida) return;
    this.elegida = i;
    this.devolver(app.datos, "SelectedIndex", i);
    const h = this.manejador(app, this.alCambiar);
    if (h) h(this, app, this.opciones[i]);
  };

  ComboBox.prototype.dibujar = function (ctx) {
    const b = this.caja;
    const self = this;

    if (this.habilitado) {
      ctx.blanco(b.x, b.y, b.w, b.h, this.fondo, function (app) {
        self.marcarToque(app);
        self.alternar(app);
      }, this);
      ctx.subir();
    }

    const k = this.realce();
    const fondo = !this.habilitado ? U.tinte(this.fondo, 0.45)
                : k > 0 ? U.tinte(this.fondo, 1 + k) : this.fondo;
    ctx.g.rectRedondeado(b.x, b.y, b.w, b.h, this.radio, fondo);
    ctx.subir();

    // La flecha. Dos triángulos no: un chevrón es un triángulo, y como
    // `Geometria` sólo sabe de rectángulos, se arma con tres rectángulos
    // escalonados. A este tamaño se lee igual y no agrega API nueva.
    const t = this.tam * 0.5;
    const cx = b.x + b.w - anchoDe(this.relleno) / 2 - t / 2;
    const cy = b.y + b.h / 2;
    const abierto = this.abierto();
    for (let i = 0; i < 3; i++) {
      const paso = t / 3;
      const ancho = t - i * paso;
      const dy = abierto ? (2 - i) * paso * 0.5 : i * paso * 0.5;
      ctx.g.rect(cx - ancho / 2, cy - t * 0.25 + dy, ancho, paso * 0.6, this.color);
    }
    ctx.subir();

    const texto = this.opciones[this.elegida];
    if (texto !== undefined) {
      ctx.texto(b.x + this.relleno.i + medirTexto(texto, this.tam).w / 2,
                b.y + b.h / 2, texto, this.tam,
                this.habilitado ? this.color : U.tinte(this.color, 0.55));
      ctx.subir();
    }
  };

  ComboBox.prototype.mapa = {
    Items: "opciones", SelectedIndex: "elegida", Background: "fondo",
    Foreground: "color", IsEnabled: "habilitado",
  };
  U.tipos.ComboBox = ComboBox;

  // ── La lista que se abre ──────────────────────────────────────────────────
  // No es un tipo del marcado: la arma el ComboBox y vive sólo en la capa.

  function ListaDeOpciones(a) {
    U.Elemento.call(this, a);
    this.opciones = a.opciones;
    this.elegida = a.elegida;
    this.tam = a.tam;
    this.fondo = a.fondo;
    this.color = a.color;
    this.acento = a.acento;
    this.radio = a.radio;
    this.relleno = a.relleno;
    this.duenio = a.duenio;
  }
  heredar(ListaDeOpciones, U.Elemento);

  ListaDeOpciones.prototype.altoFila = function () {
    return this.tam + altoDe(this.relleno);
  };

  ListaDeOpciones.prototype.medirContenido = function () {
    let w = 0;
    for (let i = 0; i < this.opciones.length; i++) {
      const m = medirTexto(this.opciones[i], this.tam);
      if (m.w > w) w = m.w;
    }
    return {
      w: w + anchoDe(this.relleno),
      h: this.altoFila() * this.opciones.length + 0.008,
    };
  };

  ListaDeOpciones.prototype.dibujar = function (ctx) {
    const b = this.caja;
    const fila = this.altoFila();
    const self = this;

    ctx.g.rectRedondeado(b.x, b.y, b.w, b.h, this.radio, U.tinte(this.fondo, 0.8));
    ctx.subir();
    ctx.g.marco(b.x, b.y, b.w, b.h, GROSOR_BORDE, this.acento);
    ctx.subir();

    for (let i = 0; i < this.opciones.length; i++) {
      const y = b.y + 0.004 + i * fila;
      const elegida = i === this.elegida;

      (function (indice) {
        ctx.blanco(b.x + 0.004, y, b.w - 0.008, fila,
                   elegida ? self.acento : self.fondo,
                   function (app) {
                     self.duenio.elegir(indice, app);
                     app.cerrarCapa(self.duenio);
                   }, null);
      })(i);
      ctx.subir();

      if (elegida) {
        ctx.g.rectRedondeado(b.x + 0.004, y, b.w - 0.008, fila, this.radio * 0.6, this.acento);
        ctx.subir();
      }
      ctx.texto(b.x + this.relleno.i + medirTexto(this.opciones[i], this.tam).w / 2,
                y + fila / 2, this.opciones[i], this.tam, this.color);
      ctx.subir();
    }
  };

  // ── ToolTip ───────────────────────────────────────────────────────────────
  //
  // Un globo de ayuda al pasar por encima. Existe **porque ahora hay hover**: el
  // motor manda `pointerenter` / `pointerleave` desde
  // `feat(input): add HTML-like hover`, y el host ya los usa para prender
  // `Interactivo.encima`. Sin eso esto no se podría hacer — un globo que
  // apareciera al tocar llegaría siempre tarde, porque el toque ya hizo lo suyo.
  //
  // No es un control sino un atributo de cualquier interactivo: `ToolTip="..."`.

  function Globo(a) {
    U.Elemento.call(this, a);
    this.texto = a.texto;
    this.tam = a.tam || 0.024;
    this.fondo = a.fondo || C.fondo || "#08080C";
    this.color = a.color || C.texto || "#FFFFFF";
    this.borde = a.borde || C.borde || "#5A5A70";
    this.relleno = grosor("0.012,0.007");
  }
  heredar(Globo, U.Elemento);

  Globo.prototype.medirContenido = function () {
    const m = medirTexto(this.texto, this.tam);
    return { w: m.w + anchoDe(this.relleno), h: m.h + altoDe(this.relleno) };
  };

  Globo.prototype.dibujar = function (ctx) {
    const b = this.caja;
    ctx.g.rectRedondeado(b.x, b.y, b.w, b.h, 0.006, this.fondo);
    ctx.subir();
    ctx.g.marco(b.x, b.y, b.w, b.h, GROSOR_GLOBO, this.borde);
    ctx.subir();
    ctx.texto(b.x + b.w / 2, b.y + b.h / 2, this.texto, this.tam, this.color);
    ctx.subir();
  };

  /** El seguimiento del hover. Se hace en la pasada y no con un evento porque el
   *  host reasigna los blancos en cada pasada: `encima` es del control, y el
   *  control es lo único estable entre pasada y pasada. */
  const MS_GLOBO = 350;

  U.Aplicacion.prototype.revisarGlobos = function () {
    const raiz = this.raiz;
    if (!raiz) return;
    const self = this;
    let encontrado = null;

    (function recorrer(el) {
      if (!el.visible) return;
      if (el.ayuda && el.encima) encontrado = el;
      for (let i = 0; i < el.hijos.length; i++) recorrer(el.hijos[i]);
    })(raiz);

    if (encontrado !== this.globoDuenio) {
      if (this.globoCapa) { this.cerrarCapa(this.globoCapa); this.globoCapa = 0; }
      this.globoDuenio = encontrado;
      this.globoDesde = encontrado ? Date.now() : 0;
      if (this._globoTimer !== undefined) clearTimeout(this._globoTimer);
      this._globoTimer = undefined;
      if (encontrado) this._globoTimer = setTimeout(function () {
        self._globoTimer = undefined;
        if (self.globoDuenio === encontrado && encontrado.encima) self.invalidateRender();
      }, MS_GLOBO);
    }

    // La demora existe para que pasar el puntero por encima de una fila de
    // botones no dispare seis globos en el camino.
    if (encontrado && !this.globoCapa && Date.now() - this.globoDesde >= MS_GLOBO) {
      const b = encontrado.caja;
      const globo = new Globo({ texto: encontrado.ayuda });
      this.globoCapa = this.superponer(globo, {
        x: b.x,
        y: b.y + b.h + 0.006,
        alturaAncla: b.h + 0.012,
        duenio: globo,
        alCerrar: function () { self.globoCapa = 0; },
      });
    }
  };

  U.Globo = Globo;
  U.ComboBox = ComboBox;
})();
