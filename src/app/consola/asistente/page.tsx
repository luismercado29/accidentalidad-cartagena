import { Chat } from '@/components/asistente/Chat';
import { Encabezado } from '@/components/ui';
import { iaDisponible } from '@/lib/asistente';
import { requerirRol } from '@/lib/sesion';

export const metadata = { title: 'Asistente IA' };

export default async function AsistenteConsola() {
  await requerirRol();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Encabezado anotacion="Análisis" titulo="Asistente" destacado="de datos"
        descripcion="Pregunta en lenguaje natural por cifras, zonas y horas críticas, puntos negros, riesgo previsto, novedades en la vía o comparativos entre años. Cada cifra sale de la base de datos." />
      <section className="tarjeta p-5"><Chat iaConfigurada={iaDisponible()} /></section>
    </div>
  );
}
