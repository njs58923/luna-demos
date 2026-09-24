// panel.js — la interfaz que ejercita los controles y los enlaces.
//
// La diferencia con la primera versión es toda la gracia del asunto: **el árbol
// se arma una sola vez**. Antes, cada cambio de estado rearmaba el marcado
// entero con plantillas de cadena; ahora el marcado dice de dónde sacar cada
// valor y el código sólo toca los datos.
//
//   <Slider Value="{Binding potencia, Mode=TwoWay}"/>
//   <TextBlock Text="{Binding potencia, Format=%v %}"/>
//
// Rearmar era barato —dos milisegundos— pero perdía el estado de los controles y
// mezclaba dos idiomas en el mismo archivo. Con enlaces, el marcado es marcado.
const C = globalThis.UI_CFG.C;

/** El contexto de datos. Es el `DataContext` de WPF: el objeto contra el que se
 *  resuelve cada `{Binding}`. */
const datos = {
  encendido: false,
  potencia: 45,
  verboso: false,
  registro: "listo",

  // Derivados. Sin notificación por propiedad hay que recalcularlos a mano; es
  // el precio de no tener un sistema de observación, y a cambio no hay nada
  // mágico que pueda quedar desincronizado sin que se vea en este archivo.
  etiquetaEstado: "DETENIDO",
  colorEstado: C.rojo,
  textoBoton: "Encender",
  colorBoton: C.verde,
  salida: 0,
  salidaTexto: "0 kW",
  potenciaRedonda: 45,
};

function recomputar() {
  datos.etiquetaEstado = datos.encendido ? "EN MARCHA" : "DETENIDO";
  datos.colorEstado = datos.encendido ? C.verde : C.rojo;
  datos.textoBoton = datos.encendido ? "Detener" : "Encender";
  datos.colorBoton = datos.encendido ? C.rojo : C.verde;
  datos.potenciaRedonda = Math.round(datos.potencia);
  datos.salida = datos.encendido ? datos.potencia : 0;
  datos.salidaTexto = Math.round(datos.salida * 2.4) + " kW";
}

const MARCADO = `
<Border Background="${C.superficie}" BorderBrush="${C.borde}" BorderThickness="0.004"
        CornerRadius="0.022" Padding="0.032">
  <StackPanel Orientation="Vertical" Spacing="0.02">

    <Grid ColumnDefinitions="*,Auto" RowDefinitions="Auto">
      <TextBlock Grid.Column="0" Text="Reactor" FontSize="0.052"
                 VerticalAlignment="Center"/>
      <Border Grid.Column="1" Background="{Binding colorEstado}"
              CornerRadius="0.012" Padding="0.016,0.008" VerticalAlignment="Center">
        <TextBlock Text="{Binding etiquetaEstado}" FontSize="0.026"
                   Foreground="${C.fondo}"/>
      </Border>
    </Grid>

    <Border Background="${C.borde}" Height="0.003"/>

    <Grid ColumnDefinitions="0.26,*,0.17" RowDefinitions="Auto,Auto"
          ColumnSpacing="0.018" RowSpacing="0.018">

      <TextBlock Grid.Row="0" Grid.Column="0" Text="Potencia" FontSize="0.032"
                 Foreground="${C.textoTenue}" VerticalAlignment="Center"/>
      <Slider Grid.Row="0" Grid.Column="1" Name="potencia"
              Minimum="0" Maximum="100" Step="1"
              Value="{Binding potencia, Mode=TwoWay}"
              Foreground="${C.amarillo}" ValueChanged="cambio"
              VerticalAlignment="Center"/>
      <TextBlock Grid.Row="0" Grid.Column="2"
                 Text="{Binding potenciaRedonda, Format=%v %}"
                 FontSize="0.032" Foreground="${C.amarillo}"
                 TextAlignment="Right" VerticalAlignment="Center"/>

      <TextBlock Grid.Row="1" Grid.Column="0" Text="Salida" FontSize="0.032"
                 Foreground="${C.textoTenue}" VerticalAlignment="Center"/>
      <ProgressBar Grid.Row="1" Grid.Column="1" Minimum="0" Maximum="100"
                   Value="{Binding salida}" Foreground="${C.cian}"
                   Height="0.02" VerticalAlignment="Center"/>
      <TextBlock Grid.Row="1" Grid.Column="2" Text="{Binding salidaTexto}"
                 FontSize="0.028" Foreground="${C.cian}"
                 TextAlignment="Right" VerticalAlignment="Center"/>
    </Grid>

    <CheckBox Content="Registro detallado"
              IsChecked="{Binding verboso, Mode=TwoWay}"
              Changed="cambio" Accent="${C.violeta}" FontSize="0.03"/>

    <StackPanel Orientation="Horizontal" Spacing="0.016">
      <Button Content="{Binding textoBoton}" Background="{Binding colorBoton}"
              Click="alternar" Foreground="${C.fondo}" FontSize="0.034"/>
      <Button Content="Purgar" Click="purgar" Background="${C.naranja}"
              Foreground="${C.fondo}" FontSize="0.034"/>
      <Button Content="Calibrar" Click="calibrar" Background="${C.azul}"
              IsEnabled="{Binding encendido}" FontSize="0.034"/>
    </StackPanel>

    <Border Background="${C.fondo}" CornerRadius="0.01" Padding="0.014">
      <TextBlock Text="{Binding registro}" FontSize="0.026"
                 Foreground="${C.textoTenue}"/>
    </Border>

  </StackPanel>
</Border>
`;

function anotar(texto) {
  datos.registro = texto;
  recomputar();
  app.invalidar();
}

const app = new UI.Aplicacion({
  ancho: 1.3,
  alto: 0.9,
  y: 1.58,
  datos: datos,
  manejadores: {
    alternar: function () {
      datos.encendido = !datos.encendido;
      anotar(datos.encendido ? "reactor en marcha" : "reactor detenido");
    },
    purgar: function () {
      datos.potencia = 0;
      anotar("purga completa, potencia a cero");
    },
    calibrar: function () {
      anotar("calibrado a " + Math.round(datos.potencia) + " %");
    },
    // Un solo manejador para el deslizador y la casilla: el enlace TwoWay ya
    // escribió el dato antes de llamar, así que acá sólo queda recomputar los
    // derivados y anotar. Es la forma de la que se dan cuenta los enlaces.
    cambio: function () {
      recomputar();
      anotar(datos.verboso
        ? "potencia " + Math.round(datos.potencia) + " %, registro detallado"
        : "potencia " + Math.round(datos.potencia) + " %");
    },
  },
});

recomputar();
app.cargar(MARCADO);
app.correr();

requestAnimationFrame(function () {
  console.log("[panel] " + app.ultimosTriangulos + " triangulos, " +
              app.textos.items.length + " textos, " +
              app.blancos.items.length + " blancos, " +
              app.ultimoCosto + " ms");
});
