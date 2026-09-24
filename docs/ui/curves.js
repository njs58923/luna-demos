// Curves are tessellated on invalidation; this demo has no animation loop.
const app=new UI.Aplicacion({ancho:1.65,alto:1.15,y:1.6});
app.cargar(`
<StackPanel Orientation="Horizontal" Spacing="0.06">
  <RenderPanel Width="0.78" Background="#142634" Padding="0.04" CornerRadius="0.07" Depth="0.025">
    <StackPanel Spacing="0.025">
      <TextBlock Text="Curvas vectoriales" FontSize="0.055"/>
      <TextBlock Text="Bézier cúbica: cambiar el trazado reconstruye sólo este panel." TextWrapping="Wrap" FontSize="0.032"/>
      <Path Name="wave" Data="M 0 0.12 C 0.12 -0.1 0.28 0.34 0.4 0.12 C 0.5 -0.1 0.6 0.25 0.65 0.1" Stroke="#67DFCA" StrokeThickness="0.008" Height="0.22"/>
      <Button Content="Cambiar curva" Click="cambiar" CornerRadius="0.035" Depth="0.012"/>
      <Ellipse Width="0.35" Height="0.15" Fill="#9169DA" Stroke="#E4D9FF" StrokeThickness="0.005"/>
      <TextBlock Text="Relleno con hueco (EvenOdd):" FontSize="0.03"/>
      <Path Data="M0 0 L0.3 0 L0.3 0.2 L0 0.2 Z M0.08 0.05 L0.22 0.05 L0.22 0.15 L0.08 0.15 Z" Fill="#E7BD53" Height="0.16"/>
    </StackPanel>
  </RenderPanel>
  <RenderPanel Width="0.78" Background="#28203990" Padding="0.04" CornerRadius="0.07">
    <StackPanel Spacing="0.025">
      <TextBlock Text="Recorte y contornos" FontSize="0.05"/>
      <TextBlock Text="Panel translúcido. Las filas son planas; las esquinas conservan sus curvas al cruzar el recorte." TextWrapping="Wrap" FontSize="0.033"/>
      <ScrollViewer Height="0.45"><StackPanel Spacing="0.012">
        ${Array.from({length:10},(_,i)=>`<Button Content="Fila ${i+1}" Height="0.085" CornerRadius="0.04"/>`).join('')}
      </StackPanel></ScrollViewer>
      <Path Data="M0 0.15 Q0.15 -0.12 0.3 0.15 Q0.45 0.42 0.6 0.15" Stroke="#EB96B0" StrokeThickness="0.006" Height="0.16"/>
      <TextBlock Text="Sin cambios: no se vuelve a triangular." FontSize="0.03" TextWrapping="Wrap"/>
    </StackPanel>
  </RenderPanel>
</StackPanel>`);
let alternate=false;
app.manejadores.cambiar=function(){
  alternate=!alternate;
  const path=app.buscar('wave');
  path.data=alternate?'M0 0.1 C0.1 0.4 0.5 -0.2 0.65 0.1':'M0 0.12 C0.12 -0.1 0.28 0.34 0.4 0.12 C0.5 -0.1 0.6 0.25 0.65 0.1';
  path.invalidateMeasure();
};
app.correr();
globalThis.curvesDemo=app;
