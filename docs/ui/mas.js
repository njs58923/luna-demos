// mas.js — el resto del juego base.
//
// Image, RadioButton, ToggleSwitch y TabControl. Ninguno inventa nada nuevo del
// motor: son composiciones de lo que ya hay. Que se puedan escribir en cincuenta
// líneas cada uno es la prueba de que el núcleo estaba bien repartido.
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

  // ── Image ─────────────────────────────────────────────────────────────────
  // Lo único que no puede ser malla además del texto. Un `<image>` es un plano
  // texturado: `fit` viene en `contain` y `unlit` en true, y **`color` tiñe** —
  // multiplica, al revés que una textura en modo overlay, donde el color lo pone
  // el PNG. Es la misma incoherencia que ya tenía el motor y acá sólo se hereda.
  function Image(a) {
    U.Elemento.call(this, a);
    this.fuente = a.Source || "";
    this.ajuste = a.Stretch || "contain";
    this.tinte = a.Foreground || null;
    this.anchoNatural = num(a.NaturalWidth, 0.1);
    this.altoNatural = num(a.NaturalHeight, 0.1);
  }
  heredar(Image, U.Elemento);
  Image.prototype.mapa = { Source: "fuente", Foreground: "tinte" };

  Image.prototype.medirContenido = function () {
    // El motor no dice cuánto mide una imagen hasta que la bajó, y el layout no
    // puede esperar. Así que el tamaño se declara; si no se declara, se asume
    // cuadrada de 10 cm. Es la misma clase de deuda que la métrica de texto.
    return { w: this.anchoNatural, h: this.altoNatural };
  };

  Image.prototype.dibujar = function (ctx) {
    if (!this.fuente) return;
    const b = this.caja;
    ctx.imagen(b.x, b.y, b.w, b.h, this.fuente, this.ajuste, this.tinte);
    ctx.subir();
  };
  U.tipos.Image = Image;

  // ── RadioButton ───────────────────────────────────────────────────────────
  // Como el CheckBox pero excluyente: al prenderse apaga a los de su grupo.
  // El grupo se resuelve recorriendo el árbol desde la raíz, no con un registro
  // global: dos aplicaciones con el mismo nombre de grupo no tienen por qué
  // pisarse.
  function RadioButton(a) {
    U.Interactivo.call(this, a);
    this.marcado = bool(a.IsChecked, false);
    this.grupo = a.Group || "";
    this.contenido = a.Content !== undefined ? a.Content : (a.__texto || "");
    this.tam = num(a.FontSize, 0.032);
    this.color = a.Foreground || C.texto || "#FFFFFF";
    this.acento = a.Accent || C.azul || "#0A84FF";
    this.alCambiar = a.Changed || null;
    this.lado = num(a.BoxSize, 0.042);
    this.hueco = num(a.Spacing, 0.014);
    this.valor = a.Value !== undefined ? a.Value : this.contenido;
  }
  heredar(RadioButton, U.Interactivo);
  RadioButton.prototype.mapa = {
    IsChecked: "marcado", Content: "contenido", IsEnabled: "habilitado",
  };

  RadioButton.prototype.medirContenido = function () {
    const m = medirTexto(this.contenido, this.tam);
    return { w: this.lado + this.hueco + m.w, h: Math.max(this.lado, m.h) };
  };

  /** Apagar a los hermanos del mismo grupo. */
  RadioButton.prototype.excluir = function (nodo) {
    if (nodo !== this && nodo instanceof RadioButton && nodo.grupo === this.grupo) {
      nodo.marcado = false;
    }
    for (let i = 0; i < nodo.hijos.length; i++) this.excluir(nodo.hijos[i]);
  };

  RadioButton.prototype.dibujar = function (ctx) {
    const b = this.caja;
    const l = this.lado;
    const cy = b.y + (b.h - l) / 2;
    const aro = this.marcado ? this.acento : (C.borde || "#5A5A70");
    const k = this.realce();
    const brillo = k > 0 ? U.tinte(aro, 1 + k) : aro;
    const self = this;

    if (this.habilitado) {
      ctx.blanco(b.x, b.y, b.w, b.h, C.superficie || "#1C1C26", function (app) {
        if (app.raiz) self.excluir(app.raiz);
        self.marcado = true;
        self.devolver(app.datos, "Value", self.valor);
        self.marcarToque(app);
        const h = self.manejador(app, self.alCambiar);
        if (h) h(self, app);
        app.invalidar();
      }, this);
      ctx.subir();
    }

    // Redondo, no cuadrado: es lo único que lo distingue de una casilla a
    // distancia, y esa distinción es la que dice "elegí uno" en vez de "marcá
    // los que quieras".
    ctx.g.rectRedondeado(b.x, cy, l, l, l / 2, brillo);
    ctx.subir();
    ctx.g.rectRedondeado(b.x + 0.005, cy + 0.005, l - 0.01, l - 0.01,
                         (l - 0.01) / 2, C.superficie || "#1C1C26");
    ctx.subir();
    if (this.marcado) {
      ctx.g.rectRedondeado(b.x + l * 0.28, cy + l * 0.28, l * 0.44, l * 0.44,
                           l * 0.22, this.acento);
    }
    ctx.subir();
    if (this.contenido) {
      const m = medirTexto(this.contenido, this.tam);
      ctx.texto(b.x + l + this.hueco + m.w / 2, b.y + b.h / 2,
                this.contenido, this.tam, this.color);
    }
    ctx.subir();
  };
  U.tipos.RadioButton = RadioButton;

  // ── ToggleSwitch ──────────────────────────────────────────────────────────
  // La misma semántica que un CheckBox con otra forma. Existe porque en un panel
  // a metro y medio, una llave que se corre se lee de un vistazo y una casilla
  // de cuatro centímetros hay que buscarla.
  function ToggleSwitch(a) {
    U.Interactivo.call(this, a);
    this.marcado = bool(a.IsChecked, false);
    this.contenido = a.Content !== undefined ? a.Content : (a.__texto || "");
    this.tam = num(a.FontSize, 0.032);
    this.color = a.Foreground || C.texto || "#FFFFFF";
    this.acento = a.Accent || C.verde || "#30D158";
    this.apagado = a.OffBrush || C.superficieAlta || "#2A2A38";
    this.alCambiar = a.Changed || null;
    this.ancho = num(a.SwitchWidth, 0.075);
    this.alto = num(a.SwitchHeight, 0.038);
    this.hueco = num(a.Spacing, 0.016);
  }
  heredar(ToggleSwitch, U.Interactivo);
  ToggleSwitch.prototype.mapa = {
    IsChecked: "marcado", Content: "contenido", IsEnabled: "habilitado",
  };

  ToggleSwitch.prototype.medirContenido = function () {
    const m = medirTexto(this.contenido, this.tam);
    return {
      w: this.ancho + (this.contenido ? this.hueco + m.w : 0),
      h: Math.max(this.alto, m.h),
    };
  };

  ToggleSwitch.prototype.dibujar = function (ctx) {
    const b = this.caja;
    const cy = b.y + (b.h - this.alto) / 2;
    const pista = this.marcado ? this.acento : this.apagado;
    const self = this;

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

    ctx.g.rectRedondeado(b.x, cy, this.ancho, this.alto, this.alto / 2,
                         this.realce() > 0
                           ? U.tinte(pista, 1 + 0.8 * this.realce()) : pista);
    ctx.subir();
    const r = this.alto - 0.008;
    const px = this.marcado ? b.x + this.ancho - r - 0.004 : b.x + 0.004;
    ctx.g.rectRedondeado(px, cy + 0.004, r, r, r / 2, C.texto || "#FFFFFF");
    ctx.subir();
    if (this.contenido) {
      const m = medirTexto(this.contenido, this.tam);
      ctx.texto(b.x + this.ancho + this.hueco + m.w / 2, b.y + b.h / 2,
                this.contenido, this.tam, this.color);
    }
    ctx.subir();
  };
  U.tipos.ToggleSwitch = ToggleSwitch;

  // ── TabControl ────────────────────────────────────────────────────────────
  // Una tira de solapas arriba y un solo hijo visible abajo. No dibuja el
  // contenido de las que no están elegidas: **no las mide siquiera**, así que
  // una solapa con una lista de mil filas no cuesta nada mientras esté cerrada.
  function TabItem(a) {
    U.Elemento.call(this, a);
    this.encabezado = a.Header || "";
  }
  heredar(TabItem, U.Elemento);
  TabItem.prototype.mapa = { Header: "encabezado" };

  TabItem.prototype.medirContenido = function (w, h) {
    let mw = 0, mh = 0;
    for (let i = 0; i < this.hijos.length; i++) {
      const d = this.hijos[i].medir(w, h);
      mw = Math.max(mw, d.w);
      mh = Math.max(mh, d.h);
    }
    return { w: mw, h: mh };
  };
  TabItem.prototype.acomodarContenido = function (x, y, w, h) {
    for (let i = 0; i < this.hijos.length; i++) this.hijos[i].acomodar(x, y, w, h);
  };
  U.tipos.TabItem = TabItem;

  function TabControl(a) {
    U.Interactivo.call(this, a);
    this.elegida = Math.max(0, Math.trunc(num(a.SelectedIndex, 0)));
    this.tam = num(a.FontSize, 0.03);
    this.acento = a.Accent || C.azul || "#0A84FF";
    this.fondoSolapa = a.TabBackground || C.superficieAlta || "#2A2A38";
    this.relleno = grosor(a.TabPadding || "0.018,0.01");
    this.hueco = num(a.TabSpacing, 0.006);
    this.alCambiar = a.SelectionChanged || null;
  }
  heredar(TabControl, U.Interactivo);
  TabControl.prototype.mapa = { SelectedIndex: "elegida" };

  TabControl.prototype.altoTira = function () {
    return this.tam * 1.30 + altoDe(this.relleno);
  };

  TabControl.prototype.medirContenido = function (w, h) {
    const tira = this.altoTira();
    let anchoTira = 0;
    for (let i = 0; i < this.hijos.length; i++) {
      anchoTira += medirTexto(this.hijos[i].encabezado, this.tam).w +
                   anchoDe(this.relleno) + this.hueco;
    }
    const activa = this.hijos[this.elegida];
    const d = activa ? activa.medir(w, Math.max(0, h - tira)) : { w: 0, h: 0 };
    return { w: Math.max(anchoTira, d.w), h: tira + d.h };
  };

  TabControl.prototype.acomodarContenido = function (x, y, w, h) {
    const tira = this.altoTira();
    for (let i = 0; i < this.hijos.length; i++) {
      // Las cerradas se acomodan en una caja vacía: no se dibujan y sus blancos
      // no existen. Es más simple que una lista aparte y no se puede olvidar.
      if (i === this.elegida) this.hijos[i].acomodar(x, y + tira, w, Math.max(0, h - tira));
      else this.hijos[i].acomodar(x, y + tira, 0, 0);
    }
  };

  TabControl.prototype.emitirContenido = function (ctx) {
    if (!this.visible || !this.opaco) return;
    const b = this.caja;
    const tira = this.altoTira();
    let px = b.x;
    const self = this;

    for (let i = 0; i < this.hijos.length; i++) {
      const t = this.hijos[i];
      const m = medirTexto(t.encabezado, this.tam);
      const w = m.w + anchoDe(this.relleno);
      const elegida = i === this.elegida;
      const idx = i;

      ctx.blanco(px, b.y, w, tira, this.fondoSolapa, function (app) {
        self.elegida = idx;
        self.marcarToque(app);
        const h = self.manejador(app, self.alCambiar);
        if (h) h(self, app);
        app.invalidar();
      // El dueño del blanco es **la solapa**, no el TabControl: si fuera el
      // control entero, pasar el puntero por una resaltaría las cinco.
      }, t);
      ctx.subir();
      const fondoSolapa = elegida ? this.acento
                        : t.encima ? U.tinte(this.fondoSolapa, 1.5)
                        : this.fondoSolapa;
      ctx.g.rectRedondeado(px, b.y, w, tira, 0.008, fondoSolapa);
      ctx.subir();
      ctx.texto(px + w / 2, b.y + tira / 2, t.encabezado, this.tam,
                elegida ? (C.fondo || "#08080C") : (C.textoTenue || "#A8A8BC"));
      ctx.subir();
      px += w + this.hueco;
    }

    const activa = this.hijos[this.elegida];
    if (activa) activa.emitir(ctx);
  };
  U.tipos.TabControl = TabControl;
})();
