// Independent geometry boundaries. No animation loop and no per-frame data updates.
const app=new UI.Aplicacion({ancho:1.65,alto:0.95,y:1.5});
app.cargar(`
<StackPanel Orientation="Horizontal" Spacing="0.06">
  <RenderPanel Name="left" Width="0.78" Background="#142634" Padding="0.035" CornerRadius="0.03" Depth="0.025">
    <StackPanel Spacing="0.025">
      <TextBlock Text="Panel independiente" FontSize="0.055"/>
      <TextBlock Text="Este botón tiene volumen real. Miralo de costado." TextWrapping="Wrap" FontSize="0.035"/>
      <Button Name="raised" Content="Elevar / bajar" Click="elevar" Depth="0.03" Elevation="0.015" CornerRadius="0.02"/>
      <TextBlock Text="El texto se corta por glifo:" FontSize="0.03"/>
      <ScrollViewer Height="0.25">
        <TextBlock Text="MMMM iiiii — áéíóú. Una malla de texto comparte glifos, conserva sus métricas y se recorta al cruzar el borde. Este párrafo permite comprobar el scroll, la línea de base y las esquinas del panel sin crear un nodo por cada letra." TextWrapping="Wrap" FontSize="0.047"/>
      </ScrollViewer>
    </StackPanel>
  </RenderPanel>
  <RenderPanel Name="right" Width="0.78" Background="#282039B0" Padding="0.035" CornerRadius="0.03" Depth="0.04" Elevation="0.025">
    <StackPanel Spacing="0.03">
      <TextBlock Text="Panel vecino" FontSize="0.055"/>
      <TextBlock Text="El hover del panel izquierdo conserva esta geometría." TextWrapping="Wrap" FontSize="0.036"/>
      <Button Name="count" Content="Contador: 0" Click="contar" Depth="0.015" ToolTip="El tooltip usa un timer puntual."/>
      <ComboBox Items="Bajo;Medio;Alto" Depth="0.02"/>
      <TextBlock Text="UI quieta: ningún RAF pendiente." TextWrapping="Wrap" FontSize="0.035"/>
    </StackPanel>
  </RenderPanel>
</StackPanel>`);
let count=0;
app.manejadores.elevar=function(button){button.elevation=button.elevation>0.04?0.015:0.08;button.invalidateRender();};
app.manejadores.contar=function(button){button.contenido='Contador: '+(++count);button.invalidateMeasure();};
app.correr();
globalThis.retainedDemo=app;
