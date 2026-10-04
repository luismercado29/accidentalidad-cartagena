import { asc } from 'drizzle-orm';
import { CircleDot } from 'lucide-react';
import Link from 'next/link';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Mapa } from '@/components/mapa/Mapa';
import { Encabezado, Insignia, Panel, Vacio, numero } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { PESO_EPDO } from '@/lib/analitica/puntos-negros';
import { aniosDisponibles } from '@/lib/consultas';
import { GRAVEDAD, INTERVENCION } from '@/lib/etiquetas';
import { puede, requerirRol, PERMISOS } from '@/lib/sesion';
import { diaISO, formatoFechaHora, resolverPeriodo } from '@/lib/tiempo';

import { FormRecalculo } from './Formularios';

export const metadata = { title: 'Puntos negros' };

const COLOR_INTERVENCION: Record<string, string> = { sin_intervenir: '#B42318', en_estudio: '#B45309', en_intervencion: '#2437C7', intervenido: '#15803D' };

export default async function PuntosNegros({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [usuario, sp] = await Promise.all([requerirRol(PERMISOS.analizar), searchParams]);
  const periodo = resolverPeriodo(sp, '12m');
  const [puntos, anios] = await Promise.all([
    db.select().from(e.puntosNegros).orderBy(asc(e.puntosNegros.ranking)),
    aniosDisponibles(),
  ]);
  const calculado = puntos[0]?.calculadoEn;
  const porEstado = Object.keys(INTERVENCION).map((k) => ({ k, n: puntos.filter((p) => p.estadoIntervencion === k).length }));

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={calculado ? `Último cálculo: ${formatoFechaHora(calculado)}` : 'Sin cálculo'}
        titulo="Puntos"
        destacado="negros"
        descripcion="Sitios donde los siniestros se agrupan, ordenados por el índice de daños equivalentes (EPDO). Cada punto se puede seguir hasta su intervención."
      />

      {puede(usuario, 'analizar') && (
        <Panel titulo="Recalcular" descripcion="Elige el periodo de análisis y los parámetros de agrupación (DBSCAN). El estado de intervención y las notas se conservan en los sitios que coinciden.">
          <div className="space-y-4">
            <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios}
              desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
            <FormRecalculo periodo={periodo.clave} desde={typeof sp.desde === 'string' ? sp.desde : undefined} hasta={typeof sp.hasta === 'string' ? sp.hasta : undefined} />
          </div>
        </Panel>
      )}

      {puntos.length === 0 ? (
        <Vacio titulo="Aún no hay puntos negros calculados" icono={CircleDot}>Usa «Recalcular» con un periodo que tenga suficientes siniestros.</Vacio>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {porEstado.map(({ k, n }) => (
              <div key={k} className="tarjeta p-5">
                <p className="text-sm font-semibold text-tinta-2">{INTERVENCION[k].texto}</p>
                <p className="cifra mt-2 text-5xl">{n}</p>
              </div>
            ))}
          </div>

          <Panel titulo="Mapa" descripcion="El círculo marca el radio del grupo; el color indica el estado de intervención.">
            <Mapa etiqueta="Mapa de puntos negros" alto="26rem" ajustar
              capas={[{
                tipo: 'circulos',
                items: puntos.map((p) => ({
                  lat: p.lat, lng: p.lng, radioM: p.radioM, color: COLOR_INTERVENCION[p.estadoIntervencion], relleno: 0.25,
                  ventana: { titulo: `#${p.ranking} · ${p.nombre}`, lineas: [`${p.total} siniestros · ${p.fatales} fatales · ${p.graves} graves`, `Índice EPDO: ${numero(p.indice)}`, INTERVENCION[p.estadoIntervencion].texto], enlace: { href: `/consola/puntos-negros/${p.id}`, texto: 'Ver ficha' } },
                })),
              }]} />
            <ul className="mt-3 flex flex-wrap gap-4 text-sm text-tinta-2">
              {Object.entries(INTERVENCION).map(([k, v]) => (
                <li key={k} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: COLOR_INTERVENCION[k] }} />{v.texto}</li>
              ))}
            </ul>
          </Panel>

          <Panel titulo="Ranking" descripcion={`${puntos.length} sitios`}>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="tabla">
                <caption className="sr-only">Ranking de puntos negros por índice EPDO</caption>
                <thead>
                  <tr>
                    <th scope="col" className="num">#</th>
                    <th scope="col">Sitio</th>
                    <th scope="col" className="num">Siniestros</th>
                    <th scope="col" className="num">Fatales</th>
                    <th scope="col" className="num">Graves</th>
                    <th scope="col" className="num">Índice EPDO</th>
                    <th scope="col" className="num">Radio</th>
                    <th scope="col">Intervención</th>
                  </tr>
                </thead>
                <tbody>
                  {puntos.map((p) => (
                    <tr key={p.id}>
                      <td className="num font-semibold">{p.ranking}</td>
                      <td>
                        <Link href={`/consola/puntos-negros/${p.id}`} className="font-semibold text-marca hover:underline">{p.nombre}</Link>
                        <span className="block text-sm text-tinta-2">{p.barrio}</span>
                      </td>
                      <td className="num">{p.total}</td>
                      <td className="num">{p.fatales}</td>
                      <td className="num">{p.graves}</td>
                      <td className="num font-semibold">{numero(p.indice)}</td>
                      <td className="num">{p.radioM} m</td>
                      <td><Insignia tono={INTERVENCION[p.estadoIntervencion].tono}>{INTERVENCION[p.estadoIntervencion].texto}</Insignia></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}

      <Panel titulo="¿Qué es el índice EPDO?">
        <div className="max-w-3xl space-y-3 text-tinta-2">
          <p>
            EPDO significa <em>daños materiales equivalentes</em>. En vez de contar todos los siniestros igual, cada uno pesa según su gravedad,
            para que un sitio con víctimas fatales no quede por debajo de uno con muchos choques simples.
          </p>
          <ul className="flex flex-wrap gap-2">
            {(Object.keys(PESO_EPDO) as (keyof typeof PESO_EPDO)[]).map((g) => (
              <li key={g} className="insignia" style={{ background: GRAVEDAD[g].fondo, color: GRAVEDAD[g].color }}>{GRAVEDAD[g].texto}: × {PESO_EPDO[g]}</li>
            ))}
          </ul>
          <p>
            Los grupos se detectan con DBSCAN: un sitio es punto negro cuando reúne al menos el mínimo de siniestros elegido a menos del radio indicado entre sí.
            Los siniestros aislados no forman grupo.
          </p>
        </div>
      </Panel>
    </div>
  );
}
