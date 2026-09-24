// ajustes.js — la demo de la capa superpuesta.
//
// Es el panel de preferencias de cualquier programa, que es justo el caso donde
// se nota lo que faltaba: un desplegable, un globo de ayuda y un diálogo de
// confirmación. Los tres necesitan dibujar **encima** del panel, y hasta acá
// todo lo que el framework sabía hacer vivía adentro de su rectángulo.
//
// Las tres cosas salen de la misma pieza —`superponer`— y de un hecho del
// motor: la pasada emite en orden y `g.z` sube, así que lo último que se emite
// queda adelante, para la vista y para el rayo del toque.
//
// El globo, además, sólo es posible porque **hay hover**: el motor manda
// `pointerenter` desde `feat(input): add HTML-like hover`. Un globo que
// apareciera al tocar llegaría siempre tarde.
const C = globalThis.UI_CFG.C;

const datos = {
  calidad: 1,
  idioma: 0,
  antialias: 2,
  brillo: 70,
  sonido: true,
  telemetria: false,
  estado: "sin cambios",
};

// Lo que dice cada opción, en el orden en que se ofrecen. Se guarda aparte del
// marcado porque el diálogo de confirmación las vuelve a leer para resumir.
const OPCIONES = {
  calidad: ["Baja", "Media", "Alta", "Ultra"],
  idioma: ["Español", "English", "Português"],
  antialias: ["Ninguno", "FXAA", "MSAA 2x", "MSAA 4x", "MSAA 8x"],
};

const ESTILOS = {
  TextBlock: { FontSize: "0.028", Foreground: C.textoTenue },
  Button: { FontSize: "0.028", CornerRadius: "0.01" },
  ComboBox: { FontSize: "0.028" },
};

const MARCADO = `
<Border Background="${C.superficie}" BorderBrush="${C.borde}" BorderThickness="0.004"
        CornerRadius="0.02" Padding="0.024">
  <DockPanel>

    <TextBlock DockPanel.Dock="Top" Text="Ajustes" FontSize="0.044"
               Foreground="${C.texto}" Margin="0,0,0,0.004"/>
    <TextBlock DockPanel.Dock="Top" Text="{Binding estado}" FontSize="0.02"
               Margin="0,0,0,0.018"/>

    <StackPanel DockPanel.Dock="Bottom" Orientation="Horizontal" Spacing="0.012"
                HorizontalAlignment="Right" Margin="0,0.018,0,0">
      <Button Content="Restablecer" Background="${C.superficieAlta}"
              Click="restablecer" ToolTip="Vuelve todo a los valores de fábrica"/>
      <Button Content="Aplicar" Background="${C.azul}" Click="aplicar"
              ToolTip="Pide confirmación antes de tocar nada"/>
    </StackPanel>

    <Grid ColumnDefinitions="0.26,*" ColumnSpacing="0.018"
          RowDefinitions="Auto,Auto,Auto,Auto,Auto" RowSpacing="0.014">

      <TextBlock Grid.Row="0" Grid.Column="0" Text="Calidad" VerticalAlignment="Center"/>
      <ComboBox  Grid.Row="0" Grid.Column="1" Items="Baja;Media;Alta;Ultra"
                 SelectedIndex="{Binding calidad, Mode=TwoWay}"
                 SelectionChanged="cambio" HorizontalAlignment="Left"
                 ToolTip="Afecta sombras, texturas y densidad de malla"/>

      <TextBlock Grid.Row="1" Grid.Column="0" Text="Idioma" VerticalAlignment="Center"/>
      <ComboBox  Grid.Row="1" Grid.Column="1" Items="Español;English;Português"
                 SelectedIndex="{Binding idioma, Mode=TwoWay}"
                 SelectionChanged="cambio" HorizontalAlignment="Left"/>

      <TextBlock Grid.Row="2" Grid.Column="0" Text="Suavizado" VerticalAlignment="Center"/>
      <ComboBox  Grid.Row="2" Grid.Column="1"
                 Items="Ninguno;FXAA;MSAA 2x;MSAA 4x;MSAA 8x"
                 SelectedIndex="{Binding antialias, Mode=TwoWay}"
                 SelectionChanged="cambio" HorizontalAlignment="Left"
                 ToolTip="El último abre hacia arriba: no entra hacia abajo"/>

      <TextBlock Grid.Row="3" Grid.Column="0" Text="Brillo" VerticalAlignment="Center"/>
      <Grid Grid.Row="3" Grid.Column="1" ColumnDefinitions="*,0.1" ColumnSpacing="0.012">
        <Slider Grid.Column="0" Minimum="0" Maximum="100" Step="1"
                Value="{Binding brillo, Mode=TwoWay}" Foreground="${C.amarillo}"
                ValueChanged="cambio" VerticalAlignment="Center"/>
        <TextBlock Grid.Column="1" Text="{Binding brillo, Format=%v %}"
                   Foreground="${C.texto}" TextAlignment="Right"
                   VerticalAlignment="Center"/>
      </Grid>

      <TextBlock Grid.Row="4" Grid.Column="0" Text="Extras" VerticalAlignment="Center"/>
      <StackPanel Grid.Row="4" Grid.Column="1" Orientation="Horizontal" Spacing="0.02">
        <ToggleSwitch Content="Sonido" IsChecked="{Binding sonido, Mode=TwoWay}"
                      Checked="cambio" Accent="${C.verde}"/>
        <ToggleSwitch Content="Telemetría" IsChecked="{Binding telemetria, Mode=TwoWay}"
                      Checked="cambio" Accent="${C.violeta}"
                      ToolTip="No manda nada: es una demo"/>
      </StackPanel>

    </Grid>
  </DockPanel>
</Border>
`;

/** El diálogo. Se infla aparte y se abre como capa modal: no está en el árbol
 *  del panel, así que no ocupa lugar mientras no se lo pide. */
function DIALOGO(resumen) {
  return `
<Border Background="${C.superficie}" BorderBrush="${C.azul}" BorderThickness="0.004"
        CornerRadius="0.016" Padding="0.022" Width="0.62">
  <StackPanel Orientation="Vertical" Spacing="0.012">
    <TextBlock Text="¿Aplicar los cambios?" FontSize="0.032" Foreground="${C.texto}"/>
    <TextBlock Text="${resumen}" FontSize="0.022" Foreground="${C.textoTenue}"/>
    <StackPanel Orientation="Horizontal" Spacing="0.012" HorizontalAlignment="Right"
                Margin="0,0.008,0,0">
      <Button Content="Cancelar" Background="${C.superficieAlta}" Click="cancelar"/>
      <Button Content="Aplicar" Background="${C.verde}" Click="confirmar"/>
    </StackPanel>
  </StackPanel>
</Border>
`;
}

const app = new UI.Aplicacion({
  ancho: 1.25, alto: 0.92, y: 1.55,
  datos: datos,
  estilos: ESTILOS,
  manejadores: {
    cambio: function () { datos.estado = "hay cambios sin aplicar"; },

    restablecer: function (_b, app) {
      datos.calidad = 1; datos.idioma = 0; datos.antialias = 2;
      datos.brillo = 70; datos.sonido = true; datos.telemetria = false;
      datos.estado = "restablecido";
      // Cerrar todo lo abierto: un desplegable que quedara abierto seguiría
      // mostrando la opción anterior, que ya no es la elegida.
      app.cerrarCapa();
    },

    aplicar: function (_b, app) {
      const resumen = "Calidad " + OPCIONES.calidad[datos.calidad] +
                      " · " + OPCIONES.antialias[datos.antialias] +
                      " · brillo " + datos.brillo + " %";
      app.cerrarCapa();
      const arbol = UI.inflar(UI.leerMarcado(DIALOGO(resumen)), ESTILOS);
      app.dialogo = app.superponer(arbol, { modal: true, centrar: true });
    },

    cancelar: function (_b, app) {
      app.cerrarCapa(app.dialogo);
      datos.estado = "cancelado";
    },

    confirmar: function (_b, app) {
      app.cerrarCapa(app.dialogo);
      datos.estado = "aplicado";
      console.log("[ajustes] " + JSON.stringify(datos));
    },
  },
});

app.cargar(MARCADO);
app.correr();

console.log("[ajustes] " + app.ultimosTriangulos + " triangulos");
