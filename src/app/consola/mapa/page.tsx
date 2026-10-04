import { VistaMapa } from '@/components/mapa/vista-mapa';
import { Encabezado } from '@/components/ui';
import { requerirRol } from '@/lib/sesion';

export const metadata = { title: 'Mapa de calor' };

export default async function MapaConsola({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([requerirRol(), searchParams]);
  return (
    <div className="space-y-6">
      <Encabezado anotacion="Análisis territorial" titulo="Mapa de" destacado="calor"
        descripcion="Concentración de siniestros con capas operativas: incidentes en curso, cámaras, geocercas, puntos negros y novedades en la vía." />
      <VistaMapa sp={sp} equipo />
    </div>
  );
}
