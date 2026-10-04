import { and, count, eq, sql } from 'drizzle-orm';
import { Truck } from 'lucide-react';

import { guardarUnidad } from '@/app/acciones/operacion';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BotonEnviar } from '@/components/formulario';
import { Mapa } from '@/components/mapa/Mapa';
import { FormAccion } from '@/components/operacion/FormAccion';
import { SelectorUbicacion } from '@/components/operacion/SelectorUbicacion';
import { minutosTexto } from '@/components/operacion/sla';
import { Encabezado, Insignia, Kpi, Panel, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { ESTADOS_UNIDAD, TIPOS_UNIDAD } from '@/db/esquema';
import { aniosDisponibles, enPeriodo } from '@/lib/consultas';
import { ESTADO_UNIDAD, UNIDAD } from '@/lib/etiquetas';
import { PERMISOS, puede, requerirRol } from '@/lib/sesion';
import { diaISO, hace, resolverPeriodo } from '@/lib/tiempo';

export const metadata = { title: 'Unidades' };

const COLOR_ESTADO: Record<string, string> = { disponible: '#15803D', asignada: '#2437C7', fuera_servicio: '#6B6880' };

export default async function Unidades({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await requerirRol(PERMISOS.operar);
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, '30d');
  const configurar = puede(usuario, 'configurar');

  const llegada = sql<number | null>`avg(extract(epoch from (${e.incidentes.enSitioEn} - ${e.incidenteUnidades.asignadoEn})) / 60) filter (where ${e.incidentes.enSitioEn} >= ${e.incidenteUnidades.asignadoEn})`;
  const ocupacion = sql<number | null>`sum(extract(epoch from (coalesce(${e.incidenteUnidades.liberadoEn}, now()) - ${e.incidenteUnidades.asignadoEn})) / 60)`;
  const [unidades, historial, actuales, anios] = await Promise.all([
    db.select().from(e.unidades).orderBy(e.unidades.tipo, e.unidades.nombre),
    db.select({ unidadId: e.incidenteUnidades.unidadId, n: count(), llegada, ocupacion })
      .from(e.incidenteUnidades).innerJoin(e.incidentes, eq(e.incidentes.id, e.incidenteUnidades.incidenteId))
      .where(enPeriodo(e.incidenteUnidades.asignadoEn, periodo)).groupBy(e.incidenteUnidades.unidadId),
    db.select({ unidadId: e.incidenteUnidades.unidadId, incidenteId: e.incidentes.id, codigo: e.incidentes.codigo })
      .from(e.incidenteUnidades).innerJoin(e.incidentes, eq(e.incidentes.id, e.incidenteUnidades.incidenteId))
      .where(and(sql`${e.incidenteUnidades.liberadoEn} is null`)),
    aniosDisponibles(),
  ]);
  const porUnidad = new Map(historial.map((h) => [h.unidadId, h]));
  const enIncidente = new Map(actuales.map((a) => [a.unidadId, a]));
  const total = (estado: string) => unidades.filter((u) => u.estado === estado).length;
  const filasHistorial = unidades.map((u) => ({ u, h: porUnidad.get(u.id) })).filter((x) => x.h).sort((a, b) => b.h!.n - a.h!.n);
  const llegadaGlobal = historial.reduce((s, h) => s + (h.llegada ? Number(h.llegada) * h.n : 0), 0) / Math.max(1, historial.filter((h) => h.llegada).reduce((s, h) => s + h.n, 0));

  return (
    <div className="space-y-6">
      <Encabezado anotacion="Operación" titulo="Unidades" destacado="en servicio"
        descripcion="Agentes, motorizados, grúas, ambulancias y patrullas. Las unidades se asignan desde la ficha de cada incidente." />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi etiqueta="Disponibles" valor={total('disponible')} icono={Truck} />
        <Kpi etiqueta="Asignadas a incidentes" valor={total('asignada')} />
        <Kpi etiqueta="Fuera de servicio" valor={total('fuera_servicio')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.3fr]">
        <Panel titulo="Mapa de unidades" descripcion="Última ubicación conocida. Verde: disponible · azul: asignada · gris: fuera de servicio.">
          <Mapa etiqueta="Mapa de unidades" alto="26rem" ajustar
            capas={[{ tipo: 'marcadores', items: unidades.filter((u) => u.lat != null).map((u) => ({ lat: u.lat!, lng: u.lng!, icono: 'unidad' as const, etiqueta: `${u.nombre}: ${ESTADO_UNIDAD[u.estado].texto}`, color: COLOR_ESTADO[u.estado], ventana: { titulo: u.nombre, lineas: [UNIDAD[u.tipo], ESTADO_UNIDAD[u.estado].texto] } })) }]} />
        </Panel>

        <Panel titulo="Listado" descripcion={configurar ? 'Abre una fila para editarla.' : undefined}>
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="tabla min-w-[560px]">
              <caption className="sr-only">Unidades y su estado actual</caption>
              <thead><tr><th scope="col">Unidad</th><th scope="col">Tipo</th><th scope="col">Estado</th><th scope="col">Actualizada</th></tr></thead>
              <tbody>
                {unidades.map((u) => {
                  const inc = enIncidente.get(u.id);
                  return (
                    <tr key={u.id}>
                      <td>
                        {configurar ? (
                          <details>
                            <summary className="cursor-pointer font-semibold text-marca">{u.nombre}</summary>
                            <FormAccion accion={guardarUnidad} className="mt-3 grid gap-2 sm:grid-cols-2">
                              <input type="hidden" name="id" value={u.id} />
                              <label className="text-sm font-semibold">Nombre<input name="nombre" defaultValue={u.nombre} maxLength={60} className="campo mt-1 min-h-10 font-normal" /></label>
                              <label className="text-sm font-semibold">Tipo
                                <select name="tipo" defaultValue={u.tipo} className="campo mt-1 min-h-10 font-normal">{TIPOS_UNIDAD.map((t) => <option key={t} value={t}>{UNIDAD[t]}</option>)}</select>
                              </label>
                              <label className="text-sm font-semibold">Estado
                                <select name="estado" defaultValue={u.estado} className="campo mt-1 min-h-10 font-normal">{ESTADOS_UNIDAD.map((s) => <option key={s} value={s}>{ESTADO_UNIDAD[s].texto}</option>)}</select>
                              </label>
                              <span className="grid grid-cols-2 gap-2">
                                <label className="text-sm font-semibold">Latitud<input name="lat" type="number" step="0.000001" defaultValue={u.lat ?? ''} className="campo mt-1 min-h-10 font-normal" /></label>
                                <label className="text-sm font-semibold">Longitud<input name="lng" type="number" step="0.000001" defaultValue={u.lng ?? ''} className="campo mt-1 min-h-10 font-normal" /></label>
                              </span>
                              <span className="sm:col-span-2"><BotonEnviar className="boton boton-primario boton-chico" pendiente="Guardando…">Guardar cambios</BotonEnviar></span>
                            </FormAccion>
                          </details>
                        ) : <span className="font-semibold">{u.nombre}</span>}
                      </td>
                      <td>{UNIDAD[u.tipo]}</td>
                      <td>
                        <Insignia tono={ESTADO_UNIDAD[u.estado].tono}>{ESTADO_UNIDAD[u.estado].texto}</Insignia>
                        {inc && <a href={`/consola/incidentes/${inc.incidenteId}`} className="mt-1 block font-mono text-sm text-marca hover:underline">{inc.codigo}</a>}
                      </td>
                      <td className="text-sm text-tinta-2">{hace(u.actualizado)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <Panel titulo="Desempeño por unidad" descripcion={`Asignaciones y tiempo medio desde la asignación hasta la llegada al sitio · ${periodo.etiqueta}`}
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />}>
        {filasHistorial.length === 0 ? <Vacio titulo="Sin asignaciones en este periodo">Prueba con un periodo más amplio.</Vacio> : (
          <>
            <p className="mb-3 text-sm text-tinta-2">Llegada media de todas las unidades: <strong className="text-tinta">{minutosTexto(llegadaGlobal)}</strong>.</p>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="tabla min-w-[560px]">
                <caption className="sr-only">Desempeño por unidad en {periodo.etiqueta}</caption>
                <thead><tr><th scope="col">Unidad</th><th scope="col">Tipo</th><th scope="col" className="num">Asignaciones</th><th scope="col" className="num">Llegada media</th><th scope="col" className="num">Tiempo ocupada</th></tr></thead>
                <tbody>
                  {filasHistorial.map(({ u, h }) => (
                    <tr key={u.id}>
                      <th scope="row" className="font-semibold">{u.nombre}</th>
                      <td>{UNIDAD[u.tipo]}</td>
                      <td className="num">{h!.n}</td>
                      <td className="num">{h!.llegada != null ? minutosTexto(Number(h!.llegada)) : '—'}</td>
                      <td className="num">{h!.ocupacion != null ? minutosTexto(Number(h!.ocupacion)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      {configurar && (
        <Panel titulo="Agregar unidad">
          <FormAccion accion={guardarUnidad} limpiar className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
            <div className="space-y-3">
              <label className="block font-semibold">Nombre<input name="nombre" required maxLength={60} className="campo mt-1 font-normal" placeholder="Motorizado 07" /></label>
              <label className="block font-semibold">Tipo
                <select name="tipo" className="campo mt-1 font-normal">{TIPOS_UNIDAD.map((t) => <option key={t} value={t}>{UNIDAD[t]}</option>)}</select>
              </label>
              <label className="block font-semibold">Estado inicial
                <select name="estado" className="campo mt-1 font-normal">
                  <option value="disponible">Disponible</option>
                  <option value="fuera_servicio">Fuera de servicio</option>
                </select>
              </label>
              <BotonEnviar pendiente="Creando…">Crear unidad</BotonEnviar>
            </div>
            <SelectorUbicacion etiqueta="Ubicación base" alto="16rem" requerido={false} />
          </FormAccion>
        </Panel>
      )}
    </div>
  );
}
