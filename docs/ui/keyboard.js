// Focus and single-line editing for the retained UI. No permanent render loop.
(function() {
  'use strict';
  const U = globalThis.UI;
  if (!U || U.tipos.TextBox) return;
  const K = globalThis.keyboard;
  function emit(control, type, extra = {}, cancelable = false) {
    const e = Object.assign({ type, target: control, cancelable, defaultPrevented: false,
      preventDefault() { if (cancelable) this.defaultPrevented = true; } }, extra);
    control.dispatchEvent(e); return e;
  }
  U.Elemento.prototype.addEventListener = function(type, fn) {
    if (!this._keyListeners) this._keyListeners = new Map();
    if (!this._keyListeners.has(type)) this._keyListeners.set(type, new Set());
    this._keyListeners.get(type).add(fn);
  };
  U.Elemento.prototype.removeEventListener = function(type, fn) { this._keyListeners?.get(type)?.delete(fn); };
  U.Elemento.prototype.dispatchEvent = function(e) {
    e.currentTarget = this;
    for (const fn of [...(this._keyListeners?.get(e.type) || [])]) { if (e._immediateStopped) break; fn.call(this,e); }
    const attr = {keydown:'KeyDown',keyup:'KeyUp',input:'TextChanged',change:'Changed',focus:'GotFocus',blur:'LostFocus'}[e.type];
    const callback = attr && this.app?.manejadores[this._keyboardAttrs?.[attr]];
    if (typeof callback === 'function') callback(this, this.app, e);
    if (e.type === 'focus') { this._focused = true; if(this instanceof TextBox)this._saved=this.text; this.invalidateRender(); }
    if(e.type==='compositionupdate'){this._composition=e.data||'';this.invalidateRender();}
    if(e.type==='compositionend'){this._composition='';this.invalidateRender();}
    if (e.type === 'blur') {
      this._focused = false; this._composition = ''; this.invalidateRender();
      if (this.commit) this.commit();
    }
    return !e.defaultPrevented;
  };
  U.Elemento.prototype.focus = function() { if (this.app) this.app.focus(this); };
  U.Elemento.prototype.blur = function() { if (K?.activeElement === this) K.blur(); };
  U.Aplicacion.prototype.focus = function(control) {
    if (!K || !control || control.habilitado === false || !control.visible || !control.opaco) return;
    K.focus(control, {editable: control instanceof TextBox && !control.soloLectura});
  };
  U.Aplicacion.prototype.focusNext = function(current, backwards) {
    const pools = [this.blancos, ...[...this._panels.values()].map(p=>p.hits)];
    const items = [];
    for (const pool of pools) for (const item of pool.items.slice(0,pool.usados)) {
      const c = item.duenio;
      if (c && c.habilitado !== false && c.visible && c.opaco && c._keyboardAttrs?.IsTabStop!=='false' && !items.includes(c)) items.push(c);
    }
    items.sort((a,b)=>(Number(a._keyboardAttrs?.TabIndex||0)-Number(b._keyboardAttrs?.TabIndex||0))||(a.caja.y-b.caja.y)||(a.caja.x-b.caja.x));
    if (items.length) this.focus(items[(items.indexOf(current)+(backwards?-1:1)+items.length)%items.length]);
  };
  U.Elemento.prototype.defaultKeyDown = function(e) {
    if (e.key === 'Tab') { this.app.focusNext(this,e.shiftKey); e.preventDefault(); }
    else if (e.key === 'Escape') { if(this.app.capas?.length)this.app.cerrarCapa();else this.blur(); e.preventDefault(); }
    else if(this instanceof U.tipos.ComboBox && ['ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
      const i=e.key==='Home'?0:e.key==='End'?this.opciones.length-1:Math.max(0,Math.min(this.opciones.length-1,this.elegida+(e.key==='ArrowUp'?-1:1)));
      if(i>=0){this.elegir(i,this.app);this.app.cerrarCapa(this);this.app.invalidar();}e.preventDefault();
    }
    else if ((e.key === 'Enter' || e.key === ' ') && this._keyboardActivate) {
      if(e.repeat){e.preventDefault();return;}
      const b = this._keyboardBounds || this.caja;
      this._keyboardActivate(this.app,{x:b.x+b.w/2,y:b.y+b.h/2}); e.preventDefault();
    } else if (this instanceof U.tipos.Slider && ['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
      const step = this.paso || (this.max-this.min)/100;
      this.valor = e.key==='Home'?this.min:e.key==='End'?this.max:Math.max(this.min,Math.min(this.max,this.valor+(e.key==='ArrowLeft'?-step:step)));
      this.devolver(this.app.datos,'Value',this.valor);
      const h=this.manejador(this.app,this.alCambiar); if(h)h(this,this.app);
      this.app.invalidar(); e.preventDefault();
    }
  };
  // Controls already retain their attributes as `atributos`; capture keyboard
  // handlers explicitly for TextBox below, leaving existing inflation unchanged.
  function TextBox(a) {
    U.Elemento.call(this,a);
    this._keyboardAttrs = a;
    this.text = U.leerEnlace(a.Text) ? '' : String(a.Text || '');
    this.placeholder = a.Placeholder || '';
    this.tam = U.numero(a.FontSize,0.028);
    this.fondo = a.Background || '#2A3038'; this.color = a.Foreground || '#FFFFFF';
    this.radio = U.numero(a.CornerRadius,0.008);
    this.habilitado = U.booleano(a.IsEnabled,true); this.soloLectura = U.booleano(a.IsReadOnly,false);
    this.maxLength = Math.max(0,U.numero(a.MaxLength,4096));
    this.selectionStart = this.selectionEnd = this.text.length;
    this._saved = this.text; this._undo = []; this._redo = []; this._scroll = 0;
  }
  U.heredar(TextBox,U.Elemento);
  TextBox.prototype.mapa = {Text:'text',Placeholder:'placeholder',FontSize:'tam',Background:'fondo',Foreground:'color',IsEnabled:'habilitado',IsReadOnly:'soloLectura'};
  TextBox.prototype.medirContenido = function() { return {w:0.45,h:this.tam*1.6+0.018}; };
  TextBox.prototype.setSelectionRange = function(start,end) {
    this.selectionStart=Math.max(0,Math.min(this.text.length,start));
    this.selectionEnd=Math.max(this.selectionStart,Math.min(this.text.length,end));this._caret=this.selectionEnd;this._anchor=null;this.invalidateRender();
  };
  TextBox.prototype.select = function() { this.setSelectionRange(0,this.text.length); };
  TextBox.prototype.commit = function() { if(this.text!==this._saved){ this._saved=this.text; emit(this,'change'); } };
  TextBox.prototype.replace = function(text,inputType,record=true) {
    if(!this.habilitado||this.soloLectura)return;
    if(!this._inserting){const before=emit(this,'beforeinput',{data:text||null,inputType},true);if(before.defaultPrevented)return;}
    text=String(text).replace(/[\r\n\u0000-\u0008\u000B-\u001F]/g,'');
    const start=this.selectionStart,end=this.selectionEnd;
    text=text.slice(0,Math.max(0,this.maxLength-(this.text.length-(end-start))));
    if(record){this._undo.push({text:this.text,start,end});if(this._undo.length>50)this._undo.shift();this._redo=[];}
    this.text=this.text.slice(0,start)+text+this.text.slice(end);
    this.selectionStart=this.selectionEnd=start+text.length;this._caret=this.selectionEnd;this._anchor=null;
    this.devolver(this.app.datos,'Text',this.text); this.app.invalidar();
    emit(this,'input',{data:text||null,inputType});
  };
  // beforeinput for insertion already ran in the keyboard runtime.
  TextBox.prototype.insertText = function(text,type) { this._inserting=true; this.replace(text,type); this._inserting=false; };
  function previous(text,pos){const chars=Array.from(text.slice(0,pos));return pos-(chars.pop()||'').length;}
  function next(text,pos){return pos+(Array.from(text.slice(pos))[0]||'').length;}
  TextBox.prototype.defaultKeyDown = function(e) {
    const ctrl=e.ctrlKey||e.metaKey;
    if(e.isComposing)return;
    if(ctrl&&['c','x','v'].includes(e.key.toLowerCase())) {
      const key=e.key.toLowerCase();
      if(key==='v'){if(typeof e.clipboardText==='string')this.replace(e.clipboardText,'insertFromPaste');}
      else {K.copy(this.text.slice(this.selectionStart,this.selectionEnd));if(key==='x')this.replace('','deleteByCut');}
      e.preventDefault();return;
    }
    if(ctrl&&e.key.toLowerCase()==='a'){this.select();e.preventDefault();return;}
    if(ctrl&&['z','y'].includes(e.key.toLowerCase())) {
      const redo=e.key.toLowerCase()==='y'||e.shiftKey, from=redo?this._redo:this._undo,to=redo?this._undo:this._redo;
      if(!this.soloLectura&&from.length){to.push({text:this.text,start:this.selectionStart,end:this.selectionEnd});const v=from.pop();this.text=v.text;this.setSelectionRange(v.start,v.end);this.devolver(this.app.datos,'Text',this.text);this.app.invalidar();emit(this,'input',{inputType:redo?'historyRedo':'historyUndo',data:null});}
      e.preventDefault();return;
    }
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) {
      let p=this._caret??this.selectionEnd;
      if(e.key==='Home')p=0; else if(e.key==='End')p=this.text.length;
      else if(e.key==='ArrowLeft')p=(!e.shiftKey&&this.selectionStart!==this.selectionEnd)?this.selectionStart:previous(this.text,p);
      else p=(!e.shiftKey&&this.selectionStart!==this.selectionEnd)?this.selectionEnd:next(this.text,p);
      if(e.shiftKey){const anchor=this._anchor??this.selectionStart;this._anchor=anchor;this.selectionStart=Math.min(anchor,p);this.selectionEnd=Math.max(anchor,p);this._caret=p;}
      else {this._anchor=null;this._caret=p;this.selectionStart=this.selectionEnd=p;}
      this.invalidateRender();e.preventDefault();return;
    }
    if(e.key==='Backspace'||e.key==='Delete') {
      if(this.selectionStart===this.selectionEnd) {if(e.key==='Backspace')this.selectionStart=previous(this.text,this.selectionStart);else this.selectionEnd=next(this.text,this.selectionEnd);}
      this.replace('',e.key==='Backspace'?'deleteContentBackward':'deleteContentForward');e.preventDefault();return;
    }
    if(e.key==='Enter'){this.commit();this.blur();e.preventDefault();return;}
    U.Elemento.prototype.defaultKeyDown.call(this,e);
  };
  TextBox.prototype.dibujar = function(ctx) {
    const b=this.caja,pad=0.012,self=this;
    this.text=String(this.text??'');this.selectionStart=Math.min(this.selectionStart,this.text.length);this.selectionEnd=Math.min(this.selectionEnd,this.text.length);
    if(this.habilitado)ctx.blanco(b.x,b.y,b.w,b.h,this.fondo,function(app,point){
      if(!self._focused)self._saved=self.text;
      let pos=0;
      if(point){const x=point.x-b.x-pad+self._scroll;for(const ch of self.text){const n=pos+ch.length;if(U.medirTexto(self.text.slice(0,n),self.tam).w>x)break;pos=n;}}
      else pos=self.text.length;
      self.selectionStart=self.selectionEnd=pos;self._anchor=null;self._caret=pos;app.focus(self);self.invalidateRender();
    },this);
    ctx.subir();ctx.g.rectRedondeado(b.x,b.y,b.w,b.h,this.radio,this._focused?'#527AB0':this.fondo);
    ctx.subir();ctx.g.rectRedondeado(b.x+0.0015,b.y+0.0015,b.w-0.003,b.h-0.003,this.radio,this.fondo);
    ctx.subir();ctx.g.recortar(b.x+pad,b.y+0.002,Math.max(0,b.w-pad*2),b.h-0.004);
    const caret=Math.min(this._caret??this.selectionEnd,this.text.length),cx=U.medirTexto(this.text.slice(0,caret),this.tam).w;
    const available=Math.max(0.01,b.w-pad*2);
    this._scroll=Math.max(0,Math.min(this._scroll,cx));if(cx-this._scroll>available-0.003)this._scroll=cx-available+0.003;
    const x=b.x+pad-this._scroll;
    if(this._focused&&this.selectionEnd>this.selectionStart){const a=U.medirTexto(this.text.slice(0,this.selectionStart),this.tam).w,z=U.medirTexto(this.text.slice(0,this.selectionEnd),this.tam).w;ctx.g.rectRedondeado(x+a,b.y+0.008,z-a,b.h-0.016,0,'#365C91');ctx.subir();}
    const text=this.text||this.placeholder,m=U.medirTexto(text,this.tam);
    ctx.texto(x+m.w/2,b.y+b.h/2,text,this.tam,this.text?this.color:'#99A2B0');ctx.subir();
    if(this._composition){const cm=U.medirTexto(this._composition,this.tam);ctx.texto(x+cx+cm.w/2,b.y+b.h/2,this._composition,this.tam,'#AACEFF');ctx.subir();}
    if(this._focused)ctx.g.rectRedondeado(x+cx,b.y+0.008,0.0015,b.h-0.016,0,this.color);
    ctx.g.restaurar();
  };
  U.tipos.TextBox=TextBox;
})();
