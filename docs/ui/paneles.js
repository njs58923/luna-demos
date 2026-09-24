// paneles.js — los contenedores que faltaban, y las listas.
//
// WrapPanel y DockPanel son dos formas más de repartir espacio; ItemsControl y
// ScrollViewer son otra cosa: son los que hacen que una interfaz pueda mostrar
// **datos** y no sólo controles.
(function () {
  "use strict";

  const U = globalThis.UI;
  const heredar = U.heredar;
  const num = U.numero;
  const grosor = U.grosor;
  const anchoDe = U.anchoDe;
  const altoDe = U.altoDe;
  const C = (U.CFG && U.CFG.C) || {};

  // ── WrapPanel ─────────────────────────────────────────────────────────────
  // Apila en una dirección y salta de renglón cuando no entra. La diferencia
  // con StackPanel es una sola línea de lógica y un mundo de uso: es el panel de
  // las etiquetas, los chips y las galerías.
  function WrapPanel(a) {
    U.Elemento.call(this, a);
    this.horizontal = (a.Orientation || "Horizontal") === "Horizontal";
    this.sepX = num(a.ColumnSpacing, num(a.Spacing, 0));
    this.sepY = num(a.RowSpacing, num(a.Spacing, 0));
    this.fondo = a.Background || null;
  }
  heredar(WrapPanel, U.Elemento);

  /** El acomodo se calcula igual al medir y al acomodar; la única diferencia es
   *  si se escribe el resultado. Tenerlo una vez evita que las dos versiones se
   *  separen con el tiempo, que es como se rompen los paneles. */
  WrapPanel.prototype.repartir = function (w, h, escribir, x0, y0) {
    let px = 0, py = 0, altoLinea = 0, maxAncho = 0;
    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      if (!c.visible) continue;
      const d = escribir ? c.deseado : c.medir(w, h);
      if (px > 0 && px + d.w > w) {
        px = 0;
        py += altoLinea + this.sepY;
        altoLinea = 0;
      }
      if (escribir) c.acomodar(x0 + px, y0 + py, d.w, d.h);
      px += d.w + this.sepX;
      altoLinea = Math.max(altoLinea, d.h);
      maxAncho = Math.max(maxAncho, px - this.sepX);
    }
    return { w: maxAncho, h: py + altoLinea };
  };

  WrapPanel.prototype.medirContenido = function (w, h) {
    return this.repartir(isFinite(w) ? w : 1e6, h, false, 0, 0);
  };

  WrapPanel.prototype.acomodarContenido = function (x, y, w, h) {
    this.repartir(w, h, true, x, y);
  };

  WrapPanel.prototype.dibujar = function (ctx) {
    if (this.fondo) {
      const b = this.caja;
      ctx.g.rect(b.x, b.y, b.w, b.h, this.fondo);
      ctx.subir();
    }
  };
  WrapPanel.prototype.mapa = { Background: "fondo" };
  U.tipos.WrapPanel = WrapPanel;

  // ── DockPanel ─────────────────────────────────────────────────────────────
  // Cada hijo se pega a un borde y se queda con una franja entera; el último
  // llena lo que sobra. Es el panel de las ventanas: barra arriba, estado abajo,
  // contenido en el medio.
  function DockPanel(a) {
    U.Elemento.call(this, a);
    this.ultimoLlena = a.LastChildFill !== "false";
    this.fondo = a.Background || null;
  }
  heredar(DockPanel, U.Elemento);

  DockPanel.prototype.medirContenido = function (w, h) {
    let usadoW = 0, usadoH = 0;
    const vis = this.hijos.filter(function (c) { return c.visible; });
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i];
      const ultimo = this.ultimoLlena && i === vis.length - 1;
      const d = c.medir(Math.max(0, w - usadoW), Math.max(0, h - usadoH));
      if (ultimo) { usadoW += d.w; usadoH += d.h; continue; }
      const lado = c.attr["DockPanel.Dock"] || "Top";
      if (lado === "Left" || lado === "Right") usadoW += d.w;
      else usadoH += d.h;
    }
    return { w: usadoW, h: usadoH };
  };

  DockPanel.prototype.acomodarContenido = function (x, y, w, h) {
    let ix = x, iy = y, iw = w, ih = h;
    const vis = this.hijos.filter(function (c) { return c.visible; });
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i];
      if (this.ultimoLlena && i === vis.length - 1) {
        c.acomodar(ix, iy, iw, ih);
        return;
      }
      const lado = c.attr["DockPanel.Dock"] || "Top";
      const d = c.deseado;
      if (lado === "Left") {
        c.acomodar(ix, iy, Math.min(d.w, iw), ih);
        ix += Math.min(d.w, iw); iw -= Math.min(d.w, iw);
      } else if (lado === "Right") {
        c.acomodar(ix + iw - Math.min(d.w, iw), iy, Math.min(d.w, iw), ih);
        iw -= Math.min(d.w, iw);
      } else if (lado === "Bottom") {
        c.acomodar(ix, iy + ih - Math.min(d.h, ih), iw, Math.min(d.h, ih));
        ih -= Math.min(d.h, ih);
      } else {
        c.acomodar(ix, iy, iw, Math.min(d.h, ih));
        iy += Math.min(d.h, ih); ih -= Math.min(d.h, ih);
      }
    }
  };

  DockPanel.prototype.dibujar = function (ctx) {
    if (this.fondo) {
      const b = this.caja;
      ctx.g.rect(b.x, b.y, b.w, b.h, this.fondo);
      ctx.subir();
    }
  };
  DockPanel.prototype.mapa = { Background: "fondo" };
  U.tipos.DockPanel = DockPanel;

  // ── Separator ─────────────────────────────────────────────────────────────
  function Separator(a) {
    U.Elemento.call(this, a);
    this.color = a.Background || C.borde || "#5A5A70";
    this.gruesoLinea = num(a.Thickness, 0.002);
  }
  heredar(Separator, U.Elemento);
  Separator.prototype.medirContenido = function () {
    return { w: 0, h: this.gruesoLinea };
  };
  Separator.prototype.dibujar = function (ctx) {
    const b = this.caja;
    ctx.g.rect(b.x, b.y + (b.h - this.gruesoLinea) / 2, b.w, this.gruesoLinea, this.color);
    ctx.subir();
  };
  U.tipos.Separator = Separator;

  // ── ItemsControl ──────────────────────────────────────────────────────────
  // Una lista: un arreglo de datos y una plantilla que se repite.
  //
  //   <ItemsControl ItemsSource="{Binding filas}" ItemTemplate="fila"/>
  //   app.plantillas.fila = "<Border>...<TextBlock Text='{Binding nombre}'/></Border>";
  //
  // Cada copia de la plantilla recibe **su** elemento del arreglo como contexto
  // de datos, así que adentro los enlaces hablan del item y no del modelo
  // entero. Es lo mismo que hace WPF y es lo que evita tener que numerar los
  // enlaces a mano.
  //
  // Las copias se **reciclan**: al cambiar el arreglo se ajusta la cantidad, no
  // se rehacen. Un árbol nuevo por cuadro sería gratis de dibujar pero perdería
  // el estado de los controles de cada fila.
  function ItemsControl(a) {
    U.Elemento.call(this, a);
    this.plantilla = a.ItemTemplate || null;
    this.fuente = null;
    this.espaciado = num(a.Spacing, 0);
    this.horizontal = (a.Orientation || "Vertical") === "Horizontal";
    /** El `ItemsPanelTemplate` de WPF, en su versión chica: con qué panel se
     *  acomodan las copias. Apilar y envolver son los dos casos que se usan; el
     *  resto se consigue metiendo la lista adentro del panel que uno quiera. */
    this.envolver = (a.ItemsPanel || "") === "Wrap";
    /** Virtualización: medir, acomodar y enlazar **sólo lo que se ve**.
     *
     *  Está medido por qué hace falta. Con 200 filas una pasada completa costaba
     *  3,3 ms; con 800, 12,5 — exactamente cuatro veces, o sea lineal en las
     *  filas **totales** y no en las visibles, aunque en pantalla entren trece.
     *  Se pagaba medir, acomodar y resolver enlaces de setecientas ochenta y
     *  siete filas que nadie iba a mirar.
     *
     *  Supone que **todas las filas miden igual**, que es cierto cuando salen de
     *  la misma plantilla y es lo que permite saber dónde está la número 700 sin
     *  haber tocado las 699 anteriores. Con filas de alto variable habría que
     *  medirlas todas y no habría nada que ganar. */
    this.virtualizar = (a.Virtualize || "true") !== "false";
    this.ventana = null;
    this.altoFila = 0;
    this.desde = 0;
    this.hasta = 0;
  }
  heredar(ItemsControl, U.Elemento);
  ItemsControl.prototype.mapa = { ItemsSource: "fuente" };

  ItemsControl.prototype.aplicarEnlaces = function (datos, app) {
    this.app = app;
    // Primero resolver la propia fuente...
    if (this.enlaces) {
      for (let i = 0; i < this.enlaces.length; i++) {
        const en = this.enlaces[i];
        const campo = this.mapa[en.prop];
        if (campo) {
          const v = U.leerRuta(datos, en.e.ruta);
          if (v !== undefined) this[campo] = v;
        }
      }
    }
    // ...después ajustar la cantidad de copias...
    const lista = this.fuente && this.fuente.length ? this.fuente : [];
    const marcado = this.app && this.app.plantillas
      ? this.app.plantillas[this.plantilla] : null;
    this.marcadoFila = marcado;
    if (marcado && !this.virtualizar) {
      while (this.hijos.length < lista.length) {
        const h = U.inflar(U.leerMarcado(marcado), app ? app.estilos : null);
        if (!h) break;
        this.agregar(h);
      }
      while (this.hijos.length > lista.length) this.hijos.pop();
    }
    this.lista = lista;
    this.datosPadre = datos;

    // ...y recién entonces bajar, cada uno con su propio contexto.
    //
    // Cuando virtualiza, esto **no** pasa acá: enlazar setecientas filas para
    // mostrar trece es justamente el costo que se quiere evitar. Se enlaza en
    // `medirContenido`, que corre después de que el ScrollViewer dijo qué franja
    // se ve, y sólo para esa franja.
    if (this.virtualizar) return;
    for (let i = 0; i < this.hijos.length; i++) {
      const item = lista[i] !== undefined ? lista[i] : datos;
      // Cada copia se queda con **su** dato. Los enlaces ya lo usan y lo tiran;
      // guardarlo es lo que permite que un control adentro de la plantilla sepa
      // de qué fila es cuando lo tocan. Sin esto, un manejador recibe el botón y
      // no tiene forma de saber a qué elemento del arreglo corresponde.
      this.hijos[i].datosItem = item;
      this.hijos[i].aplicarEnlaces(item, app);
    }
  };

  /** Asegurar que haya `n` contenedores en la pileta.
   *
   *  Virtualizando, `hijos` deja de ser "una copia por dato" y pasa a ser **una
   *  pileta del tamaño de la ventana**: quince contenedores alcanzan para una
   *  lista de cuatro mil. El contenedor `k` muestra el dato `desde + k`, y al
   *  desplazarse los mismos quince cambian de dato.
   *
   *  Reciclar así es correcto **porque todo el estado de una fila viene de sus
   *  enlaces**. Si una fila guardara algo por su cuenta —una casilla marcada que
   *  no está en los datos— al desplazarse aparecería en la fila equivocada. Es
   *  la misma trampa que tiene el reciclado de contenedores en WPF, y la regla
   *  es la misma: en una plantilla de fila, el estado va en el dato.
   */
  ItemsControl.prototype.asegurarPileta = function (n, app) {
    if (!this.marcadoFila) return;
    while (this.hijos.length < n) {
      const h = U.inflar(U.leerMarcado(this.marcadoFila), app ? app.estilos : null);
      if (!h) break;
      this.agregar(h);
    }
  };

  /** Qué índices caen dentro de la ventana que puso el padre, con dos filas de
   *  colchón a cada lado para que un desplazamiento chico no deje un hueco. */
  ItemsControl.prototype.rango = function () {
    const n = this.lista ? this.lista.length : 0;
    const paso = this.altoFila + this.espaciado;
    if (!this.ventana || !(paso > 0)) return { desde: 0, hasta: n };
    const desde = Math.max(0, Math.floor(this.ventana.y0 / paso) - 2);
    const hasta = Math.min(n, Math.ceil(this.ventana.y1 / paso) + 2);
    return { desde: desde, hasta: Math.max(desde, hasta) };
  };

  /** Cuando envuelve, se delega en la misma cuenta que usa WrapPanel: tener dos
   *  copias del algoritmo es tener dos algoritmos que se separan. */
  ItemsControl.prototype.repartir = WrapPanel.prototype.repartir;

  ItemsControl.prototype.medirContenido = function (w, h) {
    if (this.virtualizar && !this.envolver && !this.horizontal) {
      const n = this.lista ? this.lista.length : 0;
      if (!n) { this.desde = this.hasta = 0; return { w: 0, h: 0 }; }

      // Una fila de muestra para saber cuánto mide una. Es la única que se mide
      // sin estar en la ventana, y sin ella no habría con qué calcular dónde
      // empieza la número 700.
      this.asegurarPileta(1, this.app);
      if (!this.hijos.length) { this.desde = this.hasta = 0; return { w: 0, h: 0 }; }
      this.hijos[0].datosItem = this.lista[0];
      this.hijos[0].aplicarEnlaces(this.lista[0], this.app);
      this.altoFila = this.hijos[0].medir(w, Infinity).h;

      const r = this.rango();
      this.desde = r.desde;
      this.hasta = r.hasta;
      this.asegurarPileta(r.hasta - r.desde, this.app);
      for (let k = 0; k + r.desde < r.hasta; k++) {
        const c = this.hijos[k];
        if (!c) break;
        // Reciclando, el contenedor `k` cambia de dato al desplazar: el dato se
        // reasigna en cada pasada, nunca se hereda del que estaba antes.
        c.datosItem = this.lista[r.desde + k];
        c.aplicarEnlaces(this.lista[r.desde + k], this.app);
        c.medir(w, Infinity);
      }
      const paso = this.altoFila + this.espaciado;
      return { w: w, h: Math.max(0, n * paso - this.espaciado) };
    }
    if (this.envolver) {
      this.sepX = this.espaciado;
      this.sepY = this.espaciado;
      return this.repartir(isFinite(w) ? w : 1e6, h, false, 0, 0);
    }
    let a = 0, t = 0, n = 0;
    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      if (!c.visible) continue;
      const d = this.horizontal ? c.medir(Infinity, h) : c.medir(w, Infinity);
      if (this.horizontal) { t += d.w; a = Math.max(a, d.h); }
      else { t += d.h; a = Math.max(a, d.w); }
      n++;
    }
    if (n > 1) t += this.espaciado * (n - 1);
    return this.horizontal ? { w: t, h: a } : { w: a, h: t };
  };

  ItemsControl.prototype.acomodarContenido = function (x, y, w, h) {
    if (this.virtualizar && !this.envolver && !this.horizontal) {
      const paso = this.altoFila + this.espaciado;
      for (let k = 0; k + this.desde < this.hasta; k++) {
        const c = this.hijos[k];
        if (!c) break;
        c.acomodar(x, y + (this.desde + k) * paso, w, this.altoFila);
      }
      return;
    }
    if (this.envolver) return void this.repartir(w, h, true, x, y);
    let p = this.horizontal ? x : y;
    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      if (!c.visible) continue;
      if (this.horizontal) {
        c.acomodar(p, y, c.deseado.w, h);
        p += c.deseado.w + this.espaciado;
      } else {
        c.acomodar(x, p, w, c.deseado.h);
        p += c.deseado.h + this.espaciado;
      }
    }
  };
  ItemsControl.prototype.emitirContenido = function (ctx) {
    if (!this.visible || !this.opaco) return;
    this.dibujar(ctx);
    if (this.virtualizar && !this.envolver && !this.horizontal) {
      for (let k = 0; k + this.desde < this.hasta; k++) {
        if (!this.hijos[k]) break;
        this.hijos[k].emitir(ctx);
      }
      return;
    }
    for (let i = 0; i < this.hijos.length; i++) this.hijos[i].emitir(ctx);
  };
  U.tipos.ItemsControl = ItemsControl;

  // ── ScrollViewer ──────────────────────────────────────────────────────────
  // Un hijo más alto que su caja, y una barra para moverlo.
  //
  // Sin tijera de GPU, el recorte lo hace la geometría: `ctx.recortar()` mete un
  // rectángulo en la pila y todo lo que se emita adentro se intersecta contra
  // él. Lo que queda afuera no se dibuja **ni se puede tocar**, que es la mitad
  // que se olvida y deja botones invisibles activos.
  //
  // No hay arrastre —el motor manda toques sueltos, no gestos— así que se mueve
  // tocando la barra, como en un scrollbar clásico.
  function ScrollViewer(a) {
    U.Elemento.call(this, a);
    this.desplazamiento = num(a.Offset, 0);
    this.anchoBarra = num(a.ScrollBarWidth, 0.022);
    this.fondoBarra = a.ScrollBarBackground || C.superficieAlta || "#2A2A38";
    this.perilla = a.ScrollBarBrush || C.borde || "#5A5A70";
    this.altoContenido = 0;
  }
  heredar(ScrollViewer, U.Elemento);

  ScrollViewer.prototype.medirContenido = function (w, h) {
    const wc = Math.max(0, w - this.anchoBarra);
    let alto = 0;
    for (let i = 0; i < this.hijos.length; i++) {
      // Decirle al hijo qué franja se va a ver, **antes** de que se mida. Es lo
      // que hace posible que una lista virtualizada sepa qué filas tocar; sin
      // esto tendría que medirlas todas para recién después descubrir cuáles
      // estaban a la vista.
      this.hijos[i].ventana = {
        y0: this.desplazamiento,
        y1: this.desplazamiento + (isFinite(h) ? h : 1e6),
      };
      // Altura infinita: el hijo mide lo que necesita, y de esa diferencia con
      // la caja sale cuánto hay para desplazar.
      const d = this.hijos[i].medir(wc, Infinity);
      alto = Math.max(alto, d.h);
    }
    this.altoContenido = alto;
    return { w: w, h: isFinite(h) ? h : alto };
  };

  ScrollViewer.prototype.acomodarContenido = function (x, y, w, h) {
    const wc = Math.max(0, w - this.anchoBarra);
    this.sobra = Math.max(0, this.altoContenido - h);
    this.desplazamiento = Math.max(0, Math.min(this.sobra, this.desplazamiento));
    for (let i = 0; i < this.hijos.length; i++) {
      this.hijos[i].acomodar(x, y - this.desplazamiento, wc,
                             Math.max(h, this.altoContenido));
    }
  };

  ScrollViewer.prototype.emitirContenido = function (ctx) {
    if (!this.visible || !this.opaco) return;
    const b = this.caja;
    ctx.recortar(b.x, b.y, Math.max(0, b.w - this.anchoBarra), b.h);
    for (let i = 0; i < this.hijos.length; i++) this.hijos[i].emitir(ctx);
    ctx.restaurar();
    this.dibujarBarra(ctx);
  };

  ScrollViewer.prototype.dibujarBarra = function (ctx) {
    const b = this.caja;
    if (!(this.sobra > 0)) return;
    const bx = b.x + b.w - this.anchoBarra;
    const self = this;

    ctx.blanco(bx, b.y, this.anchoBarra, b.h, this.fondoBarra, function (app, hoja) {
      if (!hoja) return;
      // El toque manda la perilla a donde se tocó, con la perilla centrada. Es
      // lo que hace un scrollbar cuando le tocás la pista.
      const t = (hoja.y - b.y) / Math.max(0.001, b.h);
      self.desplazamiento = Math.max(0, Math.min(1, t)) * self.sobra;
      app.invalidar();
    });
    ctx.subir();

    ctx.g.rectRedondeado(bx + 0.003, b.y, this.anchoBarra - 0.006, b.h,
                         (this.anchoBarra - 0.006) / 2, this.fondoBarra);
    ctx.subir();

    const visible = b.h / Math.max(0.001, this.altoContenido);
    const altoPerilla = Math.max(0.05, b.h * visible);
    const t = this.sobra > 0 ? this.desplazamiento / this.sobra : 0;
    ctx.g.rectRedondeado(bx + 0.003, b.y + t * (b.h - altoPerilla),
                         this.anchoBarra - 0.006, altoPerilla,
                         (this.anchoBarra - 0.006) / 2, this.perilla);
    ctx.subir();
  };
  ScrollViewer.prototype.mapa = { Offset: "desplazamiento" };
  U.tipos.ScrollViewer = ScrollViewer;
})();
