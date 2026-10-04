import { and, count, desc, eq, inArray, notInArray, type SQL } from 'drizzle-orm';
import { Plus, Siren } from 'lucide-react';
import Link from 'next/link';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Mapa } from '@/components/mapa/Mapa';
import { COLOR_PRIORIDAD, calcularSla, minutosTexto } from '@/components/operacion/sla';
import { Encabezado, Insignia, Panel, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { ESTADOS_INCIDENTE, PRIORIDADES, type EstadoIncidente, type Prioridad } from '@/db/esquema';
import { aniosDisponibles, enPeriodo } from '@/lib/consultas';
import { ESTADO_INCIDENTE, PRIORIDAD } from '@/lib/etiquetas';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { diaISO, formatoFechaHora, hace, paramsPeriodo, resolverPeriodo } from '@/lib/tiempo';

export const metadata = { title: 'Incidentes' };

const ACTIVOS: EstadoIncidente[] = ['abierto', 'despachado', 'en_sitio', 'controlado'];
const POR_PAGINA = 40;

type SP = Record<string, string | string[] | undefined>;
const uno = (sp: SP, k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v)?.trim() || null; };

export default async function Incidentes({ searchParams }: { searchParams: Promise<SP> }) {
  await requerirRol(PERMISOS.operar);
  const sp = await searchParams;
  const pestana = uno(sp, 'vista') === 'historial' ? 'historial' : 'curso';
  const periodo = resolverPeriodo(sp, '7d');
  const prioridad = PRIORIDADES.includes(uno(sp, 'prioridad') as Prioridad) ? (uno(sp, 'prioridad') as Prioridad) : null;
  const estado = ESTADOS_INCIDENTE.includes(uno(sp, 'estado') as EstadoIncidente) ? (uno(sp, 'estado') as EstadoIncidente) : null;
  const barrio = uno(sp, 'barrio')?.slice(0, 80) ?? null;
  const pagina = Math.max(1, Number(uno(sp, 'pagina')) || 1);

  const filtros: (SQL | undefined)[] = [
    pestana === 'curso' ? inArray(e.incidentes.estado, ACTIVOS) : and(notInArray(e.incidentes.estado, ACTIVOS), enPeriodo(e.incidentes.abiertoEn, periodo)),
    prioridad ? eq(e.incidentes.prioridad, prioridad) : undefined,
    estado ? eq(e.incidentes.estado, estado) : undefined,
    barrio ? eq(e.incidentes.barrio, barrio) : undefined,
  ];
  const donde = and(...filtros);

  const [lista, [{ total }], enCurso, [{ historial }], barrios, anios] = await Promise.all([
    db.select().from(e.incidentes).where(donde).orderBy(desc(e.incidentes.abiertoEn)).limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA),
    db.select({ total: count() }).from(e.incidentes).where(donde),
    db.select({ n: count() }).from(e.incidentes).where(inArray(e.incidentes.estado, ACTIVOS)),
    db.select({ historial: count() }).from(e.incidentes).where(and(notInArray(e.incidentes.estado, ACTIVOS), enPeriodo(e.incidentes.abiertoEn, periodo))),
    db.selectDistinct({ barrio: e.incidentes.barrio }).from(e.incidentes).orderBy(e.incidentes.barrio),
    aniosDisponibles(),
  ]);
  const ahora = new Date();
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const enlace = (cambios: Record<string, string | null>) => {
    const u = paramsPeriodo(sp);
    for (const k of ['vista', 'prioridad', 'estado', 'barrio']) { const v = uno(sp, k); if (v) u.set(k, v); }
    for (const [k, v] of Object.entries(cambios)) { if (v) u.set(k, v); else u.delete(k); }
    return `/consola/incidentes?${u.toString()}`;
  };
  const estadosVisibles = pestana === 'curso' ? ACTIVOS : (['cerrado', 'cancelado'] as EstadoIncidente[]);

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={pestana === 'curso' ? 'Operación en vivo' : `Historial · ${periodo.etiqueta}`}
        titulo="Incidentes" destacado="en la vía"
        descripcion="Cada siniestro en atención, desde que se abre hasta que la vía queda despejada. El tiempo se compara con el máximo de llegada según la prioridad."
        acciones={<Link href="/consola/incidentes/nuevo" className="boton boton-primario"><Plus className="size-4" aria-hidden="true" />Nuevo incidente</Link>}
      />

      <nav aria-label="Vista de incidentes" className="flex flex-wrap items-end justify-between gap-4 border-b border-borde">
        <ul className="flex gap-1">
          {[['curso', `En curso (${enCurso[0].n})`], ['historial', `Historial (${historial})`]].map(([v, t]) => (
            <li key={v}>
              <Link href={enlace({ vista: v === 'curso' ? null : v, estado: null, pagina: null })} aria-current={pestana === v ? 'page' : undefined}
                className={`-mb-px inline-flex min-h-11 items-center border-b-[3px] px-4 font-semibold ${pestana === v ? 'border-marca text-tinta' : 'border-transparent text-tinta-2 hover:text-tinta'}`}>{t}</Link>
            </li>
          ))}
        </ul>
        {pestana === 'historial' && (
          <div className="pb-3">
            <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
          </div>
        )}
      </nav>

      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtros de incidentes">
        {pestana === 'historial' && <input type="hidden" name="vista" value="historial" />}
        {[...paramsPeriodo(sp).entries()].map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <label className="text-sm font-semibold text-tinta-2">Prioridad
          <select name="prioridad" defaultValue={prioridad ?? ''} className="campo mt-1 min-h-10 py-1.5 font-normal text-tinta">
            <option value="">Todas</option>
            {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDAD[p].texto}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-tinta-2">Estado
          <select name="estado" defaultValue={estado ?? ''} className="campo mt-1 min-h-10 py-1.5 font-normal text-tinta">
            <option value="">Todos</option>
            {estadosVisibles.map((s) => <option key={s} value={s}>{ESTADO_INCIDENTE[s].texto}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-tinta-2">Barrio
          <select name="barrio" defaultValue={barrio ?? ''} className="campo mt-1 min-h-10 py-1.5 font-normal text-tinta">
            <option value="">Todos</option>
            {barrios.filter((b) => b.barrio).map((b) => <option key={b.barrio} value={b.barrio!}>{b.barrio}</option>)}
          </select>
        </label>
        <button type="submit" className="boton boton-secundario boton-chico min-h-10">Filtrar</button>
        {(prioridad || estado || barrio) && <Link href={enlace({ prioridad: null, estado: null, barrio: null, pagina: null })} className="boton boton-fantasma boton-chico min-h-10">Quitar filtros</Link>}
      </form>

      {pestana === 'curso' && (
        <p className="text-sm text-tinta-2">En curso se muestran todos los incidentes abiertos, sin importar la fecha. Usa el historial para buscar por periodo.</p>
      )}

      {lista.length === 0 ? (
        <Vacio titulo={pestana === 'curso' ? 'No hay incidentes en curso' : 'No hay incidentes en este periodo'} icono={Siren}>
          {pestana === 'curso' ? 'Cuando entre un reporte grave o abras uno nuevo, aparecerá aquí.' : 'Prueba con otro periodo o quita los filtros.'}
        </Vacio>
      ) : (
        <div className={pestana === 'curso' ? 'grid gap-6 xl:grid-cols-[1.5fr_1fr]' : ''}>
          <div className="tarjeta overflow-x-auto p-0" tabIndex={0}>
            <table className="tabla min-w-[760px]">
              <caption className="sr-only">Incidentes {pestana === 'curso' ? 'en curso' : `del historial, ${periodo.etiqueta}`}: {total}</caption>
              <thead>
                <tr>
                  <th scope="col">Incidente</th>
                  <th scope="col">Prioridad</th>
                  <th scope="col">Estado</th>
                  <th scope="col">{pestana === 'curso' ? 'Tiempo / máximo' : 'Llegada'}</th>
                  <th scope="col">Apertura</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => {
                  const sla = calcularSla(i, ahora);
                  return (
                    <tr key={i.id}>
                      <td>
                        <Link href={`/consola/incidentes/${i.id}`} className="font-semibold text-marca hover:underline">{i.titulo}</Link>
                        <span className="anotacion block text-tinta-3">{i.codigo} · {i.barrio ?? 'Sin barrio'}{i.simulado ? ' · simulado' : ''}</span>
                      </td>
                      <td><Insignia tono={PRIORIDAD[i.prioridad].tono}>{PRIORIDAD[i.prioridad].texto}</Insignia></td>
                      <td><Insignia tono={ESTADO_INCIDENTE[i.estado].tono} punto={false}>{ESTADO_INCIDENTE[i.estado].texto}</Insignia></td>
                      <td className="tabular">
                        {sla.aplica ? (
                          <span className="flex flex-col items-start gap-1">
                            <span>{minutosTexto(sla.minutos)} / {i.slaMin} min{!sla.llego && pestana === 'curso' && ' · sin llegar'}</span>
                            {sla.fuera ? <Insignia tono="peligro">Fuera de tiempo</Insignia> : sla.llego ? <Insignia tono="ok">A tiempo</Insignia> : null}
                          </span>
                        ) : <span className="text-tinta-2">No aplica</span>}
                      </td>
                      <td className="whitespace-nowrap text-sm"><span title={formatoFechaHora(i.abiertoEn)}>{pestana === 'curso' ? hace(i.abiertoEn, ahora) : formatoFechaHora(i.abiertoEn)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {paginas > 1 && (
              <nav aria-label="Paginación" className="flex items-center justify-between gap-3 border-t border-borde px-4 py-3 text-sm">
                <span className="text-tinta-2">Página {pagina} de {paginas} · {total.toLocaleString('es-CO')} incidentes</span>
                <span className="flex gap-2">
                  {pagina > 1 && <Link className="boton boton-secundario boton-chico" href={enlace({ pagina: String(pagina - 1) })}>Anterior</Link>}
                  {pagina < paginas && <Link className="boton boton-secundario boton-chico" href={enlace({ pagina: String(pagina + 1) })}>Siguiente</Link>}
                </span>
              </nav>
            )}
          </div>

          {pestana === 'curso' && (
            <Panel titulo="Mapa de incidentes en curso" descripcion="El color indica la prioridad; la tabla tiene la misma información.">
              <Mapa etiqueta="Mapa de incidentes en curso" alto="26rem" ajustar
                capas={[{
                  tipo: 'marcadores',
                  items: lista.map((i) => ({
                    lat: i.lat, lng: i.lng, icono: 'incidente' as const, etiqueta: `${i.codigo}: ${i.titulo}`, color: COLOR_PRIORIDAD[i.prioridad],
                    pulso: i.estado === 'abierto',
                    ventana: { titulo: i.titulo, lineas: [`${i.codigo} · ${PRIORIDAD[i.prioridad].texto}`, ESTADO_INCIDENTE[i.estado].texto, i.barrio ?? ''], enlace: { href: `/consola/incidentes/${i.id}`, texto: 'Abrir ficha' } },
                  })),
                }]} />
              <ul className="mt-3 flex flex-wrap gap-3 text-sm text-tinta-2">
                {PRIORIDADES.map((p) => <li key={p} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: COLOR_PRIORIDAD[p] }} />{PRIORIDAD[p].texto}</li>)}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
