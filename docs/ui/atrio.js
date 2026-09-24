// atrio.js — el índice de las seis salas.
//
// Dos mitades que no se tocan:
//
//   1. **El cartel**, armado con el framework. Es el mismo `ItemsControl` con
//      plantilla que usa la lista de equipos, sobre seis filas en vez de mil.
//      Sirve de prueba: si el índice del proyecto no se pudiera escribir con lo
//      que el framework ya tiene, sería una mala señal sobre el framework.
//
//   2. **Las puertas**, que son includes y no controles. Ya no pasan por acá:
//      cada una navega sola con `hiperspace.world.navigate`, con el destino que
//      le escribe `atrio.ts` en las props. Este script no las toca.
//
// El cartel va **arriba del arco**, como la marquesina de un teatro. Probado
// primero a la altura de los ojos y a dos metros: ahí tapa la puerta del medio,
// porque un panel de 1,20 m a 2,5 m de distancia cubre 27° y una puerta a 7,5 m
// cubre 18°. Cualquier cartel puesto enfrente tapa algo. Arriba no tapa nada, y
// es donde un atrio pone sus letreros de todos modos.
//
// A 6,5 m los tamaños son otros: lo que a media distancia es un título de 4 cm
// acá son 11. El framework no escala nada solo — mide en metros y los metros son
// los del mundo.
const C = globalThis.UI_CFG.C;
const ESCENAS = (globalThis.APP && globalThis.APP.escenas) || [];

// ── El cartel ───────────────────────────────────────────────────────────────

const PLANTILLA = `
<Border Background="${C.superficie}" CornerRadius="0.02" Padding="0.03,0.022">
  <Grid ColumnDefinitions="0.12,*" ColumnSpacing="0.03">
    <Border Grid.Column="0" Background="{Binding color}" CornerRadius="0.01"
            Width="0.08" Height="0.08" VerticalAlignment="Center"/>
    <StackPanel Grid.Column="1" Orientation="Vertical" Spacing="0.006">
      <TextBlock Text="{Binding titulo}" FontSize="0.07" Foreground="${C.texto}"/>
      <TextBlock Text="{Binding muestra}" FontSize="0.048" Foreground="${C.textoTenue}"/>
    </StackPanel>
  </Grid>
</Border>
`;

const MARCADO = `
<Border Background="${C.fondo}" BorderBrush="${C.borde}" BorderThickness="0.01"
        CornerRadius="0.05" Padding="0.06">
  <StackPanel Orientation="Vertical" Spacing="0.03">
    <TextBlock Text="Atrio de interfaces" FontSize="0.115" Foreground="${C.texto}"/>
    <TextBlock Text="{Binding pie}" FontSize="0.052" Foreground="${C.textoTenue}"
               Margin="0,0,0,0.014"/>
    <ItemsControl ItemsSource="{Binding escenas}" ItemTemplate="fila" Spacing="0.014"/>
  </StackPanel>
</Border>
`;

const datos = {
  escenas: ESCENAS,
  pie: ESCENAS.length + " salas · tocá un arco para entrar",
};

const app = new UI.Aplicacion({
  ancho: 3.4, alto: 2.1, y: 5.5, z: -6.5,
  datos: datos,
  plantillas: { fila: PLANTILLA },
});

app.cargar(MARCADO);
app.correr();
