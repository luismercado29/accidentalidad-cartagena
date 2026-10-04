import { desc } from 'drizzle-orm';
import { Hexagon, Plus } from 'lucide-react';
import Link from 'next/link';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Mapa } from '@/components/mapa/Mapa';
import { Mensaje, param } from '@/components/territorio/Mensaje';
import { Encabezado, Insignia, Panel, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, puntosMapa } from '@/lib/consultas';
import { NIVEL_ALERTA } from '@/lib/etiquetas';
import { puntoEnPoligono } from '@/lib/geo';
import { requerirRol, PERMISOS } from '@/lib/sesion';
import { diaISO, paramsPeriodo, resolverPeriodo } from '@/lib/tiempo';

import { FormularioGeocerca } from './FormularioGeocerca';

export const metadata = { title: 'Geocercas' };

export default async function Geocercas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([requerirRol(PERMISOS.configurar), searchParams]);
  const periodo = resolverPeriodo(sp, '12m');
  const [cercas, puntos, anios] = await Promise.all([
    db.select().from(e.geocercas).orderBy(desc(e.geocercas.activa), e.geocercas.nombre),
    puntosMapa({ periodo }),
    aniosDisponibles(),
  ]);
  const conteos = cercas.map((g) => {
    const dentro = puntos.filter((p) => puntoEnPoligono(p.lat, p.lng, g.poligono));
    return { id: g.id, total: dentro.length, fatales: dentro.filter((p) => p.gravedad === 'fatal').length, graves: dentro.filter((p) => p.gravedad === 'grave').length };
  });
  const latLng = (g: (typeof cercas)[number]) => g.poligono.map(([lng, lat]) => [lat, lng] as [number, number]);
  const qs = paramsPeriodo(sp).toString();
  const nueva = param(sp, 'nueva') === '1';

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={`Territorio · ${periodo.etiqueta}`}
        titulo="Geocercas" destacado="y zonas especiales"
        descripcion="Polígonos para vigilar zonas de alto flujo o riesgo. Un incidente grave dentro de una geocerca activa de nivel alto o crítico genera una alerta."
        acciones={<>
          <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
          <Link href="/consola/geocercas?nueva=1#nueva" className="boton boton-primario"><Plus className="size-4" aria-hidden="true" />Nueva geocerca</Link>
        </>}
      />
      <Mensaje sp={sp} />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Mapa de geocercas" descripcion="Haz clic en una zona para ver su nombre.">
          <Mapa etiqueta="Mapa de geocercas" alto="30rem" ajustar
            capas={[{ tipo: 'poligonos', items: cercas.map((g) => ({ coords: latLng(g), color: g.activa ? g.color : '#8E8AA3', ventana: { titulo: g.nombre, lineas: [`Nivel ${NIVEL_ALERTA[g.nivel].texto.toLowerCase()}`, g.activa ? 'Activa' : 'Inactiva'], enlace: { href: `/consola/geocercas/${g.id}`, texto: 'Ver ficha' } } })) }]} />
        </Panel>
        <Panel titulo="Zonas" descripcion={`Siniestros dentro de cada zona · ${periodo.etiqueta.toLowerCase()}`}>
          {cercas.length === 0 ? <Vacio titulo="Aún no hay geocercas" icono={Hexagon}>Crea la primera dibujándola en el mapa.</Vacio> : (
            <ul className="divide-y divide-borde">
              {cercas.map((g, i) => (
                <li key={g.id} className="py-3 first:pt-0">
                  <Link href={`/consola/geocercas/${g.id}${qs ? `?${qs}` : ''}`} className="group flex items-start gap-3">
                    <span aria-hidden="true" className="mt-1.5 size-3 shrink-0 rounded-sm" style={{ background: g.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold group-hover:underline">{g.nombre}</span>
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        <Insignia tono={NIVEL_ALERTA[g.nivel].tono}>Nivel {NIVEL_ALERTA[g.nivel].texto.toLowerCase()}</Insignia>
                        {!g.activa && <Insignia>Inactiva</Insignia>}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="cifra block text-3xl">{conteos[i].total.toLocaleString('es-CO')}</span>
                      <span className="text-xs text-tinta-2">{conteos[i].fatales} fatales · {conteos[i].graves} graves</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <details id="nueva" className="tarjeta p-5" open={nueva || cercas.length === 0}>
        <summary className="cursor-pointer text-lg font-bold">Crear una geocerca</summary>
        <div className="mt-4">
          <FormularioGeocerca otras={cercas.map((g) => ({ coords: latLng(g), color: g.color, nombre: g.nombre }))} />
        </div>
      </details>
    </div>
  );
}
