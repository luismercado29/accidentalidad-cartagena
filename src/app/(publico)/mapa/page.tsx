import { VistaMapa } from '@/components/mapa/vista-mapa';

export const metadata = { title: 'Mapa de calor', description: 'Dónde se concentran los siniestros viales de Cartagena, filtrados por periodo, gravedad, tipo de vehículo y hora.' };

export default async function MapaPublico({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="contenedor py-10">
      <header className="mb-8 max-w-3xl">
        <p className="anotacion text-tinta-3">Datos verificados · actualización continua</p>
        <h1 className="titular mt-3">Dónde <span className="serif text-marca">duele</span> la vía.</h1>
        <p className="mt-4 text-lg text-tinta-2">
          Cada punto es un siniestro registrado en Cartagena. Filtra por periodo (incluso años anteriores), gravedad, vehículo y hora,
          y activa las capas de puntos negros y novedades en la vía.
        </p>
      </header>
      <VistaMapa sp={sp} equipo={false} />
    </div>
  );
}
