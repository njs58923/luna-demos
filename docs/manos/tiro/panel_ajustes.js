// El panel de ajustar arma, hecho con el framework de interfaz del motor
// (luna://internal/ui.js, el de estilo WPF; ver guides/framework-ui.md).
//
// Uno solo para las tres armas: aparece arriba de la caja del arma que se
// ajusta y se va al salir del modo. Arriba, la grilla de referencias (una
// tarjeta por zona o punto, la elegida levantada y con su color); abajo, los
// campos de la elegida con sus pasos: −5, −1, +1, +5 (mm, grados o su unidad).
//
// Las dos listas van sin virtualizar (Virtualize="false"): son cortas, y la
// grilla envuelta (ItemsPanel="Wrap") virtualizada no emitía ninguna tarjeta.
//
// Las zonas de agarre suman dos botones: la forma (esfera o cilindro) y si
// cuenta la dirección de llegada de la mano; con dirección aparecen sus filas
// (rumbo, altura y el cono que se le perdona).
//
// El relieve sale de alturas: la placa tiene espesor (Depth), las tarjetas se
// levantan (Elevation) y la elegida se levanta más; el detalle es una bandeja
// elevada sobre la placa.
//
// Todo lo que hace lo pide a tiro/ajustes.js. Si el framework no llega (el
// arnés de pruebas, un Luna viejo), el modo ajuste anda igual sin panel.
//
// **El framework se carga recién al entrar al modo ajuste.** Son 163 kB de
// ui.js que el isolate evaluaba al abrir la página (unos 4 ms en V8, medido),
// para un panel que casi nunca se abre. Ahora la página no lo pide: la primera
// vez que se entra al modo, este módulo define UI_CFG y agrega el
// <script src="luna://internal/ui.js">, y arma el panel cuando llega.
(globalThis.__modulos ||= []).push(["tiro/panel_ajustes", ["tiro/escena", "tiro/ajustes"], (E, Z) => {
  const grupo = E.byId("cfg_panel");
  if (!grupo) return {};

  const C = {
    placa: "#12161DE8", bandeja: "#1E2430F0", texto: "#FFFFFF", tenue: "#9AA3AD",
    tarjeta: "#2A2F3A", paso: "#343B48", listo: "#30D158", restablecer: "#3A3F4B",
  };
  // Alto para la referencia con más campos (una zona en cilindro con
  // dirección: nueve filas) sin cortar los botones de abajo.
  const ANCHO = 0.5, ALTO = 0.98;

  const MARCADO = `
    <RenderPanel Background="${C.placa}" CornerRadius="0.022" Padding="0.016" Depth="0.02">
      <StackPanel Spacing="0.01">
        <Grid ColumnDefinitions="*,Auto">
          <TextBlock Text="{Binding titulo}" FontSize="0.026" Foreground="${C.texto}"/>
          <Button Grid.Column="1" Content="Listo" Click="cerrar" Background="${C.listo}" FontSize="0.018"
                  CornerRadius="0.01" Depth="0.008" Elevation="0.004"/>
        </Grid>
        <TextBlock Text="Elegí una referencia; el gatillo toca el panel." FontSize="0.014" Foreground="${C.tenue}"/>
        <ItemsControl ItemsSource="{Binding refs}" ItemTemplate="tarjeta" ItemsPanel="Wrap" Spacing="0.008" Virtualize="false"/>
        <Border Background="${C.bandeja}" CornerRadius="0.014" Padding="0.012" Depth="0.01" Elevation="0.01">
          <StackPanel Spacing="0.006">
            <TextBlock Text="{Binding nombre}" FontSize="0.022" Foreground="{Binding color}"/>
            <TextBlock Text="{Binding ayuda}" FontSize="0.014" Foreground="${C.tenue}" TextWrapping="Wrap"/>
            <ItemsControl ItemsSource="{Binding filas}" ItemTemplate="fila" Spacing="0.005" Virtualize="false"/>
            <StackPanel Orientation="Horizontal" Spacing="0.008">
              <Button Content="{Binding formaTexto}" Click="alternarForma" IsEnabled="{Binding esZona}" Background="${C.paso}" FontSize="0.015"
                      CornerRadius="0.008" Depth="0.006" Elevation="0.003"/>
              <Button Content="{Binding dirTexto}" Click="alternarDireccion" IsEnabled="{Binding esZona}" Background="${C.paso}" FontSize="0.015"
                      CornerRadius="0.008" Depth="0.006" Elevation="0.003"/>
            </StackPanel>
            <StackPanel Orientation="Horizontal" Spacing="0.008">
              <Button Content="Restablecer esta" Click="restablecer" Background="${C.restablecer}" FontSize="0.015"
                      CornerRadius="0.008" Depth="0.006" Elevation="0.003"/>
              <Button Content="Todo de fábrica" Click="restablecerTodo" Background="${C.restablecer}" FontSize="0.015"
                      CornerRadius="0.008" Depth="0.006" Elevation="0.003"/>
            </StackPanel>
          </StackPanel>
        </Border>
      </StackPanel>
    </RenderPanel>`;

  const PLANTILLAS = {
    tarjeta: `<Button Content="{Binding nombre}" Background="{Binding fondo}" Click="elegir" Width="0.148" Height="0.046"
                      FontSize="0.015" CornerRadius="0.01" Depth="0.008" Elevation="{Binding altura}"/>`,
    fila: `<Grid ColumnDefinitions="0.1,*,0.046,0.046,0.046,0.046" ColumnSpacing="0.004">
             <TextBlock Text="{Binding etiqueta}" FontSize="0.016" Foreground="${C.tenue}"/>
             <TextBlock Grid.Column="1" Text="{Binding valor}" FontSize="0.017" Foreground="${C.texto}"/>
             <Button Grid.Column="2" Content="−5" Click="menos5" Background="${C.paso}" FontSize="0.014" CornerRadius="0.006" Depth="0.004" Elevation="0.002"/>
             <Button Grid.Column="3" Content="−1" Click="menos1" Background="${C.paso}" FontSize="0.014" CornerRadius="0.006" Depth="0.004" Elevation="0.002"/>
             <Button Grid.Column="4" Content="+1" Click="mas1" Background="${C.paso}" FontSize="0.014" CornerRadius="0.006" Depth="0.004" Elevation="0.002"/>
             <Button Grid.Column="5" Content="+5" Click="mas5" Background="${C.paso}" FontSize="0.014" CornerRadius="0.006" Depth="0.004" Elevation="0.002"/>
           </Grid>`,
  };

  /** Los datos del panel, sacados del resumen de ajustes. */
  function datosDe(r) {
    const d = r || { nombreArma: "", refs: [], elegida: null, filas: [] };
    return {
      titulo: "Ajustar " + d.nombreArma,
      refs: d.refs.map((x) => ({ id: x.id, nombre: x.nombre, fondo: x.elegida ? x.color + "E0" : "#2A2F3A", altura: x.elegida ? 0.014 : 0.004 })),
      nombre: d.elegida ? d.elegida.nombre : "",
      color: d.elegida ? d.elegida.color : C.texto,
      ayuda: d.elegida ? d.elegida.ayuda + (d.elegida.arrastrable ? " También la podés arrastrar con la mano libre." : "") : "",
      filas: d.filas,
      // Las zonas de agarre tienen forma y dirección de llegada; el resto, no.
      esZona: !!(d.elegida && d.elegida.zona),
      formaTexto: d.elegida && d.elegida.zona ? "Forma: " + d.elegida.forma : "Forma: —",
      dirTexto: d.elegida && d.elegida.zona ? "Dirección: " + (d.elegida.direccion ? "sí" : "no") : "Dirección: —",
    };
  }

  let app = null;
  function armar() {
    app = new UI.Aplicacion({
      ancho: ANCHO, alto: ALTO, x: 0, y: 0, z: 0, malla: "cfg_malla", nodos: "cfg_nodos",
      datos: datosDe(Z.resumen()), plantillas: PLANTILLAS,
    });
    const fila = (el) => (el && el.itemDeLista ? el.itemDeLista() : null);
    Object.assign(app.manejadores, {
      cerrar: () => Z.desactivar(),
      elegir: (el) => { const r = fila(el); if (r) Z.elegir(r.id); },
      menos5: (el) => { const f = fila(el); if (f) Z.pasoDeFila(f, -5); },
      menos1: (el) => { const f = fila(el); if (f) Z.pasoDeFila(f, -1); },
      mas1: (el) => { const f = fila(el); if (f) Z.pasoDeFila(f, 1); },
      mas5: (el) => { const f = fila(el); if (f) Z.pasoDeFila(f, 5); },
      alternarForma: () => Z.alternarForma(),
      alternarDireccion: () => Z.alternarDireccion(),
      restablecer: () => Z.restablecer(),
      restablecerTodo: () => Z.restablecerTodo(),
    });
    app.cargar(MARCADO);
    app.correr();
    globalThis.TIRO_PANEL = app;
  }

  function refrescar() {
    const r = Z.resumen();
    if (!r) {
      grupo.setAttribute("visible", "false");
      if (app) app.detener();
      return;
    }
    const lugar = Z.lugarDelPanel();
    grupo.position = lugar;
    grupo.setAttribute("visible", "inherit");
    if (!app) { armar(); return; }
    Object.assign(app.datos, datosDe(r));
    app.correr();
    app.invalidar();
  }

  const hayUI = () => typeof UI !== "undefined" && !!UI.Aplicacion;
  let pedido = false;
  /** Pedir el framework, una sola vez. UI_CFG antes: ui.js lo lee al evaluarse. */
  function cargarUI() {
    if (pedido) return;
    pedido = true;
    if (!globalThis.UI_CFG) globalThis.UI_CFG = { base: "luna://", distancia: 1.6, C: { texto: "#FFFFFF" } };
    const s = E.root.createElement("script");
    s.setAttribute("id", "cfg_ui_js");
    s.setAttribute("src", "luna://internal/ui.js");
    grupo.appendChild(s);
    (function esperar() {
      if (!hayUI()) return void requestAnimationFrame(esperar);
      if (Z.activa) refrescar();
    })();
  }

  Z.escuchar(() => {
    if (hayUI()) refrescar();
    else if (Z.activa) cargarUI();
  });

  return { refrescar };
}]);
