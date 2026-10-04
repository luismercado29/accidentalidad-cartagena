import { asc, desc, eq } from 'drizzle-orm';
import { ArrowLeft, Clock, MapPin, UserRound } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { agregarNota, asignarUnidad, avanzarEstado, cambiarPrioridad, cancelarIncidente, liberarUnidad } from '@/app/acciones/operacion';
import { BotonEnviar } from '@/components/formulario';
import { Mapa } from '@/components/mapa/Mapa';
import { Cronometro } from '@/components/operacion/Cronometro';
import { FormAccion } from '@/components/operacion/FormAccion';
import { COLOR_PRIORIDAD, calcularSla, minutosTexto } from '@/components/operacion/sla';
import { Aviso, Encabezado, Insignia, InsigniaGravedad, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { PRIORIDADES, type EstadoIncidente } from '@/db/esquema';
import { CANAL, ESTADO_INCIDENTE, ESTADO_REPORTE, PRIORIDAD, UNIDAD } from '@/lib/etiquetas';
import { coordenadas, distanciaM } from '@/lib/geo';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { formatoFechaHora, formatoHora } from '@/lib/tiempo';

import { FormCierre } from './FormCierre';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inc = Number.isInteger(Number(id)) ? await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, Number(id)), columns: { codigo: true } }) : null;
  return { title: inc ? `Incidente ${inc.codigo}` : 'Incidente' };
}

const FLUJO: EstadoIncidente[] = ['abierto', 'despachado', 'en_sitio', 'controlado', 'cerrado'];
const SIGUIENTE: Partial<Record<EstadoIncidente, { estado: EstadoIncidente; texto: string }>> = {
  abierto: { estado: 'despachado', texto: 'Marcar unidad en camino' },
  despachado: { estado: 'en_sitio', texto: 'Marcar llegada al sitio' },
  en_sitio: { estado: 'controlado', texto: 'Marcar situación controlada' },
};

export default async function FichaIncidente({ params }: { params: Promise<{ id: string }> }) {
  await requerirRol(PERMISOS.operar);
  const { id: texto } = await params;
  const id = Number(texto);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const inc = await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, id) });
  if (!inc) notFound();

  const [eventos, asignaciones, libres, reporte, siniestro, responsable] = await Promise.all([
    db.select({ id: e.incidenteEventos.id, tipo: e.incidenteEventos.tipo, texto: e.incidenteEventos.texto, creado: e.incidenteEventos.creado, autor: e.usuarios.nombre })
      .from(e.incidenteEventos).leftJoin(e.usuarios, eq(e.usuarios.id, e.incidenteEventos.usuarioId))
      .where(eq(e.incidenteEventos.incidenteId, id)).orderBy(desc(e.incidenteEventos.creado), desc(e.incidenteEventos.id)),
    db.select({ unidad: e.unidades, asignadoEn: e.incidenteUnidades.asignadoEn, liberadoEn: e.incidenteUnidades.liberadoEn })
      .from(e.incidenteUnidades).innerJoin(e.unidades, eq(e.unidades.id, e.incidenteUnidades.unidadId))
      .where(eq(e.incidenteUnidades.incidenteId, id)).orderBy(asc(e.incidenteUnidades.asignadoEn)),
    db.select().from(e.unidades).where(eq(e.unidades.estado, 'disponible')),
    inc.reporteId ? db.query.reportes.findFirst({ where: eq(e.reportes.id, inc.reporteId) }) : null,
    inc.siniestroId ? db.query.siniestros.findFirst({ where: eq(e.siniestros.id, inc.siniestroId) }) : null,
    inc.responsableId ? db.query.usuarios.findFirst({ where: eq(e.usuarios.id, inc.responsableId), columns: { nombre: true } }) : null,
  ]);

  const activo = !['cerrado', 'cancelado'].includes(inc.estado);
  const sla = calcularSla(inc);
  const actuales = asignaciones.filter((a) => !a.liberadoEn);
  const sugeridas = libres
    .map((u) => ({ ...u, distancia: u.lat != null && u.lng != null ? distanciaM(inc.lat, inc.lng, u.lat, u.lng) : null }))
    .sort((a, b) => (a.distancia ?? 1e9) - (b.distancia ?? 1e9));
  const siguiente = SIGUIENTE[inc.estado];
  const pasoActual = FLUJO.indexOf(inc.estado);
  const gravedadSugerida = reporte?.gravedadEstimada ?? (inc.prioridad === 'critica' ? 'fatal' : inc.prioridad === 'alta' ? 'grave' : inc.prioridad === 'media' ? 'leve' : 'solo_danos');

  return (
    <div className="space-y-6">
      <Link href="/consola/incidentes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />Volver a incidentes
      </Link>
      <Encabezado
        anotacion={`${inc.codigo} · ${coordenadas(inc.lat, inc.lng)}${inc.simulado ? ' · simulado' : ''}`}
        titulo={inc.titulo}
        descripcion={<span className="flex flex-wrap items-center gap-2">
          <Insignia tono={PRIORIDAD[inc.prioridad].tono}>Prioridad {PRIORIDAD[inc.prioridad].texto.toLowerCase()}</Insignia>
          <Insignia tono={ESTADO_INCIDENTE[inc.estado].tono} punto={false}>{ESTADO_INCIDENTE[inc.estado].texto}</Insignia>
          <span className="flex items-center gap-1"><MapPin className="size-4" aria-hidden="true" />{inc.direccion ?? 'Sin dirección'} · {inc.barrio ?? 'Sin barrio'}</span>
        </span>}
      />

      {/* Flujo de estados */}
      <ol className="grid grid-cols-5 gap-1 text-center text-xs font-semibold sm:text-sm" aria-label="Avance del incidente">
        {FLUJO.map((paso, i) => {
          const hecho = inc.estado !== 'cancelado' && i <= pasoActual;
          return (
            <li key={paso} aria-current={paso === inc.estado ? 'step' : undefined}
              className={`rounded-lg border-t-4 px-1 pt-2 ${hecho ? 'border-marca text-tinta' : 'border-borde text-tinta-3'}`}>
              {ESTADO_INCIDENTE[paso].texto}{hecho && <span className="sr-only"> (completado)</span>}
            </li>
          );
        })}
      </ol>
      {inc.estado === 'cancelado' && <Aviso tono="error">Incidente cancelado. {inc.cierre}</Aviso>}
      {inc.estado === 'cerrado' && (
        <Aviso tono="exito">
          Incidente cerrado {inc.cerradoEn ? `el ${formatoFechaHora(inc.cerradoEn)}` : ''}
          {siniestro && <> y registrado como <Link href={`/consola/siniestros/${siniestro.id}`} className="font-mono font-semibold underline">{siniestro.codigo}</Link></>}.
        </Aviso>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel titulo="Tiempo de respuesta" descripcion="Desde la apertura hasta la llegada de la primera unidad.">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <Cronometro desde={inc.abiertoEn.toISOString()} hasta={inc.enSitioEn?.toISOString() ?? (activo ? null : (inc.cerradoEn ?? new Date()).toISOString())} slaMin={inc.slaMin} grande />
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                {[['Apertura', inc.abiertoEn], ['Despacho', inc.despachadoEn], ['Llegada', inc.enSitioEn], ['Cierre', inc.cerradoEn]].map(([t, d]) => (
                  <div key={t as string}><dt className="text-tinta-2">{t as string}</dt><dd className="font-mono font-semibold">{d ? formatoHora(d as Date) : '—'}</dd></div>
                ))}
              </dl>
            </div>
            {!activo && sla.llego && <p className="mt-3 text-sm text-tinta-2">Llegada en {minutosTexto(sla.minutos)} ({sla.fuera ? 'fuera' : 'dentro'} del máximo de {inc.slaMin} min).</p>}
          </Panel>

          {activo && (
            <Panel titulo="Acciones" descripcion="Cada cambio queda registrado en la línea de tiempo con tu nombre.">
              <div className="flex flex-wrap items-start gap-3">
                {siguiente && (
                  <FormAccion accion={avanzarEstado}>
                    <input type="hidden" name="id" value={inc.id} />
                    <input type="hidden" name="estado" value={siguiente.estado} />
                    <BotonEnviar pendiente="Guardando…">{siguiente.texto}</BotonEnviar>
                  </FormAccion>
                )}
                {inc.estado === 'controlado' && <a href="#cierre" className="boton boton-primario">Cerrar incidente</a>}
                <FormAccion accion={cambiarPrioridad} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={inc.id} />
                  <label className="text-sm font-semibold text-tinta-2">Prioridad
                    <select name="prioridad" defaultValue={inc.prioridad} className="campo mt-1 min-h-10 py-1.5 font-normal text-tinta">
                      {PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDAD[p].texto} ({PRIORIDAD[p].sla} min)</option>)}
                    </select>
                  </label>
                  <BotonEnviar className="boton boton-secundario boton-chico min-h-10" pendiente="…">Cambiar</BotonEnviar>
                </FormAccion>
              </div>

              <FormAccion accion={agregarNota} limpiar className="mt-5 space-y-2">
                <input type="hidden" name="id" value={inc.id} />
                <label className="block font-semibold" htmlFor="nota">Agregar nota</label>
                <textarea id="nota" name="texto" rows={2} maxLength={1000} className="campo" placeholder="Ej.: se solicitó grúa; carril derecho cerrado." />
                <BotonEnviar className="boton boton-secundario boton-chico" pendiente="Guardando…">Guardar nota</BotonEnviar>
              </FormAccion>
            </Panel>
          )}

          <Panel titulo="Línea de tiempo">
            {eventos.length === 0 ? <p className="text-tinta-2">Sin eventos registrados.</p> : (
              <ol className="relative space-y-4 border-l-2 border-borde pl-5">
                {eventos.map((ev) => (
                  <li key={ev.id} className="relative">
                    <span aria-hidden="true" className={`absolute -left-[1.6rem] top-1.5 size-3 rounded-full border-2 border-white ${ev.tipo === 'estado' || ev.tipo === 'creado' ? 'bg-marca' : ev.tipo === 'unidad' ? 'bg-exito' : ev.tipo === 'prioridad' ? 'bg-aviso' : 'bg-tinta-3'}`} />
                    <p>{ev.texto}</p>
                    <p className="flex flex-wrap items-center gap-x-3 text-sm text-tinta-2">
                      <span className="flex items-center gap-1"><Clock className="size-3.5" aria-hidden="true" /><time dateTime={ev.creado.toISOString()}>{formatoFechaHora(ev.creado)}</time></span>
                      <span className="flex items-center gap-1"><UserRound className="size-3.5" aria-hidden="true" />{ev.autor ?? 'Sistema'}</span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          {activo && (
            <section id="cierre" className="grid gap-6 lg:grid-cols-2">
              <Panel titulo="Cerrar incidente" descripcion="Registra el siniestro definitivo; las unidades quedan libres.">
                <FormCierre id={inc.id} titulo={inc.titulo} gravedadSugerida={gravedadSugerida} vehiculosSugeridos={reporte?.vehiculos ?? []} />
              </Panel>
              <Panel titulo="Cancelar incidente" descripcion="Para avisos falsos o duplicados. El motivo es obligatorio.">
                <FormAccion accion={cancelarIncidente} className="space-y-3">
                  <input type="hidden" name="id" value={inc.id} />
                  <label className="block font-semibold" htmlFor="motivo">Motivo <span aria-hidden="true" className="text-error">*</span></label>
                  <textarea id="motivo" name="motivo" rows={3} maxLength={500} required className="campo" placeholder="Duplicado del incidente IN-…, aviso falso…" />
                  <BotonEnviar className="boton boton-peligro" pendiente="Cancelando…">Cancelar incidente</BotonEnviar>
                </FormAccion>
              </Panel>
            </section>
          )}
        </div>

        <div className="space-y-6">
          <Panel titulo="Ubicación y unidades">
            <Mapa etiqueta="Mapa del incidente y de las unidades asignadas y disponibles" alto="20rem" centro={[inc.lat, inc.lng]} zoom={14}
              capas={[
                { tipo: 'marcadores', items: sugeridas.slice(0, 6).filter((u) => u.lat != null).map((u) => ({ lat: u.lat!, lng: u.lng!, icono: 'unidad' as const, etiqueta: `${u.nombre} (disponible)`, color: '#15803D', ventana: { titulo: u.nombre, lineas: [UNIDAD[u.tipo], `Disponible · ${u.distancia ? `${(u.distancia / 1000).toFixed(1)} km` : ''}`] } })) },
                { tipo: 'marcadores', items: actuales.filter((a) => a.unidad.lat != null).map((a) => ({ lat: a.unidad.lat!, lng: a.unidad.lng!, icono: 'unidad' as const, etiqueta: `${a.unidad.nombre} (asignada)`, color: '#2437C7', ventana: { titulo: a.unidad.nombre, lineas: ['Asignada a este incidente'] } })) },
                { tipo: 'marcadores', items: [{ lat: inc.lat, lng: inc.lng, icono: 'incidente' as const, etiqueta: inc.titulo, color: COLOR_PRIORIDAD[inc.prioridad], pulso: activo, ventana: { titulo: inc.codigo, lineas: [inc.titulo] } }] },
              ]} />
            <p className="mt-2 text-sm text-tinta-2">Rojo: incidente · azul: unidades asignadas · verde: disponibles cercanas.</p>

            <h3 className="mt-5 font-bold">Asignadas</h3>
            {actuales.length === 0 ? <p className="text-sm text-tinta-2">Ninguna unidad asignada.</p> : (
              <ul className="mt-2 divide-y divide-borde">
                {actuales.map((a) => (
                  <li key={a.unidad.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-semibold">{a.unidad.nombre}</span> <span className="text-sm text-tinta-2">· {UNIDAD[a.unidad.tipo]} · desde {formatoHora(a.asignadoEn)}</span></span>
                    {activo && (
                      <FormAccion accion={liberarUnidad}>
                        <input type="hidden" name="id" value={inc.id} />
                        <input type="hidden" name="unidadId" value={a.unidad.id} />
                        <BotonEnviar className="boton boton-fantasma boton-chico" pendiente="…">Liberar<span className="sr-only"> {a.unidad.nombre}</span></BotonEnviar>
                      </FormAccion>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {activo && (
              <>
                <h3 className="mt-5 font-bold">Disponibles más cercanas</h3>
                {sugeridas.length === 0 ? <p className="text-sm text-tinta-2">No hay unidades disponibles en este momento.</p> : (
                  <ul className="mt-2 divide-y divide-borde">
                    {sugeridas.slice(0, 6).map((u) => (
                      <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span><span className="font-semibold">{u.nombre}</span> <span className="text-sm text-tinta-2">· {UNIDAD[u.tipo]}{u.distancia != null ? ` · a ${(u.distancia / 1000).toFixed(1)} km` : ''}</span></span>
                        <FormAccion accion={asignarUnidad}>
                          <input type="hidden" name="id" value={inc.id} />
                          <input type="hidden" name="unidadId" value={u.id} />
                          <BotonEnviar className="boton boton-secundario boton-chico" pendiente="…">Asignar<span className="sr-only"> {u.nombre}</span></BotonEnviar>
                        </FormAccion>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {asignaciones.some((a) => a.liberadoEn) && (
              <p className="mt-4 text-sm text-tinta-2">Atendieron antes: {asignaciones.filter((a) => a.liberadoEn).map((a) => a.unidad.nombre).join(', ')}.</p>
            )}
          </Panel>

          <Panel titulo="Origen y registro">
            <dl className="space-y-3 text-sm">
              <div><dt className="text-tinta-2">Responsable</dt><dd className="font-semibold">{responsable?.nombre ?? (inc.simulado ? 'Simulación' : 'Sin asignar')}</dd></div>
              <div>
                <dt className="text-tinta-2">Reporte ciudadano</dt>
                <dd>{reporte ? (
                  <span className="block">
                    <span className="font-mono font-semibold">{reporte.codigo}</span> · {CANAL[reporte.canal]} · <Insignia tono={ESTADO_REPORTE[reporte.estado].tono} punto={false}>{ESTADO_REPORTE[reporte.estado].texto}</Insignia>
                    <span className="mt-1 block text-tinta-2">«{reporte.descripcion}»</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2"><InsigniaGravedad gravedad={reporte.gravedadEstimada} /> estimada por quien reportó{reporte.hayHeridos ? ' · reporta heridos' : ''}</span>
                    <Link href={`/consola/reportes?id=${reporte.id}`} className="mt-1 inline-block font-semibold text-marca hover:underline">Ver en la bandeja</Link>
                  </span>
                ) : 'Abierto directamente por el equipo'}</dd>
              </div>
              <div>
                <dt className="text-tinta-2">Siniestro registrado</dt>
                <dd>{siniestro ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/consola/siniestros/${siniestro.id}`} className="font-mono font-semibold text-marca hover:underline">{siniestro.codigo}</Link>
                    <InsigniaGravedad gravedad={siniestro.gravedad} />
                  </span>
                ) : 'Se registra al cerrar'}</dd>
              </div>
              {inc.cierre && <div><dt className="text-tinta-2">Cierre</dt><dd>{inc.cierre}</dd></div>}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
