import { MapaExplorador } from '@/components/mapa/MapaExplorador';
import { aniosDisponibles, leerFiltros } from '@/lib/consultas';
import { cargarDatosMapa } from '@/lib/mapa-datos';
import { diaISO } from '@/lib/tiempo';

/** Carga los datos en el servidor y monta el explorador (publico o consola). */
export async function VistaMapa({ sp, equipo }: { sp: Record<string, string | string[] | undefined>; equipo: boolean }) {
  const [{ periodo, ...datos }, anios] = await Promise.all([cargarDatosMapa(sp, equipo), aniosDisponibles()]);
  const f = leerFiltros(sp);
  const franja = Array.isArray(sp.franja) ? sp.franja[0] : sp.franja;
  return (
    <MapaExplorador
      datos={datos}
      equipo={equipo}
      filtros={{ gravedad: f.gravedad, clase: f.clase, vehiculo: f.vehiculo, franja: franja ?? null }}
      tiempo={{ actual: periodo.clave, etiqueta: periodo.etiqueta, anios, desde: periodo.desde ? diaISO(periodo.desde) : undefined, hasta: diaISO(new Date(periodo.hasta.getTime() - 1)) }}
    />
  );
}
