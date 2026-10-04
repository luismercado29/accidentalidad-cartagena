import { and, desc, eq, gte, isNull, lt, or, type SQL } from 'drizzle-orm';
import { Construction, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { alternarNovedad, eliminarNovedad, guardarNovedad } from '@/app/acciones/territorio';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BotonEnviar } from '@/components/formulario';
import { Mapa } from '@/components/mapa/Mapa';
import { Mensaje, param } from '@/components/territorio/Mensaje';
import { SelectorPunto } from '@/components/territorio/SelectorPunto';
import { Encabezado, Insignia, Panel, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles } from '@/lib/consultas';
import { NOVEDAD } from '@/lib/etiquetas';
import { requerirRol, PERMISOS } from '@/lib/sesion';
import { diaISO, formatoFecha, paramsPeriodo, resolverPeriodo } from '@/lib/tiempo';

export const metadata = { title: 'Novedades en la vía' };

const COLOR: Record<string, string> = { obra: '#B45309', cierre: '#B42318', semaforo_danado: '#7A1010', hueco: '#8A4B06', inundacion: '#2437C7', evento: '#4F2BD9', otro: '#4A475C' };

export default async function Novedades({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([requerirRol(PERMISOS.operar), searchParams]);
  const periodo = resolverPeriodo(sp, '90d');
  const ahora = new Date();
  const estado = param(sp, 'estado') ?? 'todas';
  const tipo = param(sp, 'tipo');

  // Vigentes en algun momento del periodo: empezaron antes de su fin y no terminaron antes de su inicio.
  const cond: (SQL | undefined)[] = [lt(e.novedadesVia.desde, periodo.hasta)];
  if (periodo.desde) cond.push(or(isNull(e.novedadesVia.hasta), gte(e.novedadesVia.hasta, periodo.desde)));
  if (tipo && tipo in NOVEDAD) cond.push(eq(e.novedadesVia.tipo, tipo as never));
  const vigente = and(eq(e.novedadesVia.activa, true), or(isNull(e.novedadesVia.hasta), gte(e.novedadesVia.hasta, ahora)));
  if (estado === 'vigentes') cond.push(vigente);

  const [lista, activas, anios] = await Promise.all([
    db.select().from(e.novedadesVia).where(and(...cond)).orderBy(desc(e.novedadesVia.desde)).limit(200),
    db.select().from(e.novedadesVia).where(vigente),
    aniosDisponibles(),
  ]);
  const esVigente = (n: (typeof lista)[number]) => n.activa && (!n.hasta || n.hasta >= ahora);
  const filtradas = estado === 'finalizadas' ? lista.filter((n) => !esVigente(n)) : lista;
  const editarId = Number(param(sp, 'editar')) || null;
  const editando = editarId ? lista.find((n) => n.id === editarId) ?? (await db.query.novedadesVia.findFirst({ where: eq(e.novedadesVia.id, editarId) })) : undefined;
  const mostrar = param(sp, 'nueva') === '1' || !!editando;
  const qs = paramsPeriodo(sp);
  const enlace = (extra: Record<string, string>) => {
    const u = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(extra)) if (v) u.set(k, v); else u.delete(k);
    return `/consola/novedades?${u.toString()}`;
  };

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={`Territorio · ${periodo.etiqueta}`}
        titulo="Novedades" destacado="en la vía"
        descripcion={`Obras, cierres, semáforos dañados, huecos e inundaciones. Las vigentes (${activas.length}) se muestran en el mapa público y en la ruta segura.`}
        acciones={<>
          <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
          <Link href={`${enlace({ nueva: '1' })}#formulario`} className="boton boton-primario"><Plus className="size-4" aria-hidden="true" />Nueva novedad</Link>
        </>}
      />
      <Mensaje sp={sp} />

      {mostrar && (
        <Panel titulo={editando ? `Editar «${editando.titulo}»` : 'Publicar una novedad'}>
          <form id="formulario" action={guardarNovedad} className="grid gap-4 lg:grid-cols-2">
            {editando && <input type="hidden" name="id" value={editando.id} />}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="nv-tipo" className="block font-semibold">Tipo</label>
                <select id="nv-tipo" name="tipo" className="campo" defaultValue={editando?.tipo ?? 'obra'}>
                  {Object.entries(NOVEDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nv-titulo" className="block font-semibold">Título <span aria-hidden="true" className="text-error">*</span></label>
                <input id="nv-titulo" name="titulo" className="campo" required minLength={3} maxLength={140} defaultValue={editando?.titulo} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="nv-desc" className="block font-semibold">Descripción y desvíos</label>
                <textarea id="nv-desc" name="descripcion" className="campo" rows={3} maxLength={800} defaultValue={editando?.descripcion ?? ''} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="nv-desde" className="block font-semibold">Desde</label>
                  <input id="nv-desde" name="desde" type="date" className="campo" defaultValue={editando ? diaISO(editando.desde) : diaISO(ahora)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="nv-hasta" className="block font-semibold">Hasta</label>
                  <input id="nv-hasta" name="hasta" type="date" className="campo" defaultValue={editando?.hasta ? diaISO(editando.hasta) : ''} aria-describedby="nv-hasta-ayuda" />
                  <p id="nv-hasta-ayuda" className="text-sm text-tinta-2">Vacío si no tiene fecha de fin.</p>
                </div>
              </div>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="activa" defaultChecked={editando?.activa ?? true} className="size-5 accent-marca" /> Publicada
              </label>
              <div className="flex flex-wrap gap-2">
                <BotonEnviar pendiente="Guardando…">{editando ? 'Guardar cambios' : 'Publicar'}</BotonEnviar>
                <Link href={enlace({})} className="boton boton-secundario">Cancelar</Link>
              </div>
            </div>
            <SelectorPunto lat={editando?.lat} lng={editando?.lng} icono="novedad" color={COLOR[editando?.tipo ?? 'obra']} />
          </form>
        </Panel>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Panel titulo="Vigentes ahora" descripcion="Lo que ve la ciudadanía en el mapa">
          <Mapa etiqueta="Mapa de novedades vigentes en la vía" alto="30rem" ajustar={activas.length > 1}
            capas={[{ tipo: 'marcadores', items: activas.map((n) => ({ lat: n.lat, lng: n.lng, icono: 'novedad' as const, color: COLOR[n.tipo], etiqueta: n.titulo, ventana: { titulo: n.titulo, lineas: [NOVEDAD[n.tipo], n.descripcion ?? '', n.hasta ? `Hasta ${formatoFecha(n.hasta)}` : 'Sin fecha de fin'] } })) }]} />
        </Panel>
        <Panel titulo="Historial" descripcion={`${filtradas.length} novedades en el periodo`}
          acciones={
            <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
              {[['todas', 'Todas'], ['vigentes', 'Vigentes'], ['finalizadas', 'Finalizadas']].map(([k, t]) => (
                <Link key={k} href={enlace({ estado: k === 'todas' ? '' : k, ...(tipo ? { tipo } : {}) })} aria-current={estado === k ? 'page' : undefined}
                  className={`boton boton-chico ${estado === k ? 'boton-primario' : 'boton-secundario'}`}>{t}</Link>
              ))}
            </nav>
          }>
          {filtradas.length === 0 ? <Vacio titulo="Sin novedades en el periodo" icono={Construction} /> : (
            <ul className="divide-y divide-borde">
              {filtradas.map((n) => (
                <li key={n.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
                  <span aria-hidden="true" className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: COLOR[n.tipo] }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{n.titulo}</p>
                    <p className="text-sm text-tinta-2">{NOVEDAD[n.tipo]} · {formatoFecha(n.desde)}{n.hasta ? ` – ${formatoFecha(n.hasta)}` : ' · sin fecha de fin'}</p>
                    {n.descripcion && <p className="mt-1 text-sm">{n.descripcion}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Insignia tono={esVigente(n) ? 'aviso' : 'neutro'}>{esVigente(n) ? 'Vigente' : 'Finalizada'}</Insignia>
                    <form action={alternarNovedad}>
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="activa" value={n.activa ? '0' : '1'} />
                      <button type="submit" className="boton boton-fantasma boton-chico">{n.activa ? 'Finalizar' : 'Reactivar'}<span className="sr-only">: {n.titulo}</span></button>
                    </form>
                    <Link href={`${enlace({ editar: String(n.id) })}#formulario`} className="boton boton-fantasma boton-chico px-2" aria-label={`Editar ${n.titulo}`}><Pencil className="size-4" aria-hidden="true" /></Link>
                    <form action={eliminarNovedad}>
                      <input type="hidden" name="id" value={n.id} />
                      <button type="submit" className="boton boton-fantasma boton-chico px-2 text-error" aria-label={`Eliminar ${n.titulo}`}><Trash2 className="size-4" aria-hidden="true" /></button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
