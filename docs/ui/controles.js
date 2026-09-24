// controles.js — los elementos del framework.
//
// Cada uno implementa como mucho tres cosas:
//
//   medirContenido(dispW, dispH) → {w, h}   cuánto querría medir
//   acomodarContenido(x, y, w, h)           dónde van sus hijos
//   dibujar(ctx)                            qué emite
//
// El resto —márgenes, alineación, Width/Height, Min/Max— lo resuelve `Elemento`
// una sola vez para todos. Es la parte de WPF que más rinde copiar: los paneles
// terminan siendo diez líneas porque no repiten nada.
(function () {
  "use strict";

  const U = globalThis.UI;
  const heredar = U.heredar;
  const num = U.numero;
  const bool = U.booleano;
  const grosor = U.grosor;
  const anchoDe = U.anchoDe;
  const altoDe = U.altoDe;

  const C = (U.CFG && U.CFG.C) || {};

  // Shared native layout: measurement and glyph drawing consume the same result.
  const layouts = new Map();
  function medirTexto(texto, tam, ancho) {
    const text = String(texto === undefined || texto === null ? "" : texto);
    const key = JSON.stringify([text,tam,ancho || 0]);
    if (layouts.has(key)) return layouts.get(key);
    const result = globalThis.TextLayout
      ? TextLayout.create(text,tam,ancho || 0)
      : {w:text.length*tam*0.6,h:tam}; // Compatibility with older engine builds.
    if (layouts.size >= 256) layouts.delete(layouts.keys().next().value);
    layouts.set(key,result);
    return result;
  }
  U.medirTexto = medirTexto;

  // ── TextBlock ─────────────────────────────────────────────────────────────
  function TextBlock(a) {
    U.Elemento.call(this, a);
    this.texto = a.Text !== undefined ? a.Text : (a.__texto || "");
    this.tam = num(a.FontSize, 0.05);
    this.color = a.Foreground || C.texto || "#FFFFFF";
    this.alineacion = a.TextAlignment || "Left";
    this.wrap = a.TextWrapping === "Wrap";
  }
  heredar(TextBlock, U.Elemento);

  TextBlock.prototype.medirContenido = function (width) {
    this.textLayout=medirTexto(this.texto,this.tam,this.wrap && Number.isFinite(width) && width>0 ? width : 0);
    return this.textLayout;
  };

  TextBlock.prototype.dibujar = function (ctx) {
    if (this.texto === "" || this.texto === null) return;
    const b = this.caja;
    const m = this.textLayout || medirTexto(this.texto, this.tam);
    // El `<text>` del motor se centra en su punto, así que alinear a izquierda
    // es correr medio ancho estimado. De ahí que la estimación importe.
    let cx = b.x + b.w / 2;
    if (this.alineacion === "Left") cx = b.x + m.w / 2;
    else if (this.alineacion === "Right") cx = b.x + b.w - m.w / 2;
    ctx.texto(cx, b.y + b.h / 2, this.texto, this.tam, this.color,m);
  };
  /** Qué atributo de XAML escribe qué campo. Es lo único que un enlace necesita
   *  saber de un control. */
  TextBlock.prototype.mapa = {
    Text: "texto", FontSize: "tam", Foreground: "color",
    TextAlignment: "alineacion",
  };
  U.tipos.TextBlock = TextBlock;

  // ── Border ────────────────────────────────────────────────────────────────
  // El decorador de WPF: un hijo, un fondo, un marco y un relleno interno.
  // Casi todos los controles con aspecto se arman con esto adentro.
  function Border(a) {
    U.Elemento.call(this, a);
    this.fondo = a.Background || null;
    this.brocha = a.BorderBrush || null;
    this.grosorBorde = grosor(a.BorderThickness);
    this.radio = num(a.CornerRadius, 0);
    this.relleno = grosor(a.Padding);
  }
  heredar(Border, U.Elemento);

  Border.prototype.interior = function () {
    const g = this.grosorBorde, p = this.relleno;
    return {
      i: g.i + p.i, d: g.d + p.d, s: g.s + p.s, f: g.f + p.f,
    };
  };

  Border.prototype.medirContenido = function (w, h) {
    const t = this.interior();
    const hw = anchoDe(t), hh = altoDe(t);
    let mw = 0, mh = 0;
    for (let i = 0; i < this.hijos.length; i++) {
      const d = this.hijos[i].medir(Math.max(0, w - hw), Math.max(0, h - hh));
      mw = Math.max(mw, d.w);
      mh = Math.max(mh, d.h);
    }
    return { w: mw + hw, h: mh + hh };
  };

  Border.prototype.acomodarContenido = function (x, y, w, h) {
    const t = this.interior();
    const ix = x + t.i, iy = y + t.d;
    const iw = Math.max(0, w - anchoDe(t)), ih = Math.max(0, h - altoDe(t));
    for (let i = 0; i < this.hijos.length; i++) this.hijos[i].acomodar(ix, iy, iw, ih);
  };

  Border.prototype.dibujar = function (ctx) {
    const b = this.caja;
    if (this.brocha && (this.grosorBorde.i || this.grosorBorde.d ||
                        this.grosorBorde.s || this.grosorBorde.f)) {
      if (this.radio > 0) ctx.g.rectRedondeado(b.x, b.y, b.w, b.h, this.radio, this.brocha);
      else ctx.g.marco(b.x, b.y, b.w, b.h, this.grosorBorde, this.brocha);
    }
    if (this.fondo) {
      const g = this.brocha ? this.grosorBorde : { i: 0, d: 0, s: 0, f: 0 };
      const x = b.x + g.i, y = b.y + g.d;
      const w = b.w - anchoDe(g), h = b.h - altoDe(g);
      ctx.subir();
      if (this.radio > 0) {
        ctx.g.rectRedondeado(x, y, w, h, Math.max(0, this.radio - g.i), this.fondo);
      } else {
        ctx.g.rect(x, y, w, h, this.fondo);
      }
    }
    ctx.subir();
  };
  Border.prototype.mapa = {
    Background: "fondo", BorderBrush: "brocha", CornerRadius: "radio",
  };
  U.tipos.Border = Border;

  // ── StackPanel ────────────────────────────────────────────────────────────
  function StackPanel(a) {
    U.Elemento.call(this, a);
    this.horizontal = (a.Orientation || "Vertical") === "Horizontal";
    this.espaciado = num(a.Spacing, 0);
    this.fondo = a.Background || null;
  }
  heredar(StackPanel, U.Elemento);

  StackPanel.prototype.medirContenido = function (w, h) {
    let a = 0, t = 0, n = 0;
    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      if (!c.visible) continue;
      // En el eje del apilado el espacio es infinito: eso es lo que hace que un
      // StackPanel no comprima a sus hijos, y es la diferencia con un Grid.
      const d = this.horizontal ? c.medir(Infinity, h) : c.medir(w, Infinity);
      if (this.horizontal) { t += d.w; a = Math.max(a, d.h); }
      else { t += d.h; a = Math.max(a, d.w); }
      n++;
    }
    if (n > 1) t += this.espaciado * (n - 1);
    return this.horizontal ? { w: t, h: a } : { w: a, h: t };
  };

  StackPanel.prototype.acomodarContenido = function (x, y, w, h) {
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

  StackPanel.prototype.dibujar = function (ctx) {
    if (this.fondo) {
      const b = this.caja;
      ctx.g.rect(b.x, b.y, b.w, b.h, this.fondo);
      ctx.subir();
    }
  };
  StackPanel.prototype.mapa = { Background: "fondo", Spacing: "espaciado" };
  U.tipos.StackPanel = StackPanel;

  // ── Grid ──────────────────────────────────────────────────────────────────
  // Filas y columnas con las tres formas de WPF:
  //   0.2   fijo, en metros
  //   Auto  lo que pida el contenido
  //   *     reparte lo que sobra;  2*  pesa el doble
  //
  // Se declara compacto —`ColumnDefinitions="Auto,*,0.2"`— en vez de con los
  // elementos anidados de XAML: es la misma información sin cuatro líneas de
  // ceremonia por columna.
  function leerDefiniciones(txt) {
    const out = [];
    const partes = String(txt || "*").split(/[,\s]+/).filter(function (s) { return s; });
    for (let i = 0; i < partes.length; i++) {
      const p = partes[i];
      if (p === "Auto" || p === "auto") out.push({ tipo: "auto", peso: 0, medida: 0 });
      else if (p.endsWith("*")) {
        const w = p.length === 1 ? 1 : Number(p.slice(0, -1));
        out.push({ tipo: "estrella", peso: isFinite(w) ? w : 1, medida: 0 });
      } else {
        const v = Number(p);
        out.push({ tipo: "fijo", peso: 0, medida: isFinite(v) ? v : 0 });
      }
    }
    return out;
  }

  function Grid(a) {
    U.Elemento.call(this, a);
    this.cols = leerDefiniciones(a.ColumnDefinitions || "*");
    this.filas = leerDefiniciones(a.RowDefinitions || "*");
    this.sepCol = num(a.ColumnSpacing, 0);
    this.sepFila = num(a.RowSpacing, 0);
    this.fondo = a.Background || null;
  }
  heredar(Grid, U.Elemento);

  function celdaDe(hijo) {
    return {
      f: Math.max(0, Math.trunc(num(hijo.attr["Grid.Row"], 0))),
      c: Math.max(0, Math.trunc(num(hijo.attr["Grid.Column"], 0))),
      df: Math.max(1, Math.trunc(num(hijo.attr["Grid.RowSpan"], 1))),
      dc: Math.max(1, Math.trunc(num(hijo.attr["Grid.ColumnSpan"], 1))),
    };
  }

  /** Reparto de una dimensión. Fijos primero, después Auto con lo que pidan sus
   *  hijos, y lo que sobra se divide entre las estrellas según su peso. Es
   *  exactamente el orden de WPF, y el orden importa: si las estrellas se
   *  resolvieran antes, los Auto no tendrían contra qué medirse. */
  function repartir(defs, total, sep, pedidos) {
    const n = defs.length;
    const tam = new Array(n);
    let usado = sep * Math.max(0, n - 1);
    let pesos = 0;

    for (let i = 0; i < n; i++) {
      const d = defs[i];
      if (d.tipo === "fijo") { tam[i] = d.medida; usado += tam[i]; }
      else if (d.tipo === "auto") { tam[i] = pedidos[i] || 0; usado += tam[i]; }
      else { tam[i] = 0; pesos += d.peso; }
    }
    const sobra = Math.max(0, total - usado);
    if (pesos > 0) {
      for (let i = 0; i < n; i++) {
        if (defs[i].tipo === "estrella") tam[i] = (sobra * defs[i].peso) / pesos;
      }
    }
    return tam;
  }

  Grid.prototype.medirContenido = function (w, h) {
    const pedidoCol = new Array(this.cols.length).fill(0);
    const pedidoFila = new Array(this.filas.length).fill(0);

    // Primera vuelta: sólo para saber cuánto piden los Auto. Los que ocupan más
    // de una celda no aportan —repartir su pedido entre celdas es ambiguo y WPF
    // tampoco lo hace de forma útil.
    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      if (!c.visible) continue;
      const p = celdaDe(c);
      const d = c.medir(Infinity, Infinity);
      if (p.dc === 1 && p.c < pedidoCol.length) {
        pedidoCol[p.c] = Math.max(pedidoCol[p.c], d.w);
      }
      if (p.df === 1 && p.f < pedidoFila.length) {
        pedidoFila[p.f] = Math.max(pedidoFila[p.f], d.h);
      }
    }

    // **Lo que la grilla pide no es lo que la grilla ocupa.**
    //
    // Una fila `*` ocupa lo que sobre, pero *pedir* todo lo disponible es otra
    // cosa: metida arriba de un DockPanel, una grilla con una fila `*` se comía
    // el panel entero y no quedaba lugar para nada más. Pasó, y se veía como si
    // el encabezado hubiera devorado la lista.
    //
    // Así que para el tamaño deseado, una `*` vale **lo que pide su contenido**,
    // igual que una Auto. El reparto de verdad —donde `*` se queda con el
    // sobrante— pasa en `acomodarContenido`, con el ancho definitivo.
    let tw = this.sepCol * Math.max(0, this.cols.length - 1);
    let th = this.sepFila * Math.max(0, this.filas.length - 1);
    for (let i = 0; i < this.cols.length; i++) {
      tw += this.cols[i].tipo === "fijo" ? this.cols[i].medida : (pedidoCol[i] || 0);
    }
    for (let i = 0; i < this.filas.length; i++) {
      th += this.filas[i].tipo === "fijo" ? this.filas[i].medida : (pedidoFila[i] || 0);
    }
    return { w: tw, h: th };
  };

  Grid.prototype.acomodarContenido = function (x, y, w, h) {
    // Rehacer el reparto con el tamaño definitivo: en `medir` el disponible pudo
    // ser Infinity —dentro de un StackPanel lo es— y las estrellas habrían
    // quedado en cero.
    const pedidoCol = new Array(this.cols.length).fill(0);
    const pedidoFila = new Array(this.filas.length).fill(0);
    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      if (!c.visible) continue;
      const p = celdaDe(c);
      if (p.dc === 1 && p.c < pedidoCol.length) {
        pedidoCol[p.c] = Math.max(pedidoCol[p.c], c.deseado.w);
      }
      if (p.df === 1 && p.f < pedidoFila.length) {
        pedidoFila[p.f] = Math.max(pedidoFila[p.f], c.deseado.h);
      }
    }
    const anchos = repartir(this.cols, w, this.sepCol, pedidoCol);
    const altos = repartir(this.filas, h, this.sepFila, pedidoFila);

    const xs = [], ys = [];
    let px = x;
    for (let i = 0; i < anchos.length; i++) { xs.push(px); px += anchos[i] + this.sepCol; }
    let py = y;
    for (let i = 0; i < altos.length; i++) { ys.push(py); py += altos[i] + this.sepFila; }

    this.anchoCols = anchos;
    this.altoFilas = altos;
    this.xs = xs;
    this.ys = ys;

    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      if (!c.visible) continue;
      const p = celdaDe(c);
      const ci = Math.min(p.c, anchos.length - 1);
      const fi = Math.min(p.f, altos.length - 1);
      let cw = 0, ch = 0;
      for (let k = 0; k < p.dc && ci + k < anchos.length; k++) {
        cw += anchos[ci + k] + (k > 0 ? this.sepCol : 0);
      }
      for (let k = 0; k < p.df && fi + k < altos.length; k++) {
        ch += altos[fi + k] + (k > 0 ? this.sepFila : 0);
      }
      c.acomodar(xs[ci] || x, ys[fi] || y, cw, ch);
    }
  };

  Grid.prototype.dibujar = function (ctx) {
    if (this.fondo) {
      const b = this.caja;
      ctx.g.rect(b.x, b.y, b.w, b.h, this.fondo);
      ctx.subir();
    }
  };
  Grid.prototype.mapa = { Background: "fondo" };
  U.tipos.Grid = Grid;

  // ── Canvas ────────────────────────────────────────────────────────────────
  function Canvas(a) {
    U.Elemento.call(this, a);
    this.fondo = a.Background || null;
  }
  heredar(Canvas, U.Elemento);

  Canvas.prototype.medirContenido = function () {
    for (let i = 0; i < this.hijos.length; i++) this.hijos[i].medir(Infinity, Infinity);
    return { w: 0, h: 0 };
  };

  Canvas.prototype.acomodarContenido = function (x, y) {
    for (let i = 0; i < this.hijos.length; i++) {
      const c = this.hijos[i];
      c.acomodar(x + num(c.attr["Canvas.Left"], 0), y + num(c.attr["Canvas.Top"], 0),
                 c.deseado.w, c.deseado.h);
    }
  };

  Canvas.prototype.dibujar = function (ctx) {
    if (this.fondo) {
      const b = this.caja;
      ctx.g.rect(b.x, b.y, b.w, b.h, this.fondo);
      ctx.subir();
    }
  };
  U.tipos.Canvas = Canvas;

  U.leerDefiniciones = leerDefiniciones;
  U.repartir = repartir;
  U.celdaDe = celdaDe;
  function RenderPanel(a){Border.call(this,a);this.renderPanel=true;}
  heredar(RenderPanel,Border);U.tipos.RenderPanel=RenderPanel;

  function readPath(data){
    if(typeof data!=="string"||data.length>16384)throw new TypeError("Path Data exceeds 16 KiB");
    const re=/[MLQCZmlqcz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g;
    const tokens=[];let end=0,m;
    while((m=re.exec(data))){if(!/^[\s,]*$/.test(data.slice(end,m.index)))throw Error("Path supports M L Q C Z commands");tokens.push(m[0]);end=re.lastIndex;}
    if(!/^[\s,]*$/.test(data.slice(end)))throw Error("Invalid Path Data");
    const out=[];let i=0,command=null,x=0,y=0,startX=0,startY=0;
    while(i<tokens.length){
      if(/^[a-z]$/i.test(tokens[i]))command=tokens[i++];
      if(!command)throw Error("Path requires a command");
      const upper=command.toUpperCase(),relative=command!==upper,count={M:2,L:2,Q:4,C:6,Z:0}[upper];
      if(upper==="Z"){out.push({op:"close"});x=startX;y=startY;command=null;}
      else {
        const n=tokens.slice(i,i+count).map(Number);if(n.length!==count||n.some(v=>!Number.isFinite(v)))throw Error("Incomplete Path command");i+=count;
        if(relative)for(let j=0;j<n.length;j+=2){n[j]+=x;n[j+1]+=y;}
        x=n[n.length-2];y=n[n.length-1];
        if(upper==="M"){out.push({op:"moveTo",x,y});startX=x;startY=y;command=relative?"l":"L";}
        else if(upper==="L")out.push({op:"lineTo",x,y});
        else if(upper==="Q")out.push({op:"quadraticTo",cx:n[0],cy:n[1],x,y});
        else out.push({op:"bezierTo",c1x:n[0],c1y:n[1],c2x:n[2],c2y:n[3],x,y});
      }
      if(out.length>128)throw Error("Path exceeds 128 commands");
    }
    return out;
  }
  function Path(a){
    U.Elemento.call(this,a);this.data=a.Data||"";this.fill=a.Fill||null;this.stroke=a.Stroke||null;
    this.strokeWidth=num(a.StrokeThickness,0.002);this.tolerance=num(a.Tolerance,0.00005);
    this.nonZero=a.FillRule==="NonZero";this.stretch=a.Stretch||"Uniform";
  }
  heredar(Path,U.Elemento);
  Path.prototype.commands=function(){return readPath(this.data);};
  Path.prototype.prepare=function(){
    if(!globalThis.PathGeometry)throw Error("Path/Ellipse require a Luna build with PathGeometry");
    const commands=this.commands(),key=JSON.stringify([commands,this.strokeWidth,this.tolerance,this.nonZero,!!this.fill,!!this.stroke]);
    if(key===this._pathKey)return;
    this._fill=this.fill?PathGeometry.tessellate(commands,{tolerance:this.tolerance,nonZero:this.nonZero}):null;
    this._stroke=this.stroke&&this.strokeWidth>0?PathGeometry.tessellate(commands,{tolerance:this.tolerance,strokeWidth:this.strokeWidth}):null;
    const points=[...(this._fill?this._fill.positions:[]),...(this._stroke?this._stroke.positions:[])];
    let x=Infinity,y=Infinity,x1=-Infinity,y1=-Infinity;
    for(const p of points){x=Math.min(x,p[0]);y=Math.min(y,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);}
    this._bounds=points.length?{x,y,w:x1-x,h:y1-y}:{x:0,y:0,w:0,h:0};
    this._pathKey=key;
  };
  Path.prototype.medirContenido=function(){this.prepare();return this._bounds;};
  Path.prototype.dibujar=function(ctx){
    this.prepare();const b=this.caja,n=this._bounds;if(!(n.w>0&&n.h>0))return;
    let sx=this.stretch==="None"?1:b.w/n.w,sy=this.stretch==="None"?1:b.h/n.h;
    if(this.stretch==="Uniform")sx=sy=Math.min(sx,sy);
    const x=b.x+(b.w-n.w*sx)/2,y=b.y+(b.h-n.h*sy)/2;
    for(const [geometry,color] of [[this._fill,this.fill],[this._stroke,this.stroke]])if(geometry){
      const transformed={indices:geometry.indices,positions:geometry.positions.map(p=>[(p[0]-n.x)*sx,(p[1]-n.y)*sy])};
      ctx.g.path(transformed,x,y,color);ctx.subir();
    }
  };
  Path.prototype.mapa={Data:"data",Fill:"fill",Stroke:"stroke",StrokeThickness:"strokeWidth"};
  function Ellipse(a){Path.call(this,a);}
  heredar(Ellipse,Path);
  Ellipse.prototype.commands=function(){
    const w=Number.isFinite(this.anchoPedido)?this.anchoPedido:0.1,h=Number.isFinite(this.altoPedido)?this.altoPedido:0.1;
    const x=w/2,y=h/2,k=0.5522847498307936;
    return [{op:"moveTo",x:w,y},
      {op:"bezierTo",c1x:w,c1y:y+y*k,c2x:x+x*k,c2y:h,x,y:h},
      {op:"bezierTo",c1x:x-x*k,c1y:h,c2x:0,c2y:y+y*k,x:0,y},
      {op:"bezierTo",c1x:0,c1y:y-y*k,c2x:x-x*k,c2y:0,x,y:0},
      {op:"bezierTo",c1x:x+x*k,c1y:0,c2x:w,c2y:y-y*k,x:w,y},{op:"close"}];
  };
  U.tipos.Path=Path;U.tipos.Ellipse=Ellipse;U.readPath=readPath;
})();
