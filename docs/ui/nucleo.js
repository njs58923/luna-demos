// ui.js — un framework de interfaces declarativo, al estilo WPF, sobre malla.
//
// ┌───────────────────────────────────────────────────────────────────────────
// │ La apuesta
// └───────────────────────────────────────────────────────────────────────────
//
// WPF acomoda su árbol en **dos pasadas**: `Measure`, donde cada elemento dice
// cuánto querría medir dado el espacio disponible, y `Arrange`, donde el padre
// le asigna un rectángulo definitivo. Todo lo demás —paneles, alineaciones,
// márgenes, `Auto` y `*`— sale de esas dos.
//
// Ese modelo se puede traer entero a este motor, y la razón está medida:
// **rearmar una malla de 2000 rectángulos cuesta ~135 fps y una de 8000, ~74**
// (ver public/banco.js). O sea que el árbol visual se puede volcar de cero en
// cada pasada de layout. Sin diffing, sin árbol de nodos que mantener
// sincronizado: se mide, se acomoda, se emite. Inmediato.
//
// ┌───────────────────────────────────────────────────────────────────────────
// │ Las tres poblaciones
// └───────────────────────────────────────────────────────────────────────────
//
// No todo puede ser malla, y el reparto es forzado por el motor:
//
//   1. **Lo que se dibuja** → una malla. Fondos, bordes, rellenos, indicadores.
//      Un solo nodo, se rearma completo.
//   2. **El texto** → nodos `<text>`. No hay tipografía en malla. Se agrupan en
//      una pileta y se reciclan; nunca se crean dos veces.
//   3. **Lo que se toca** → nodos `<plane touchable>`. Una malla es UN nodo y
//      por lo tanto UN blanco: cada control interactivo necesita el suyo. Misma
//      pileta, mismo reciclado.
//
// ┌───────────────────────────────────────────────────────────────────────────
// │ El sistema de coordenadas
// └───────────────────────────────────────────────────────────────────────────
//
// Adentro se trabaja **como WPF**: origen arriba a la izquierda, `x` a la
// derecha, `y` hacia abajo, en metros. El motor es Y-arriba, así que hay una
// sola inversión y está en `emitir()`. Mezclar las dos convenciones en el código
// de layout es lo que vuelve ilegible cualquier port de WPF, y acá el precio de
// mantenerlas separadas es una resta.
//
// ┌───────────────────────────────────────────────────────────────────────────
// │ Sobre las curvas
// └───────────────────────────────────────────────────────────────────────────
//
// Hoy una esquina redondeada se teselan a mano en `Geometria`. Si la malla llega
// a soportar curvas, **lo único que cambia es ese objeto**: nadie más habla de
// triángulos. Los controles piden "un rectángulo con radio 2 cm" y no saben cómo
// se cumple.
(function () {
  "use strict";

  const CFG = globalThis.UI_CFG || {};
  const root = hiperspace.dimention;

  // ──────────────────────────────────────────────────────────────────────────
  // Utilidades
  // ──────────────────────────────────────────────────────────────────────────

  /** Un canal de sRGB a lineal.
   *
   *  Hace falta y no es cosmético. Los colores por vértice de una malla se
   *  entregan **en lineal**: con `material-unlit` prendido, pasar el 0,11 de un
   *  #1C1C26 tal cual da un gris claro en pantalla, porque el pipeline lo
   *  convierte a sRGB al escribir y lo sube a 0,37. Un panel casi negro salía
   *  color lavanda.
   *
   *  Con el material iluminado el error se disimulaba —la luz ambiente lo
   *  bajaba de vuelta, por casualidad— y por eso la primera versión parecía
   *  «apagada pero correcta». Estaba mal en los dos casos. */
  function aLineal(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function rgba(hex, alfa) {
    let s=String(hex||"#000000");
    if(s.toLowerCase()==="transparent")return [0,0,0,0];
    s=s.replace(/^#/,"");
    if(s.length===3||s.length===4)s=[...s].map(c=>c+c).join("");
    if(!/^(?:[a-f0-9]{6}|[a-f0-9]{8})$/i.test(s))return [0,0,0,1];
    const c=[0,2,4].map(i=>aLineal(parseInt(s.slice(i,i+2),16)/255));
    return [...c,(s.length===8?parseInt(s.slice(6,8),16)/255:1)*(alfa===undefined?1:alfa)];
  }

  /** Aclarar u oscurecer un color. Los estados —hover, presionado, deshabilitado—
   *  salen de acá y no de más propiedades: pedirle a cada control tres colores
   *  es pedirle al que escribe la interfaz que sea diseñador. */
  function aSRGB(c) {
    return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  }

  function tinte(hex, k) {
    const c = rgba(hex);
    const f = function (x) {
      const y = Math.max(0, Math.min(255, Math.round(aSRGB(x) * 255 * k)));
      const s = y.toString(16);
      return s.length < 2 ? "0" + s : s;
    };
    return "#" + f(c[0]) + f(c[1]) + f(c[2]) + (c[3]<1?Math.round(c[3]*255).toString(16).padStart(2,"0"):"");
  }

  const NADA = Object.freeze({ i: 0, d: 0, s: 0, f: 0 });

  /** Un `Thickness`: uno, dos o cuatro números.
   *    "0.02"              → todos
   *    "0.02,0.01"         → horizontal, vertical
   *    "0.02,0.01,0,0.03"  → izq, arriba, der, abajo   (orden de WPF) */
  function grosor(v) {
    if (v === undefined || v === null || v === "") return NADA;
    if (typeof v === "number") return { i: v, d: v, s: v, f: v };
    const n = String(v).split(/[,\s]+/).filter(function (x) { return x !== ""; })
      .map(Number);
    if (n.some(function (x) { return !isFinite(x); })) return NADA;
    if (n.length === 1) return { i: n[0], d: n[0], s: n[0], f: n[0] };
    if (n.length === 2) return { i: n[0], s: n[0], d: n[1], f: n[1] };
    return { i: n[0], d: n[1], s: n[2], f: n[3] };
  }
  const anchoDe = function (g) { return g.i + g.s; };
  const altoDe = function (g) { return g.d + g.f; };

  function numero(v, def) {
    if (v === undefined || v === null || v === "") return def;
    if (v === "Auto" || v === "auto" || v === "NaN") return NaN;
    const n = Number(v);
    return isFinite(n) ? n : def;
  }

  function booleano(v, def) {
    if (v === undefined || v === null || v === "") return def;
    return v === true || v === "true" || v === "True" || v === "1";
  }

  // ──────────────────────────────────────────────────────────────────────────
  // El lector de marcado
  // ──────────────────────────────────────────────────────────────────────────
  // Un XML mínimo: elementos, atributos con comillas, cierre propio, comentarios
  // y texto suelto (que se toma como `Content`). No hay namespaces, entidades más
  // allá de las cinco básicas, ni CDATA. Es a propósito: lo que no está no se
  // puede usar mal, y un parser completo acá sería una tarde entera para
  // sostener características que la interfaz no necesita.
  const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

  function desescapar(s) {
    return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, function (todo, e) {
      if (e[0] === "#") {
        const n = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return isFinite(n) ? String.fromCharCode(n) : todo;
      }
      return ENTIDADES[e] !== undefined ? ENTIDADES[e] : todo;
    });
  }

  function leerMarcado(texto) {
    let i = 0;
    const raiz = { hijos: [] };
    const pila = [raiz];

    function tope() { return pila[pila.length - 1]; }

    while (i < texto.length) {
      const menor = texto.indexOf("<", i);
      if (menor < 0) break;

      const suelto = texto.slice(i, menor).trim();
      if (suelto && tope().atributos) {
        tope().texto = (tope().texto || "") + desescapar(suelto);
      }

      if (texto.startsWith("<!--", menor)) {
        i = texto.indexOf("-->", menor);
        i = i < 0 ? texto.length : i + 3;
        continue;
      }
      if (texto.startsWith("<?", menor)) {
        i = texto.indexOf("?>", menor);
        i = i < 0 ? texto.length : i + 2;
        continue;
      }

      const mayor = texto.indexOf(">", menor);
      if (mayor < 0) break;
      let cuerpo = texto.slice(menor + 1, mayor).trim();

      if (cuerpo[0] === "/") {
        if (pila.length > 1) pila.pop();
        i = mayor + 1;
        continue;
      }

      const propio = cuerpo.endsWith("/");
      if (propio) cuerpo = cuerpo.slice(0, -1).trim();

      const espacio = cuerpo.search(/\s/);
      const nombre = espacio < 0 ? cuerpo : cuerpo.slice(0, espacio);
      const resto = espacio < 0 ? "" : cuerpo.slice(espacio);

      const atributos = {};
      const re = /([\w.:-]+)\s*=\s*"([^"]*)"|([\w.:-]+)\s*=\s*'([^']*)'/g;
      let m;
      while ((m = re.exec(resto)) !== null) {
        atributos[m[1] || m[3]] = desescapar(m[2] !== undefined ? m[2] : m[4]);
      }

      const nodo = { nombre: nombre, atributos: atributos, hijos: [], texto: "" };
      tope().hijos.push(nodo);
      if (!propio) pila.push(nodo);
      i = mayor + 1;
    }
    return raiz.hijos[0] || null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Geometría
  // ──────────────────────────────────────────────────────────────────────────
  // El único lugar del framework que sabe que existen los triángulos.
  //
  // Los controles declaran contornos y radios. Este backend integra la
  // teselación adaptativa de PathGeometry, el recorte y los buffers del panel.
  function Geometria() {
    this.pos = [];
    this.col = [];
    this.nor = [];
    this.idx = [];
    this.v = 0;
    /** Recorte vigente y su pila. Ver `recortar`. */
    this.clip = null;
    this.pilaClip = [];
    /** Se sube y baja para que lo que se dibuja después quede delante. Un
     *  framework de interfaces necesita orden de pintado, y sin alfa ni
     *  z-testing por capas la única herramienta es separar en z. */
    this.z = 0;
  }

  /** El rectángulo de recorte vigente, o null. Es una pila: un ScrollViewer
   *  dentro de otro tiene que quedarse con la intersección de los dos.
   *
   *  No hay tijera de GPU acá, así que el recorte se hace **en la geometría**:
   *  cada rectángulo se intersecta antes de emitirse. Funciona perfecto para lo
   *  que es rectangular, que es casi todo, y tiene un límite honesto: una
   *  esquina redondeada cortada por el borde pierde su redondeo del lado
   *  cortado, porque el abanico ya no se puede recortar sin retesela. Se
   *  documenta y se sigue: en una lista con scroll, el elemento que asoma por
   *  el borde se corta recto y nadie lo nota. */
  Geometria.prototype.recortar = function (x, y, w, h) {
    const a = this.clip;
    const n = a ? {
      x: Math.max(a.x, x), y: Math.max(a.y, y),
      x1: Math.min(a.x1, x + w), y1: Math.min(a.y1, y + h),
    } : { x: x, y: y, x1: x + w, y1: y + h };
    this.pilaClip.push(this.clip);
    this.clip = n;
  };

  Geometria.prototype.restaurar = function () {
    this.clip = this.pilaClip.length ? this.pilaClip.pop() : null;
  };

  /** Intersectar un rectángulo con el recorte. Devuelve null si no queda nada,
   *  y eso es lo que apaga el dibujo entero de un elemento fuera de vista. */
  Geometria.prototype.aplicarClip = function (x, y, w, h) {
    const c = this.clip;
    if (!c) return { x: x, y: y, w: w, h: h, entero: true };
    const x0 = Math.max(x, c.x), y0 = Math.max(y, c.y);
    const x1 = Math.min(x + w, c.x1), y1 = Math.min(y + h, c.y1);
    if (!(x1 > x0 && y1 > y0)) return null;
    const entero = x0 === x && y0 === y && x1 === x + w && y1 === y + h;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, entero: entero };
  };

  /** ¿Está este punto adentro del recorte? Lo usan los textos, que no se pueden
   *  cortar por la mitad: o se dibujan o no. */
  Geometria.prototype.puntoVisible = function (x, y) {
    const c = this.clip;
    return !c || (x >= c.x && x <= c.x1 && y >= c.y && y <= c.y1);
  };

  Geometria.prototype.reiniciar = function () {
    this.pos.length = 0;
    this.col.length = 0;
    this.nor.length = 0;
    this.idx.length = 0;
    this.v = 0;
    this.z = 0;
    this.clip = null;
    this.pilaClip.length = 0;
  };

  Geometria.prototype.vertice = function (x, y, c) {
    // Acá y sólo acá se invierte la Y: adentro se piensa como WPF —hacia
    // abajo—, el motor dibuja hacia arriba.
    this.pos.push(x, -y, this.z);
    this.nor.push(0, 0, 1);
    this.col.push(c[0], c[1], c[2], c[3]);
    return this.v++;
  };

  /** El orden de los índices, y por qué es el que parece al revés.
   *
   *  Adentro se piensa con Y hacia abajo, como WPF. `vertice()` la invierte al
   *  emitir. Eso **da vuelta el sentido de giro**: un triángulo que en la hoja
   *  se recorre en sentido antihorario, en el mundo queda horario, y el motor
   *  lo descarta por mirar para atrás.
   *
   *  Costó una tarde la primera vez y no da ningún error: la malla se crea, los
   *  triángulos se cuentan, y no se ve nada. Por eso el orden se centraliza acá
   *  y nadie más arma índices a mano. */
  Geometria.prototype.triangulo = function (a, b, c) {
    this.idx.push(a, c, b);
  };

  /** Un rectángulo. `x, y` es su esquina superior izquierda. */
  Geometria.prototype.rect = function (x, y, w, h, color) {
    if (w <= 0 || h <= 0) return;
    const r = this.aplicarClip(x, y, w, h);
    if (!r) return;
    x = r.x; y = r.y; w = r.w; h = r.h;
    const c = rgba(color);
    const a = this.vertice(x, y, c);
    const b = this.vertice(x + w, y, c);
    const d = this.vertice(x + w, y + h, c);
    const e = this.vertice(x, y + h, c);
    this.triangulo(a, b, d);
    this.triangulo(a, d, e);
    // (el sentido lo corrige `triangulo`; acá se escribe como se lee en la hoja)
  };

  const curveCache=new Map();
  const CURVE_TOLERANCE=0.00005;
  function roundedCommands(w,h,r) {
    r=Math.max(0,Math.min(r,w/2,h/2));const k=r*0.5522847498307936;
    return [{op:"moveTo",x:r,y:0},{op:"lineTo",x:w-r,y:0},
      {op:"bezierTo",c1x:w-r+k,c1y:0,c2x:w,c2y:r-k,x:w,y:r},
      {op:"lineTo",x:w,y:h-r},{op:"bezierTo",c1x:w,c1y:h-r+k,c2x:w-r+k,c2y:h,x:w-r,y:h},
      {op:"lineTo",x:r,y:h},{op:"bezierTo",c1x:r-k,c1y:h,c2x:0,c2y:h-r+k,x:0,y:h-r},
      {op:"lineTo",x:0,y:r},{op:"bezierTo",c1x:0,c1y:r-k,c2x:r-k,c2y:0,x:r,y:0},{op:"close"}];
  }
  function roundedGeometry(w,h,r) {
    r=Math.max(0,Math.min(r,w/2,h/2));const key=[w,h,r].join(',');
    if(curveCache.has(key))return curveCache.get(key);
    let geometry;
    if(globalThis.PathGeometry && r>0)geometry=PathGeometry.tessellate(roundedCommands(w,h,r),{tolerance:CURVE_TOLERANCE});
    else {
      // Compatibility path: adaptive arcs, not a fixed polygon count.
      const points=[];
      if(r<=0)points.push([0,0],[w,0],[w,h],[0,h]);
      else {
        const steps=Math.max(2,Math.min(64,Math.ceil((Math.PI/2)/(2*Math.acos(Math.max(-1,1-CURVE_TOLERANCE/r))))));
        for(const [x,y,a] of [[w-r,r,-Math.PI/2],[w-r,h-r,0],[r,h-r,Math.PI/2],[r,r,Math.PI]])
          for(let i=0;i<=steps;i++)points.push([x+Math.cos(a+i/steps*Math.PI/2)*r,y+Math.sin(a+i/steps*Math.PI/2)*r]);
      }
      const indices=[];for(let i=1;i+1<points.length;i++)indices.push(0,i,i+1);
      geometry={positions:points,indices,contours:[points],closed:[true]};
    }
    if(curveCache.size>=128)curveCache.delete(curveCache.keys().next().value);
    curveCache.set(key,geometry);return geometry;
  }
  function clipPolygon(polygon,clip) {
    if(!clip)return polygon;
    for(const [axis,bound,sign] of [[0,clip.x,1],[0,clip.x1,-1],[1,clip.y,1],[1,clip.y1,-1]]) {
      const out=[];
      for(let i=0;i<polygon.length;i++){
        const a=polygon[i],b=polygon[(i+1)%polygon.length],ia=(a[axis]-bound)*sign>=0,ib=(b[axis]-bound)*sign>=0;
        if(ia)out.push(a);
        if(ia!==ib){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
      }
      polygon=out;
    }
    return polygon;
  }
  Geometria.prototype.path = function(geometry,x,y,color) {
    const c=rgba(color);
    if(!this.clip){
      const vertices=geometry.positions.map(p=>this.vertice(p[0]+x,p[1]+y,c));
      for(let i=0;i<geometry.indices.length;i+=3)this.triangulo(vertices[geometry.indices[i]],vertices[geometry.indices[i+1]],vertices[geometry.indices[i+2]]);
      return;
    }
    for(let i=0;i<geometry.indices.length;i+=3){
      const polygon=clipPolygon(geometry.indices.slice(i,i+3).map(j=>[geometry.positions[j][0]+x,geometry.positions[j][1]+y]),this.clip);
      for(let j=1;j+1<polygon.length;j++){
        const a=polygon[0],b=polygon[j],d=polygon[j+1];
        if(Math.abs((b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]))<1e-12)continue;
        this.triangulo(this.vertice(...a,c),this.vertice(...b,c),this.vertice(...d,c));
      }
    }
  };
  Geometria.prototype.rectRedondeado = function(x,y,w,h,r,color) {
    if(!(w>0&&h>0)||!this.aplicarClip(x,y,w,h))return;
    if(r<=0)return this.rect(x,y,w,h,color);
    this.path(roundedGeometry(w,h,r),x,y,color);
  };


  /** Un marco: cuatro rectángulos, no un rectángulo grande con otro encima.
   *  Dibujar el relleno arriba del borde obliga a otro nivel de z por cada
   *  control anidado, y el z se agota. */
  Geometria.prototype.marco = function (x, y, w, h, g, color) {
    if (g.d > 0) this.rect(x, y, w, g.d, color);
    if (g.f > 0) this.rect(x, y + h - g.f, w, g.f, color);
    const yi = y + g.d, hi = h - g.d - g.f;
    if (g.i > 0) this.rect(x, yi, g.i, hi, color);
    if (g.s > 0) this.rect(x + w - g.s, yi, g.s, hi, color);
  };

  // Closed convex extrusion. Clip the contour first, then generate front,
  // back and side faces with independent normals (no rounded side artifacts).
  Geometria.prototype.solidRect = function(x,y,w,h,radius,depth,color) {
    if(!(w>0 && h>0 && depth>0))return;
    const polygon=clipPolygon(roundedGeometry(w,h,radius).contours[0].map(p=>[p[0]+x,p[1]+y]),this.clip);
    if(polygon.length<3)return;
    const c=rgba(color),front=this.z,back=front-depth,self=this;
    function vertex(p,z,n,k){const id=self.v++;self.pos.push(p[0],-p[1],z);self.nor.push(...n);self.col.push(c[0]*k,c[1]*k,c[2]*k,c[3]);return id;}
    const top=polygon.map(p=>vertex(p,front,[0,0,1],1));
    const bottom=polygon.map(p=>vertex(p,back,[0,0,-1],0.6));
    for(let i=1;i+1<polygon.length;i++){
      this.idx.push(top[0],top[i+1],top[i],bottom[0],bottom[i],bottom[i+1]);
    }
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
      if(length<1e-9)continue;
      const normal=[dy/length,dx/length,0],shade=0.65+0.1*Math.abs(normal[0]);
      const v0=vertex(a,back,normal,shade),v1=vertex(b,back,normal,shade),v2=vertex(b,front,normal,shade),v3=vertex(a,front,normal,shade);
      this.idx.push(v0,v2,v1,v0,v3,v2);
    }
  };

  Geometria.prototype.malla = function () {
    return {
      positions: new Float32Array(this.pos),
      indices: new Uint32Array(this.idx),
      normals: new Float32Array(this.nor),
      colors: new Float32Array(this.col),
    };
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Piletas de nodos
  // ──────────────────────────────────────────────────────────────────────────
  // Textos y blancos táctiles no pueden ir en la malla, así que son nodos. Se
  // crean una vez y se reciclan: en una pasada de layout se piden los que hagan
  // falta y los sobrantes se estacionan fuera de vista.
  //
  // Estacionar en vez de borrar es a propósito. `remove()` seguido de
  // `createElement` en el mismo cuadro es trabajo puro para el motor, y una
  // interfaz que muestra y esconde una lista lo haría sesenta veces por segundo.
  const LEJOS = -9000;

  function Pileta(padre, etiqueta, preparar) {
    this.padre = padre;
    this.etiqueta = etiqueta;
    this.preparar = preparar;
    this.items = [];
    this.usados = 0;
  }

  Pileta.prototype.pedir = function () {
    if (this.usados < this.items.length) return this.items[this.usados++];
    const el = root.createElement(this.etiqueta);
    const item = { el: el, alTocar: null };
    if (this.preparar) this.preparar(item);
    this.padre.appendChild(el);
    this.items.push(item);
    this.usados++;
    return item;
  };

  Pileta.prototype.comenzar = function () { this.usados = 0; };

  Pileta.prototype.terminar = function () {
    for (let i = this.usados; i < this.items.length; i++) {
      const it = this.items[i];
      if (!it.estacionado) {
        it.el.setAttribute("y", String(LEJOS));
        it.alTocar = null;
        // Al estacionar, el dueño deja de estar señalado: si no, un control que
        // dejó de dibujarse mientras el puntero estaba encima se quedaría
        // resaltado para siempre, porque su `pointerleave` nunca va a llegar.
        if (it.duenio) it.duenio.encima = false;
        it.duenio = null;
        it.estacionado = true;
      }
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Enlaces de datos
  // ──────────────────────────────────────────────────────────────────────────
  // La marca de la casa de WPF: el marcado no dice el valor, dice **de dónde
  // sacarlo**.
  //
  //   <TextBlock Text="{Binding titulo}"/>
  //   <Slider Value="{Binding potencia, Mode=TwoWay}"/>
  //
  // Sin esto, cambiar un número obliga a rearmar el árbol entero —que en este
  // framework es barato, pero pierde el estado de los controles y es la clase de
  // cosa que se nota cuando la interfaz crece.
  //
  // Es deliberadamente chico: una ruta con puntos, dos modos y un formato. No
  // hay convertidores, ni enlaces a elementos, ni notificación por propiedad. El
  // ciclo se cierra invalidando, no observando: es más tosco y es mucho menos
  // código que puede estar mal.
  const RE_ENLACE = /^\{Binding\s*([^,}]*)((?:,[^}]*)*)\}$/;

  function leerEnlace(texto) {
    const m = RE_ENLACE.exec(String(texto).trim());
    if (!m) return null;
    const enlace = { ruta: m[1].trim(), modo: "OneWay", formato: null };
    const extras = (m[2] || "").split(",");
    for (let i = 0; i < extras.length; i++) {
      const par = extras[i].split("=");
      if (par.length !== 2) continue;
      const k = par[0].trim(), v = par[1].trim();
      if (k === "Mode") enlace.modo = v;
      else if (k === "Format") enlace.formato = v;
    }
    return enlace;
  }

  /** Leer "a.b.c" de un objeto. Una ruta vacía es el objeto entero, como el
   *  `{Binding}` pelado de WPF. */
  function leerRuta(obj, ruta) {
    if (!ruta) return obj;
    const partes = ruta.split(".");
    let v = obj;
    for (let i = 0; i < partes.length && v != null; i++) v = v[partes[i]];
    return v;
  }

  function escribirRuta(obj, ruta, valor) {
    if (!ruta || obj == null) return;
    const partes = ruta.split(".");
    let o = obj;
    for (let i = 0; i < partes.length - 1; i++) {
      if (o[partes[i]] == null) o[partes[i]] = {};
      o = o[partes[i]];
    }
    o[partes[partes.length - 1]] = valor;
  }

  /** `Format` con un solo hueco. Lo mínimo para no tener que concatenar en el
   *  código lo que en realidad es presentación:
   *
   *      <TextBlock Text="{Binding potencia, Format=%v %}"/>
   *
   *  El hueco es `%v` y no `{0}` como en WPF por una razón boba pero real: la
   *  expresión de enlace termina en la primera llave de cierre, así que un
   *  `{0}` adentro la cortaría por la mitad. Se acepta igual por si alguien lo
   *  escribe por costumbre y el enlace no lleva más opciones. */
  function formatear(valor, formato) {
    if (!formato) return valor;
    return String(formato).replace("%v", String(valor)).replace("{0}", String(valor));
  }

  // ──────────────────────────────────────────────────────────────────────────
  // El elemento base
  // ──────────────────────────────────────────────────────────────────────────
  // `Measure` devuelve el tamaño deseado **incluyendo el margen**, y `Arrange`
  // recibe el rectángulo con el margen adentro: es la convención de WPF y evita
  // que cada panel tenga que acordarse de sumar o restar.

  function Elemento(atributos) {
    const a = atributos || {};
    this.attr = a;
    this.hijos = [];
    this.padre = null;
    this.nombre = a.Name || null;
    this.renderPanel = a.RenderPanel === "true";
    this._keyboardAttrs = a;
    this.pointerBlocking = a.PointerBlocking !== "false";
    this.depth = Math.max(0,Math.min(1,numero(a.Depth,0)));
    this.elevation = Math.max(-1,Math.min(1,numero(a.Elevation,0)));

    this.margen = grosor(a.Margin);
    /** El globo de ayuda. Vive en Elemento y no en Interactivo porque el
     *  atributo se declara en el marcado sobre cualquier cosa; quien decide si
     *  se muestra es el hover, que solo tienen los interactivos. */
    this.ayuda = a.ToolTip || null;
    this.anchoPedido = numero(a.Width, NaN);
    this.altoPedido = numero(a.Height, NaN);
    this.anchoMin = numero(a.MinWidth, 0);
    this.altoMin = numero(a.MinHeight, 0);
    this.anchoMax = numero(a.MaxWidth, Infinity);
    this.altoMax = numero(a.MaxHeight, Infinity);
    this.alinH = a.HorizontalAlignment || "Stretch";
    this.alinV = a.VerticalAlignment || "Stretch";
    this.visible = (a.Visibility || "Visible") !== "Collapsed";
    this.opaco = (a.Visibility || "Visible") === "Visible";

    /** Los enlaces declarados en los atributos, ya leídos. */
    this.enlaces = null;
    for (const k in a) {
      const e = leerEnlace(a[k]);
      if (e) (this.enlaces || (this.enlaces = [])).push({ prop: k, e: e });
    }

    /** Lo que llena `Measure` y consume `Arrange`. */
    this.deseado = { w: 0, h: 0 };
    /** Lo que llena `Arrange` y consume `emitir`. */
    this.caja = { x: 0, y: 0, w: 0, h: 0 };
  }

  /** De atributo de XAML al campo de JavaScript. Cada control declara el suyo;
   *  sin esto un enlace tendría que saber cómo se llama por dentro cada cosa. */
  Elemento.prototype.mapa = {};

  /** Traer los valores enlazados desde el contexto de datos. Se corre antes de
   *  medir, así que el layout ya ve los valores nuevos en la misma pasada. */
  Elemento.prototype.aplicarEnlaces = function (datos, app) {
    // La aplicación baja con los datos y no se guarda al inflar: un mismo árbol
    // podría montarse en dos aplicaciones, y sobre todo las copias que crea un
    // ItemsControl no existen todavía cuando se infla.
    this.app = app;
    if (this.enlaces) {
      for (let i = 0; i < this.enlaces.length; i++) {
        const en = this.enlaces[i];
        const campo = this.mapa[en.prop] || ({Depth:"depth",Elevation:"elevation"})[en.prop];
        if (!campo) continue;
        let v = leerRuta(datos, en.e.ruta);
        if (v === undefined) continue;
        if (en.e.formato) v = formatear(v, en.e.formato);
        this[campo] = v;
      }
    }
    for (let i = 0; i < this.hijos.length; i++) {
      this.hijos[i].aplicarEnlaces(datos, app);
    }
  };

  /** Devolver un valor al origen. Sólo para los enlaces TwoWay, que son los que
   *  tienen sentido en un control que el visitante puede mover. */
  Elemento.prototype.devolver = function (datos, prop, valor) {
    if (!this.enlaces) return false;
    for (let i = 0; i < this.enlaces.length; i++) {
      const en = this.enlaces[i];
      if (en.prop === prop && en.e.modo === "TwoWay") {
        escribirRuta(datos, en.e.ruta, valor);
        return true;
      }
    }
    return false;
  };

  Elemento.prototype.agregar = function (hijo) {
    hijo.padre = this;
    this.hijos.push(hijo);
    return this;
  };

  /** Restringe una medida a lo pedido por Width/MinWidth/MaxWidth. */
  Elemento.prototype.limitar = function (w, h) {
    let nw = isFinite(this.anchoPedido) ? this.anchoPedido : w;
    let nh = isFinite(this.altoPedido) ? this.altoPedido : h;
    nw = Math.max(this.anchoMin, Math.min(this.anchoMax, nw));
    nh = Math.max(this.altoMin, Math.min(this.altoMax, nh));
    return { w: nw, h: nh };
  };

  Elemento.prototype.medir = function (dispW, dispH) {
    if (!this.visible) { this.deseado = { w: 0, h: 0 }; return this.deseado; }
    const mw = anchoDe(this.margen), mh = altoDe(this.margen);
    const c = this.limitar(Math.max(0, dispW - mw), Math.max(0, dispH - mh));
    const propio = this.medirContenido(c.w, c.h);
    const f = this.limitar(propio.w, propio.h);
    this.deseado = { w: f.w + mw, h: f.h + mh };
    return this.deseado;
  };

  /** Lo que cada elemento redefine: cuánto mide su contenido. */
  Elemento.prototype.medirContenido = function () { return { w: 0, h: 0 }; };

  Elemento.prototype.acomodar = function (x, y, w, h) {
    if (!this.visible) { this.caja = { x: x, y: y, w: 0, h: 0 }; return; }
    const m = this.margen;
    let cx = x + m.i, cy = y + m.d;
    let cw = Math.max(0, w - anchoDe(m)), ch = Math.max(0, h - altoDe(m));

    // La alineación decide si el elemento estira o se planta en su tamaño.
    const d = this.limitar(
      isFinite(this.anchoPedido) ? this.anchoPedido : this.deseado.w - anchoDe(m),
      isFinite(this.altoPedido) ? this.altoPedido : this.deseado.h - altoDe(m));

    if (this.alinH !== "Stretch" || isFinite(this.anchoPedido)) {
      const aw = Math.min(cw, d.w);
      if (this.alinH === "Center") cx += (cw - aw) / 2;
      else if (this.alinH === "Right") cx += cw - aw;
      cw = aw;
    }
    if (this.alinV !== "Stretch" || isFinite(this.altoPedido)) {
      const ah = Math.min(ch, d.h);
      if (this.alinV === "Center") cy += (ch - ah) / 2;
      else if (this.alinV === "Bottom") cy += ch - ah;
      ch = ah;
    }

    this.caja = { x: cx, y: cy, w: cw, h: ch };
    this.acomodarContenido(cx, cy, cw, ch);
  };

  Elemento.prototype.acomodarContenido = function () {};

  Elemento.prototype.emitir = function (ctx) {
    if (!this.visible || !this.opaco) return;
    const self=this;
    const depth=Math.max(0,Math.min(1,numero(this.depth,0)));
    const lift=Math.max(-1,Math.min(1,numero(this.elevation,0)))+depth;
    const baseZ=ctx.g.z;
    ctx.g.z=baseZ+lift;
    function paint(){
      const b=self.caja;
      if(self.renderPanel && self.pointerBlocking && ctx.bloquear)ctx.bloquear(b.x,b.y,b.w,b.h,self.radio||0);
      if(depth>0 && (self.fondo || self.brocha)) {
        ctx.g.solidRect(b.x,b.y,b.w,b.h,self.radio||0,depth,self.fondo||self.brocha);
        ctx.subir();
      }
      self.emitirContenido(ctx);
    }
    try {
      if(this.renderPanel && ctx.app && ctx.app._renderPanel)ctx.app._renderPanel(this,ctx,paint);
      else paint();
    } finally {ctx.g.z=baseZ;}

  };

  Elemento.prototype.emitirContenido = function(ctx) {
    this.dibujar(ctx);for(const child of this.hijos)child.emitir(ctx);
  };
  Elemento.prototype.invalidateRender = function () {if(this.app)this.app.invalidateRender(this);};
  Elemento.prototype.invalidateMeasure = function () {if(this.app)this.app.invalidateMeasure();};
  Elemento.prototype.invalidateArrange = function () {if(this.app)this.app.invalidateArrange();};

  Elemento.prototype.dibujar = function () {};

  /** El dato de la fila a la que pertenece este elemento, si está adentro de la
   *  plantilla de un ItemsControl. Sube por los padres hasta la copia, que es la
   *  que lo tiene: el que recibe el toque suele ser un botón enterrado tres
   *  niveles más abajo.
   *
   *  Es lo que en WPF resuelve el DataContext heredado. Acá el contexto no se
   *  hereda —los enlaces se aplican de arriba hacia abajo y no se guardan—, así
   *  que se busca hacia arriba en vez de propagarse hacia abajo. */
  Elemento.prototype.itemDeLista = function () {
    let el = this;
    while (el) {
      if (el.datosItem !== undefined) return el.datosItem;
      el = el.padre;
    }
    return null;
  };

  /** Buscar por `Name`, como `FindName` de WPF. */
  Elemento.prototype.buscar = function (nombre) {
    if (this.nombre === nombre) return this;
    for (let i = 0; i < this.hijos.length; i++) {
      const r = this.hijos[i].buscar(nombre);
      if (r) return r;
    }
    return null;
  };

  function heredar(Hijo, Padre) {
    Hijo.prototype = Object.create(Padre.prototype);
    Hijo.prototype.constructor = Hijo;
    return Hijo;
  }

  globalThis.UI = {
    rgba: rgba,
    aLineal: aLineal,
    aSRGB: aSRGB,
    tinte: tinte,
    grosor: grosor,
    numero: numero,
    booleano: booleano,
    leerMarcado: leerMarcado,
    leerEnlace: leerEnlace,
    leerRuta: leerRuta,
    escribirRuta: escribirRuta,
    formatear: formatear,
    Geometria: Geometria,
    roundedCommands,roundedGeometry,
    Pileta: Pileta,
    Elemento: Elemento,
    heredar: heredar,
    anchoDe: anchoDe,
    altoDe: altoDe,
    LEJOS: LEJOS,
    root: root,
    CFG: CFG,
    tipos: {},
  };
})();
