// interactivos.js — los controles que responden al toque.
//
// No hay hover en el motor: sólo llega `toque`, y llega **con el punto de
// impacto en coordenadas del mundo** (x, y, z). Eso decide el lenguaje de
// interacción de todo el framework:
//
//   - no existe el estado "el puntero está encima", así que ningún control
//     puede depender de él;
//   - sí existe "acaba de ser tocado", que dura lo que uno quiera;
//   - y existe la posición, así que un control puede saber *dónde* lo tocaron.
//     Sin eso, un Slider sería dos botones de más y menos.
//
// El destello al presionar reemplaza al hover. Sin realimentación, un botón
// flotando en el aire no se siente apretado, y el destello es la única señal
// disponible.
(function () {
  "use strict";

  const U = globalThis.UI;
  const heredar = U.heredar;
  const num = U.numero;
  const bool = U.booleano;
  const grosor = U.grosor;
  const anchoDe = U.anchoDe;
  const altoDe = U.altoDe;
  const medirTexto = U.medirTexto;
  const C = (U.CFG && U.CFG.C) || {};

  const MS_DESTELLO = 170;

  /** Base de todo lo que se toca. Guarda cuándo fue el último toque y expone
   *  `destello()`: cuánto de encendido está ahora mismo, de 1 a 0. */
  function Interactivo(a) {
    U.Elemento.call(this, a);
    this.habilitado = bool(a.IsEnabled, true);
    this.tocadoEn = 0;
    /** Lo pone y lo saca el host desde `pointerenter` / `pointerleave`. */
    this.encima = false;
  }
  heredar(Interactivo, U.Elemento);

  /** Cuánto hay que aclarar el fondo ahora mismo: el destello del toque, que
   *  decae, más un escalón fijo mientras el puntero esté encima.
   *
   *  Son dos señales distintas y por eso se suman en vez de elegir una: el hover
   *  dice "esto se puede tocar" y el destello dice "te escuché". */
  Interactivo.prototype.realce = function () {
    return (this.encima || this._focused ? 0.18 : 0) + 0.5 * this.destello();
  };

  Interactivo.prototype.destello = function () {
    if (!this.tocadoEn) return 0;
    const t = (Date.now() - this.tocadoEn) / MS_DESTELLO;
    return t >= 1 ? 0 : 1 - t;
  };

  /** Resolver un nombre de manejador contra los que registró la aplicación.
   *  Es el Click="aceptar" de XAML: el marcado nombra, el código provee. */
  Interactivo.prototype.manejador = function (app, nombre) {
    if (!nombre) return null;
    const h = app && app.manejadores ? app.manejadores[nombre] : null;
    return typeof h === "function" ? h : null;
  };

  Interactivo.prototype.marcarToque = function (app) {
    this.tocadoEn = Date.now();
    app.animar(MS_DESTELLO + 40,this);
  };

  // ── Button ────────────────────────────────────────────────────────────────
  function Button(a) {
    Interactivo.call(this, a);
    this.contenido = a.Content !== undefined ? a.Content : (a.__texto || "");
    this.tam = num(a.FontSize, 0.034);
    this.fondo = a.Background || C.azul || "#0A84FF";
    this.color = a.Foreground || C.texto || "#FFFFFF";
    this.radio = num(a.CornerRadius, 0.012);
    this.relleno = grosor(a.Padding || "0.024,0.014");
    this.alClick = a.Click || null;
  }
  heredar(Button, Interactivo);

  Button.prototype.medirContenido = function () {
    const m = medirTexto(this.contenido, this.tam);
    return { w: m.w + anchoDe(this.relleno), h: m.h + altoDe(this.relleno) };
  };

  Button.prototype.dibujar = function (ctx) {
    const b = this.caja;
    const d = this.destello();
    const self = this;

    // **El blanco táctil va primero, debajo de todo lo que dibuja el control.**
    // Es un plano opaco: emitido al final tapaba el relleno del Slider y la
    // casilla del CheckBox. Que quede abajo no le quita sensibilidad —el rayo
    // busca el nodo tocable más cercano y la malla no es tocable— así que el
    // orden visual y el orden de impacto son independientes.
    if (this.habilitado) {
      ctx.blanco(b.x, b.y, b.w, b.h, this.fondo, function (app) {
        self.marcarToque(app);
        const h = self.manejador(app, self.alClick);
        if (h) h(self, app);
      }, this);
      ctx.subir();
    }
    // El destello aclara el fondo y decae solo. El color del estado se **deriva**
    // en vez de pedirse: exigirle tres colores a quien escribe la interfaz es
    // pedirle que además sea diseñador.
    const k = this.realce();
    const fondo = !this.habilitado ? U.tinte(this.fondo, 0.45)
                : k > 0 ? U.tinte(this.fondo, 1 + k)
                : this.fondo;
    ctx.g.rectRedondeado(b.x, b.y, b.w, b.h, this.radio, fondo);
    ctx.subir();
    ctx.texto(b.x + b.w / 2, b.y + b.h / 2, this.contenido, this.tam,
              this.habilitado ? this.color : U.tinte(this.color, 0.55));
    ctx.subir();
  };
  Button.prototype.mapa = {
    Content: "contenido", Background: "fondo", Foreground: "color",
    FontSize: "tam", IsEnabled: "habilitado",
  };
  U.tipos.Button = Button;

  // ── CheckBox ──────────────────────────────────────────────────────────────
  function CheckBox(a) {
    Interactivo.call(this, a);
    this.marcado = bool(a.IsChecked, false);
    this.contenido = a.Content !== undefined ? a.Content : (a.__texto || "");
    this.tam = num(a.FontSize, 0.032);
    this.color = a.Foreground || C.texto || "#FFFFFF";
    this.acento = a.Accent || C.verde || "#30D158";
    this.alCambiar = a.Changed || null;
    this.lado = num(a.BoxSize, 0.042);
    this.hueco = num(a.Spacing, 0.014);
  }
  heredar(CheckBox, Interactivo);

  CheckBox.prototype.medirContenido = function () {
    const m = medirTexto(this.contenido, this.tam);
    return { w: this.lado + this.hueco + m.w, h: Math.max(this.lado, m.h) };
  };

  CheckBox.prototype.dibujar = function (ctx) {
    const b = this.caja;
    const l = this.lado;
    const cy = b.y + (b.h - l) / 2;
    const d = this.destello();
    const marco = this.marcado ? this.acento : (C.borde || "#5A5A70");
    const k = this.realce();
    const brillo = k > 0 ? U.tinte(marco, 1 + k) : marco;
    const self = this;

    // El blanco cubre la casilla **y su etiqueta**: en WPF un CheckBox se activa
    // tocando el texto, y a un metro y medio de distancia una casilla de 4 cm
    // sola sería un blanco cruel. Va primero, por lo mismo que en Button.
    if (this.habilitado) {
      ctx.blanco(b.x, b.y, b.w, b.h, C.superficie || "#1C1C26", function (app) {
        self.marcado = !self.marcado;
        self.devolver(app.datos, "IsChecked", self.marcado);
        self.marcarToque(app);
        const h = self.manejador(app, self.alCambiar);
        if (h) h(self, app);
        app.invalidar();
      }, this);
      ctx.subir();
    }

    ctx.g.rectRedondeado(b.x, cy, l, l, 0.008, brillo);
    ctx.subir();
    if (this.marcado) {
      // La marca es un cuadrado adentro y no un tilde: un tilde en malla son dos
      // rectángulos girados y a 3 cm no se distingue de una mancha.
      ctx.g.rectRedondeado(b.x + l * 0.26, cy + l * 0.26, l * 0.48, l * 0.48,
                           0.004, C.fondo || "#08080C");
    } else {
      ctx.g.rectRedondeado(b.x + 0.005, cy + 0.005, l - 0.01, l - 0.01,
                           0.005, C.superficie || "#1C1C26");
    }
    ctx.subir();
    if (this.contenido) {
      const m = medirTexto(this.contenido, this.tam);
      ctx.texto(b.x + l + this.hueco + m.w / 2, b.y + b.h / 2,
                this.contenido, this.tam, this.color);
    }
    ctx.subir();
  };
  CheckBox.prototype.mapa = {
    IsChecked: "marcado", Content: "contenido", Foreground: "color",
    Accent: "acento", IsEnabled: "habilitado",
  };
  U.tipos.CheckBox = CheckBox;

  // ── ProgressBar ───────────────────────────────────────────────────────────
  function ProgressBar(a) {
    U.Elemento.call(this, a);
    this.min = num(a.Minimum, 0);
    this.max = num(a.Maximum, 1);
    this.valor = num(a.Value, 0);
    this.fondo = a.Background || C.superficieAlta || "#2A2A38";
    this.relleno = a.Foreground || C.azul || "#0A84FF";
    this.radio = num(a.CornerRadius, 0.01);
  }
  heredar(ProgressBar, U.Elemento);

  ProgressBar.prototype.fraccion = function () {
    const r = this.max - this.min;
    if (!(r > 0)) return 0;
    return Math.max(0, Math.min(1, (this.valor - this.min) / r));
  };

  ProgressBar.prototype.medirContenido = function () {
    return { w: 0.2, h: 0.024 };
  };

  ProgressBar.prototype.dibujar = function (ctx) {
    const b = this.caja;
    ctx.g.rectRedondeado(b.x, b.y, b.w, b.h, this.radio, this.fondo);
    ctx.subir();
    const w = b.w * this.fraccion();
    if (w > 0.001) {
      ctx.g.rectRedondeado(b.x, b.y, Math.max(w, this.radio * 2), b.h,
                           this.radio, this.relleno);
    }
    ctx.subir();
  };
  ProgressBar.prototype.mapa = {
    Value: "valor", Minimum: "min", Maximum: "max",
    Foreground: "relleno", Background: "fondo",
  };
  U.tipos.ProgressBar = ProgressBar;

  // ── Slider ────────────────────────────────────────────────────────────────
  // El único control que usa la posición del toque. El host traduce el punto de
  // impacto del mundo a coordenadas de la hoja y se lo pasa al manejador.
  function Slider(a) {
    Interactivo.call(this, a);
    this.min = num(a.Minimum, 0);
    this.max = num(a.Maximum, 1);
    this.valor = num(a.Value, 0);
    this.paso = num(a.Step, 0);
    this.pista = a.Background || C.superficieAlta || "#2A2A38";
    this.relleno = a.Foreground || C.azul || "#0A84FF";
    this.perilla = a.ThumbBrush || C.texto || "#FFFFFF";
    this.altoPista = num(a.TrackHeight, 0.016);
    this.ladoPerilla = num(a.ThumbSize, 0.046);
    this.alCambiar = a.ValueChanged || null;
  }
  heredar(Slider, Interactivo);

  Slider.prototype.fraccion = function () {
    const r = this.max - this.min;
    if (!(r > 0)) return 0;
    return Math.max(0, Math.min(1, (this.valor - this.min) / r));
  };

  Slider.prototype.medirContenido = function () {
    return { w: 0.28, h: Math.max(this.ladoPerilla, this.altoPista) };
  };

  Slider.prototype.dibujar = function (ctx) {
    const b = this.caja;
    const util = Math.max(0.001, b.w - this.ladoPerilla);
    const f = this.fraccion();
    const cy = b.y + b.h / 2;
    const x0 = b.x + this.ladoPerilla / 2;
    const self = this;

    // Primero el blanco, como en los demás. Acá importa el doble: es un plano
    // opaco del ancho entero del control, y emitido al final tapaba la pista, el
    // relleno y la perilla, dejando un rectángulo gris.
    if (this.habilitado) {
      ctx.blanco(b.x, b.y, b.w, b.h, this.pista, function (app, hoja) {
        if (hoja) {
          const t = (hoja.x - x0) / util;
          let v = self.min + Math.max(0, Math.min(1, t)) * (self.max - self.min);
          if (self.paso > 0) v = Math.round(v / self.paso) * self.paso;
          self.valor = v;
          // TwoWay: el control mueve el dato, no sólo se pinta con él.
          self.devolver(app.datos, "Value", v);
        }
        self.marcarToque(app);
        const h = self.manejador(app, self.alCambiar);
        if (h) h(self, app);
        app.invalidar();
      }, this);
      ctx.subir();
    }

    ctx.g.rectRedondeado(x0, cy - this.altoPista / 2, util, this.altoPista,
                         this.altoPista / 2, this.pista);
    ctx.subir();
    if (f > 0) {
      ctx.g.rectRedondeado(x0, cy - this.altoPista / 2,
                           Math.max(util * f, this.altoPista), this.altoPista,
                           this.altoPista / 2, this.relleno);
    }
    ctx.subir();

    // La perilla crece con el hover en vez de sólo cambiar de color: en un
    // deslizador, lo que uno quiere saber antes de tocar es dónde está el
    // agarre, y el tamaño lo dice mejor que el brillo.
    const d = this.destello();
    const lp = this.ladoPerilla * (this.encima ? 1.18 : 1);
    ctx.g.rectRedondeado(x0 + util * f - lp / 2, cy - lp / 2, lp, lp, lp / 2,
                         d > 0 ? U.tinte(this.perilla, 1 - 0.3 * d) : this.perilla);
    ctx.subir();
  };
  Slider.prototype.mapa = {
    Value: "valor", Minimum: "min", Maximum: "max",
    Foreground: "relleno", IsEnabled: "habilitado",
  };
  U.tipos.Slider = Slider;

  U.Interactivo = Interactivo;
  U.MS_DESTELLO = MS_DESTELLO;
})();
