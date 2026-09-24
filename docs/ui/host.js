// host.js — el que hace correr todo.
//
// Toma el marcado, arma el árbol, corre las dos pasadas y vuelca el resultado:
// una malla, unos textos y unos blancos táctiles. También decide **cuándo**
// hacerlo, que es la mitad del trabajo de un framework de interfaces.
//
// La política es: no redibujar por cuadro. El banco dice que se puede
// —2000 rectángulos por cuadro a 135 fps— pero poder no es deber: una interfaz
// quieta no tiene por qué gastar nada. Se redibuja cuando algo la invalida, y
// las animaciones piden cuadros mientras duran.
(function () {
  "use strict";

  const U = globalThis.UI;
  const root = U.root;

  // Technical separation inside a control, independent of row count and of
  // the explicit physical Depth/Elevation. Siblings restore their entry plane.
  const PASO_Z = 0.0001;

  /** Inflar el árbol desde el marcado ya leído.
   *
   *  `estilos` es el `Style TargetType` de WPF, en su versión más chica que
   *  todavía sirve: un juego de atributos por tipo de elemento, que se aplica
   *  **sólo donde el marcado no dijo nada**. Sin triggers, sin herencia de
   *  estilos, sin recursos. Alcanza para que una aplicación no repita
   *  `FontSize="0.032" Foreground="#A8A8BC"` en veinte líneas. */
  function inflar(nodo, estilos) {
    if (!nodo) return null;
    const Tipo = U.tipos[nodo.nombre];
    if (!Tipo) {
      console.log("[ui] elemento desconocido: " + nodo.nombre);
      return null;
    }
    const a = {};
    const estilo = estilos ? estilos[nodo.nombre] : null;
    if (estilo) for (const k in estilo) a[k] = estilo[k];
    for (const k in nodo.atributos) a[k] = nodo.atributos[k];
    if (nodo.texto) a.__texto = nodo.texto;
    const el = new Tipo(a);
    for (let i = 0; i < nodo.hijos.length; i++) {
      const h = inflar(nodo.hijos[i], estilos);
      if (h) el.agregar(h);
    }
    if (el.alInflar) el.alInflar();
    return el;
  }
  U.inflar = inflar;

  function Aplicacion(op) {
    const o = op || {};
    this.ancho = o.ancho || 1.4;
    this.alto = o.alto || 0.95;
    /** Corrimiento lateral del panel. Existe desde que hubo una sala con mas de
     *  un panel: sin esto todos nacen centrados en x=0 y se pisan. */
    this.x = o.x !== undefined ? o.x : 0;
    this.y = o.y !== undefined ? o.y : 1.62;
    this.z = o.z !== undefined ? o.z : -(U.CFG.distancia || 1.6);
    /** El contexto de datos, como el DataContext de WPF: el objeto contra el
     *  que se resuelven los `{Binding}`. */
    this.datos = o.datos || {};
    /** Plantillas con nombre, para los ItemsControl. Es el `DataTemplate` de
     *  XAML sin el ceremonial de los recursos. */
    this.plantillas = o.plantillas || {};
    /** Estilos por tipo de elemento. Ver `inflar`. */
    this.estilos = o.estilos || null;
    this.manejadores = o.manejadores || {};

    this.g = new U.Geometria();
    this.malla = null;
    this._textBatches = new Map();
    this._panels = new Map();
    this._renderVersion = 1;
    this._animations = new Map();
    this.nodoMalla = root.getElementById(o.malla || "ui_malla");
    this.contenedor = root.getElementById(o.nodos || "ui_nodos");

    const self = this;
    this.textos = new U.Pileta(this.contenedor, "text");
    /** Las imágenes son la tercera población de nodos, por la misma razón que
     *  los textos: un `<image>` es un plano texturado y no hay forma de meter
     *  una textura en la malla de la interfaz. */
    this.imagenes = new U.Pileta(this.contenedor, "image", function (item) {
      item.el.setAttribute("material-alpha", "blend");
      item.el.setAttribute("touchable", "false");
      item.el.addEventListener("load",function(){self.invalidar();});
    });
    this.bloqueos = new U.Pileta(this.contenedor, "plane", function(item){
      item.el.setAttribute("touchable","false");item.el.setAttribute("pointer-blocking","true");
      item.el.setAttribute("material-alpha","blend");item.el.setAttribute("color","#00000000");
    });
    this.blancos = new U.Pileta(this.contenedor, "plane", function (item) {
      item.el.setAttribute("touchable", "true");
      item.el.setAttribute("material-alpha","blend");
      item.el.setAttribute("color","#00000000");

      // **Hover.** El motor lo tiene desde `feat(input): add HTML-like hover`:
      // los nodos `touchable` reciben `pointerenter` / `pointerleave` sin que
      // nadie apriete nada, con el cursor en escritorio y con los rayos de los
      // mandos en VR (ver HOVER.md del motor).
      //
      // El framework se escribió antes suponiendo que no existía, y el destello
      // al presionar estaba puesto justamente para tapar esa ausencia. Ahora el
      // destello dice "te escuché" y el hover dice "esto se puede tocar", que es
      // el reparto de siempre y el que la gente ya conoce.
      //
      // El dueño se reasigna en cada pasada, así que se guarda **en el ítem** y
      // no se captura: capturarlo dejaría el resaltado prendido en un control
      // que ya no está ahí.
      item.el.addEventListener("pointerenter", function () {
        if (item.duenio) { item.duenio.encima = true; self.invalidateRender(item.duenio); }
      });
      item.el.addEventListener("pointerleave", function () {
        if (item.duenio) { item.duenio.encima = false; self.invalidateRender(item.duenio); }
      });
      item.el.addEventListener("toque", function (e) {
        // El manejador se reasigna en cada pasada; el listener se pone una sola
        // vez. Si se agregara uno por pasada, cada redibujo dejaría oyentes
        // muertos escuchando el mismo nodo.
        //
        // El evento trae el punto de impacto **en coordenadas del mundo**. Como
        // el panel no rota, traducirlo a coordenadas de la hoja es una resta y
        // una inversión de signo. Es lo que hace posible un Slider.
        let hoja = null;
        if (e && Number.isFinite(e.localX) && Number.isFinite(e.localY) && item.bounds) {
          const b=item.bounds;hoja={x:b.x+(e.localX+0.5)*b.w,y:b.y+(0.5-e.localY)*b.h};
        } else if (e && isFinite(e.x) && isFinite(e.y)) {
          hoja = { x: e.x - self.origenX, y: self.origenY - e.y };
        }
        if (item.alTocar) item.alTocar(self, hoja);
        if (item.duenio && item.duenio.habilitado !== false && self.focus) self.focus(item.duenio);
      });
    });

    // El panel se coloca con los nodos contenedores, no sumando el offset a cada
    // vértice: el layout queda en 2D puro y mover el panel es mover dos nodos.
    const x0 = this.x - this.ancho / 2;
    const y0 = this.y + this.alto / 2;
    /** Origen de la hoja en el mundo. Lo necesita la traducción del punto de
     *  impacto; guardarlo evita recalcularlo en cada toque. */
    this.origenX = x0;
    this.origenY = y0;
    for (const n of [this.nodoMalla, this.contenedor]) {
      if (!n) continue;
      n.setAttribute("x", String(x0));
      n.setAttribute("y", String(y0));
      n.setAttribute("z", String(this.z));
    }

    this.raiz = null;
    this.sucio = true;
    this.animando = 0;
    this.pasadas = 0;
    this._frame = null;
    this._running = false;
    this._layoutDirty = true;
    this._arrangeDirty = true;
  }

  Aplicacion.prototype.cargar = function (marcado) {
    if(globalThis.keyboard && keyboard.activeElement?.app===this)keyboard.blur();
    this.raiz = inflar(U.leerMarcado(marcado), this.estilos);
    if (this.raiz) {this.raiz.app = this;this.raiz.renderPanel=true;}
    this.invalidar();
    return this.raiz;
  };

  // Resize layout in place: retain panel resources and update the shared origin.
  Aplicacion.prototype.redimensionar = function (ancho, alto) {
    if (!Number.isFinite(ancho) || !Number.isFinite(alto) || ancho<=0 || alto<=0)
      throw new RangeError("UI dimensions must be finite and positive");
    if (this.ancho===ancho && this.alto===alto) return;
    this.ancho=ancho;this.alto=alto;
    this.origenX=this.x-ancho/2;this.origenY=this.y+alto/2;
    for(const node of [this.nodoMalla,this.contenedor])if(node){
      node.setAttribute("x",String(this.origenX));node.setAttribute("y",String(this.origenY));
    }
    this.invalidar();
  };

  Aplicacion.prototype.buscar = function (nombre) {
    return this.raiz ? this.raiz.buscar(nombre) : null;
  };

  /** Pedir un redibujo. Barato de llamar de más: sólo prende una bandera. */
  Aplicacion.prototype.invalidar = function () {
    this._layoutDirty = true;
    this._arrangeDirty = true;
    this.invalidateRender();
  };
  Aplicacion.prototype.invalidateMeasure = Aplicacion.prototype.invalidar;
  Aplicacion.prototype.invalidateArrange = function() {
    this._arrangeDirty=true;this.invalidateRender();
  };
  Aplicacion.prototype._markRender = function (element) {
    if (!element) {this._renderVersion++;return;}
    for(let el=element;el;el=el.padre) if(el._panelState) el._panelState.dirty=true;
  };
  Aplicacion.prototype.invalidateRender = function (element) {
    this._markRender(element);
    this.sucio = true;
    this._programar();
  };
  Aplicacion.prototype._programar = function () {
    if (!this._running || this._frame !== null) return;
    const self = this;
    this._frame = requestAnimationFrame(function () {
      self._frame = null;
      if (!self._running) return;
      // Clear before rendering: an invalidation during render must survive.
      self.sucio = false;
      for (const [element,until] of self._animations) {
        self._markRender(element);
        if(Date.now()>=until)self._animations.delete(element);
      }
      self.pasada(true);
      if (self.sucio || Date.now() < self.animando) self._programar();
    });
  };

  /** Pedir cuadros continuos durante `ms`. Lo usan las animaciones de los
   *  controles: mientras dure, el bucle redibuja aunque nadie invalide. */
  Aplicacion.prototype.animar = function (ms, element) {
    const hasta = Date.now() + (ms || 250);
    if (hasta > this.animando) this.animando = hasta;
    this._animations.set(element || null,hasta);
    this.invalidateRender(element);
  };

  Aplicacion.prototype.pasada = function (incremental) {
    if (!incremental) {this._layoutDirty = true;this._arrangeDirty=true;this._renderVersion++;}
    if (!this.raiz) return;
    const t0 = Date.now();
    this._frontmost=0;

    if (this._layoutDirty) {
      this._layoutDirty = false;
      this.raiz.aplicarEnlaces(this.datos, this);
      this.raiz.medir(this.ancho, this.alto);
      this._arrangeDirty=true;
    }
    if(this._arrangeDirty){
      this._arrangeDirty=false;
      this.raiz.acomodar(0, 0, this.ancho, this.alto);
    }

    for(const panel of this._panels.values())panel.seen=false;
    // 3. Emitir.
    this.g.reiniciar();
    for (const batch of this._textBatches.values()) batch.begin();
    this.textos.comenzar();
    this.imagenes.comenzar();
    this.blancos.comenzar();this.bloqueos.comenzar();

    const self = this;
    const ctx = {
      get g() {return self.g;},
      app: this,
      subir: function () { self.g.z += PASO_Z;self._frontmost=Math.max(self._frontmost,self.g.z+PASO_Z*2); },
      recortar: function (x, y, w, h) { self.g.recortar(x, y, w, h); },
      restaurar: function () { self.g.restaurar(); },
      texto: function (x, y, valor, tam, color, preparedLayout) {
        self._frontmost=Math.max(self._frontmost,self.g.z+PASO_Z*2);
        const layout = preparedLayout || U.medirTexto(valor,tam);
        if (layout.glyphs) {
          for (const glyph of layout.glyphs) {
            const source = "luna://ui-font/" + glyph.page;
            let batch = self._textBatches.get(source);
            if (!batch) { batch = new U.TexturedBatch(self.contenedor,source); self._textBatches.set(source,batch); }
            batch.quad(x-layout.w/2+glyph.x,y-layout.h/2+glyph.y,glyph.w,glyph.h,
              glyph.u,glyph.v,glyph.uw,glyph.vh,color,self.g.z+PASO_Z*2,self.g);
          }
          return;
        }
        // Un `<text>` es un nodo y no se puede cortar por la mitad: o entra o no
        // se dibuja. Se decide por su centro, que es donde el motor lo ancla.
        if (!self.g.puntoVisible(x, y)) return;
        const it = self.textos.pedir();
        it.estacionado = false;
        it.el.setAttribute("value", String(valor));
        it.el.setAttribute("size", String(tam));
        it.el.setAttribute("color", color);
        it.el.setAttribute("x", String(x));
        it.el.setAttribute("y", String(-y));
        it.el.setAttribute("z", String(self.g.z + PASO_Z * 2));
      },
      imagen: function (x, y, w, h, src, ajuste, tinte) {
        if (w <= 0 || h <= 0) return;
        const it = self.imagenes.pedir();
        it.estacionado = false;
        it.el.setAttribute("src", src);
        const nw=it.el.naturalWidth, nh=it.el.naturalHeight;
        let u=0,v=0,uw=1,vh=1;
        if(nw>0 && nh>0){
          const ratio=(nw/nh)/(w/h);
          if((ajuste||"contain")==="contain"){
            const rw=ratio<1?w*ratio:w,rh=ratio>1?h/ratio:h;
            x+=(w-rw)/2;y+=(h-rh)/2;w=rw;h=rh;
          } else if(ajuste==="cover"){
            uw=Math.min(1,1/ratio);vh=Math.min(1,ratio);u=(1-uw)/2;v=(1-vh)/2;
          }
        }
        const r=self.g.aplicarClip(x,y,w,h);
        if(!r){it.el.setAttribute("visible","false");return;}
        // "inherit", no "true": `visible="true"` es Visibility::Visible en Bevy,
        // que se ve **aunque el padre esté oculto**. Y como no hay
        // removeAttribute, un nodo pinneado en true no vuelve nunca a heredar.
        // Es lo que dejaba el panel de Ajustes dibujado con su ventana
        // minimizada: el shell ocultaba el <space> de la tab y esto lo ignoraba.
        it.el.setAttribute("visible","inherit");
        it.el.setAttribute("fit","stretch");
        it.el.setAttribute("texture-region",[u+(r.x-x)/w*uw,v+(r.y-y)/h*vh,r.w/w*uw,r.h/h*vh].join(","));
        it.el.setAttribute("color",tinte||"#FFFFFF");
        it.el.setAttribute("sx",String(r.w));it.el.setAttribute("sy",String(r.h));
        it.el.setAttribute("x",String(r.x+r.w/2));it.el.setAttribute("y",String(-(r.y+r.h/2)));
        it.el.setAttribute("z",String(self.g.z+PASO_Z*2));
      },
      bloquear: function(x,y,w,h,radius) {
        // Cover the rounded rectangle with horizontal strips; clip each strip
        // against the active viewport. These native-only targets have no JS work.
        const r=Math.max(0,Math.min(radius||0,w/2,h/2));
        function strip(sx,sy,sw,sh){
          const clip=self.g.aplicarClip(sx,sy,sw,sh);if(!clip || clip.w<=0 || clip.h<=0)return;
          const it=self.bloqueos.pedir();it.estacionado=false;
          it.el.setAttribute("touchable","false");it.el.setAttribute("pointer-blocking","true");
          it.el.setAttribute("sx",String(clip.w));it.el.setAttribute("sy",String(clip.h));
          it.el.setAttribute("x",String(clip.x+clip.w/2));it.el.setAttribute("y",String(-clip.y-clip.h/2));
          it.el.setAttribute("z",String(self.g.z));
        }
        if(!r){strip(x,y,w,h);return;}
        strip(x,y+r,w,h-2*r);
        // Inscribed strips do not block the empty corners outside the panel.
        const steps=8;
        for(let i=0;i<steps;i++){
          const dy=r*i/steps,dh=r/steps;
          const inset=r-Math.sqrt(Math.max(0,r*r-(r-dy)*(r-dy)));
          strip(x+inset,y+dy,w-2*inset,dh);
          strip(x+inset,y+h-dy-dh,w-2*inset,dh);
        }
      },
      blanco: function (x, y, w, h, color, alTocar, duenio) {
        if (w <= 0 || h <= 0) return;
        // El blanco también se recorta: un botón que se fue de la lista no tiene
        // que seguir siendo tocable donde ya no se ve.
        const r = self.g.aplicarClip(x, y, w, h);
        if (!r) return;
        x = r.x; y = r.y; w = r.w; h = r.h;
        const it = self.blancos.pedir();
        it.estacionado = false;
        it.el.setAttribute("touchable","true");
        it.el.setAttribute("pointer-blocking","true");
        it.alTocar = alTocar;
        it.bounds={x,y,w,h};
        it.duenio = duenio || null;
        if (duenio) { duenio._keyboardActivate = alTocar; duenio._keyboardBounds = {x,y,w,h}; }
        it.el.setAttribute("sx", String(w));
        it.el.setAttribute("sy", String(h));
        it.el.setAttribute("color", "#00000000");
        it.el.setAttribute("x", String(x + w / 2));
        it.el.setAttribute("y", String(-(y + h / 2)));
        it.el.setAttribute("z", String(self.g.z + PASO_Z));
      },
    };

    this.raiz.emitir(ctx);

    // Las capas superpuestas, al final y a proposito: emitir despues es estar
    // mas adelante, tanto para la vista como para el rayo del toque. Ver
    // superpuestos.js. El `if` es porque los bancos corren sin esa pieza.
    if (this.revisarGlobos) this.revisarGlobos();
    if (this.emitirCapas) {this.g.z=Math.max(this.g.z,this._frontmost);this.emitirCapas(ctx);}

    for (const batch of this._textBatches.values()) batch.commit();
    this.textos.terminar();
    this.imagenes.terminar();
    this.blancos.terminar();this.bloqueos.terminar();

    const d = this.g.malla();
    commitPanelMesh(this, this.nodoMalla, "malla", d, this.contenedor);
    for(const [element,panel] of this._panels){
      if(!panel.seen){this._disposePanel(panel);element._panelState=null;this._panels.delete(element);}
    }

    this.pasadas++;
    this.ultimoCosto = Date.now() - t0;
    this.ultimosTriangulos = d.indices.length / 3;
    for(const panel of this._panels.values()){this.ultimosTriangulos+=panel.geometry.idx.length/3;for(const batch of panel.batches.values())this.ultimosTriangulos+=batch.indices.length/3;}
  };

  // Explicit geometry boundary. The root, dialogs and large independent groups
  // can have their own mesh without recording/counting draw operations.
  Aplicacion.prototype._renderPanel = function (element,ctx,emit) {
    let panel=this._panels.get(element);
    if(!panel){
      const node=root.createElement("model");node.setAttribute("material-unlit","true");
      node.setAttribute("touchable","false");this.contenedor.appendChild(node);
      panel={node,geometry:new U.Geometria(),resource:null,dirty:true,version:0,children:new Set(),
        texts:new U.Pileta(this.contenedor,"text"),images:new U.Pileta(this.contenedor,"image",this.imagenes.preparar),
        blockers:new U.Pileta(this.contenedor,"plane",this.bloqueos.preparar),
        hits:new U.Pileta(this.contenedor,"plane",this.blancos.preparar),batches:new Map(),renders:0};
      this._panels.set(element,panel);element._panelState=panel;
    }
    if(this._activePanel)this._activePanel.children.add(panel);
    function seen(p){p.seen=true;for(const child of p.children)seen(child);}
    panel.seen=true;
    const start=this.g.z, clip=JSON.stringify(this.g.clip), box=JSON.stringify(element.caja);
    if(!panel.dirty && panel.version===this._renderVersion && panel.start===start && panel.clip===clip && panel.box===box){
      seen(panel);this.g.z=panel.end;this._frontmost=Math.max(this._frontmost,panel.frontmost);return;
    }
    const saved=[this.g,this.textos,this.imagenes,this.blancos,this.bloqueos,this._textBatches,this._activePanel];
    panel.geometry.reiniciar();panel.geometry.z=start;panel.geometry.clip=this.g.clip;
    this.g=panel.geometry;this.textos=panel.texts;this.imagenes=panel.images;this.blancos=panel.hits;this.bloqueos=panel.blockers;
    this._textBatches=panel.batches;this._activePanel=panel;panel.children.clear();
    panel.dirty=false;panel.version=this._renderVersion;panel.start=start;panel.clip=clip;panel.box=box;
    this.textos.comenzar();this.imagenes.comenzar();this.blancos.comenzar();this.bloqueos.comenzar();
    for(const batch of this._textBatches.values())batch.begin();
    try {
      emit();panel.end=this.g.z;panel.frontmost=this._frontmost;
      for(const batch of this._textBatches.values())batch.commit();
      this.textos.terminar();this.imagenes.terminar();this.blancos.terminar();this.bloqueos.terminar();
      const d=this.g.malla();
      commitPanelMesh(panel, panel.node, "resource", d, this.contenedor);
      panel.renders++;
    } catch(error){panel.dirty=true;throw error;}
    finally {[this.g,this.textos,this.imagenes,this.blancos,this.bloqueos,this._textBatches,this._activePanel]=saved;}
    this.g.z=panel.end;
  };
  Aplicacion.prototype._disposePanel = function (panel) {
    if(panel.resource)panel.resource.dispose();panel.node.remove();
    disposeBlendPass(panel);
    for(const pool of [panel.texts,panel.images,panel.hits,panel.blockers])for(const item of pool.items){if(item.duenio)item.duenio.encima=false;item.duenio=null;item.alTocar=null;item.el.remove();}
    for(const batch of panel.batches.values())batch.dispose();
  };
  Aplicacion.prototype.dispose = function () {
    if (globalThis.keyboard && keyboard.activeElement && keyboard.activeElement.app === this) keyboard.blur();
    this.detener();for(const [element,panel] of this._panels){this._disposePanel(panel);element._panelState=null;}this._panels.clear();
    this._animations.clear();this.animando=0;this.capas=[];this.globoDuenio=null;
    for(const batch of this._textBatches.values())batch.dispose();this._textBatches.clear();
    if(this.malla){this.malla.dispose();this.malla=null;}
    disposeBlendPass(this);
    for(const pool of [this.textos,this.imagenes,this.blancos,this.bloqueos]){for(const item of pool.items)item.el.remove();pool.items.length=0;pool.usados=0;}
    this.raiz=null;
  };

  Aplicacion.prototype.correr = function () {
    this._running = true;
    if (this.sucio || Date.now() < this.animando) this._programar();
    return this;
  };
  Aplicacion.prototype.detener = function () {
    this._running = false;
    if (this._frame !== null) cancelAnimationFrame(this._frame);
    this._frame = null;
    if (this._globoTimer !== undefined) clearTimeout(this._globoTimer);
    this._globoTimer = undefined;
    return this;
  };

  // A batch owns one mesh/material, not one node per glyph. Rectangular clips
  // modify both positions and UVs so partially visible glyphs remain correct.
  // Opaque backgrounds must write depth even when the same panel also contains
  // translucent controls. Sorting a mixed mesh as one transparent object lets
  // camera movement draw its opaque background over an independent child panel.
  function splitPanelMesh(data) {
    if(!data.indices.length)return [null,null];
    let opaque=true;
    for(let i=3;i<(data.colors||[]).length;i+=4)if(data.colors[i]<1){opaque=false;break;}
    if(opaque)return [data,null];
    const passes = [null, null], maps = [new Map(), new Map()];
    const fields = {positions:3, normals:3, uvs:2, colors:4};
    for (let i=0; i<data.indices.length; i+=3) {
      const ids=Array.from(data.indices.slice(i,i+3));
      const alpha=ids.map(id=>data.colors && data.colors.length ? data.colors[id*4+3] : 1);
      if (alpha.every(a=>a===0)) continue;
      const pass=alpha.every(a=>a>=1)?0:1;
      const out=passes[pass] || (passes[pass]={positions:[],indices:[],normals:[],uvs:[],colors:[]});
      const map=maps[pass];
      for(const id of ids){
        if(!map.has(id)){
          map.set(id,out.positions.length/3);
          for(const [field,size] of Object.entries(fields)) {
            if(data[field])out[field].push(...data[field].slice(id*size,(id+1)*size));
          }
        }
        out.indices.push(map.get(id));
      }
    }
    return passes;
  }
  function commitPanelMesh(owner,node,key,data,parent) {
    const [opaque,blend]=splitPanelMesh(data);
    node.setAttribute("material-alpha","opaque");
    node.setAttribute("visible",opaque?"inherit":"false");
    if(opaque){
      if(owner[key])owner[key].update(opaque);
      else {owner[key]=MeshResource.create(opaque);node.src=owner[key].src;}
    }
    if(blend){
      if(!owner._blendPass){
        const n=root.createElement("model");
        n.setAttribute("material-alpha","blend");n.setAttribute("material-unlit","true");
        n.setAttribute("touchable","false");parent.appendChild(n);
        owner._blendPass={node:n,resource:null};
      }
      const pass=owner._blendPass;
      let z=Infinity;
      for(let i=2;i<blend.positions.length;i+=3)z=Math.min(z,blend.positions[i]);
      for(let i=2;i<blend.positions.length;i+=3)blend.positions[i]-=z;
      pass.node.setAttribute("z",String(z));pass.node.setAttribute("visible","inherit");
      if(pass.resource)pass.resource.update(blend);
      else {pass.resource=MeshResource.create(blend);pass.node.src=pass.resource.src;}
    } else if(owner._blendPass)owner._blendPass.node.setAttribute("visible","false");
  }
  function disposeBlendPass(owner){
    const pass=owner._blendPass;if(!pass)return;
    if(pass.resource)pass.resource.dispose();pass.node.remove();owner._blendPass=null;
  }
  function TexturedBatch(parent,source) {
    this.node = root.createElement("model");
    this.node.setAttribute("texture",source);
    this.node.setAttribute("texture-fit","stretch");
    this.node.setAttribute("material-alpha","blend");
    this.node.setAttribute("material-unlit","true");
    this.node.setAttribute("touchable","false");
    parent.appendChild(this.node); this.resource=null; this.begin();
  }
  TexturedBatch.prototype.begin = function () {
    this.positions=[];this.indices=[];this.normals=[];this.uvs=[];this.colors=[];
  };
  TexturedBatch.prototype.quad = function (x,y,w,h,u,v,uw,vh,color,z,geometry) {
    const r=geometry.aplicarClip(x,y,w,h); if (!r || w<=0 || h<=0) return;
    const u0=u+(r.x-x)/w*uw, v0=v+(r.y-y)/h*vh;
    const u1=u+(r.x+r.w-x)/w*uw, v1=v+(r.y+r.h-y)/h*vh;
    const n=this.positions.length/3, c=U.rgba(color);
    this.positions.push(r.x,-r.y,z,r.x+r.w,-r.y,z,r.x+r.w,-r.y-r.h,z,r.x,-r.y-r.h,z);
    this.indices.push(n,n+2,n+1,n,n+3,n+2);
    this.uvs.push(u0,v0,u1,v0,u1,v1,u0,v1);
    for(let i=0;i<4;i++){this.normals.push(0,0,1);this.colors.push(...c);}
  };
  TexturedBatch.prototype.commit = function () {
    if (!this.indices.length) { this.node.setAttribute("visible","false"); return; }
    this.node.setAttribute("visible","inherit");
    // Bevy sorts transparent meshes by entity translation, not vertex Z.
    // Keep the origin on the text layer instead of tying it with the panel.
    // Subtract the same offset from vertices to preserve their world positions.
    let originZ=Infinity;
    for(let i=2;i<this.positions.length;i+=3)originZ=Math.min(originZ,this.positions[i]);
    const positions=this.positions.slice();
    for(let i=2;i<positions.length;i+=3)positions[i]-=originZ;
    this.node.setAttribute("z",String(originZ));
    const data={positions,indices:this.indices,normals:this.normals,uvs:this.uvs,colors:this.colors};
    if(this.resource) this.resource.update(data);
    else {this.resource=MeshResource.create(data);this.node.src=this.resource.src;}
  };
  TexturedBatch.prototype.dispose = function () {if(this.resource)this.resource.dispose();this.node.remove();};
  U.TexturedBatch=TexturedBatch;

  U.Aplicacion = Aplicacion;
  U.PASO_Z = PASO_Z;
})();
