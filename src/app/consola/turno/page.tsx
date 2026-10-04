import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';
import Link from 'next/link';

import { Mapa } from '@/components/mapa/Mapa';
import { Cronometro } from '@/components/operacion/Cronometro';
import { COLOR_PRIORIDAD, calcularSla } from '@/components/operacion/sla';
import { db, esquema as e } from '@/db';
import type { Prioridad } from '@/db/esquema';
import { CANAL, ESTADO_INCIDENTE, NIVEL_ALERTA, PRIORIDAD, UNIDAD } from '@/lib/etiquetas';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { formatoHora, hace, inicioDia } from '@/lib/tiempo';

import { ControlesTurno } from './ControlesTurno';

export const metadata = { title: 'Panel de turno' };
export const dynamic = 'force-dynamic';

const ORDEN: Prioridad[] = ['critica', 'alta', 'media', 'baja'];
const TEXTO_PRIORIDAD: Record<Prioridad, string> = { critica: 'text-[#FF8A80]', alta: 'text-[#FFB4A8]', media: 'text-senal', baja: 'text-white/80' };

export default async function Turno() {
  await requerirRol(PERMISOS.operar);
  const ahora = new Date();
  const [activos, unidades, bandeja, alertas, eventos, [hoy]] = await Promise.all([
    db.select().from(e.incidentes).where(inArray(e.incidentes.estado, ['abierto', 'despachado', 'en_sitio', 'controlado'])).orderBy(desc(e.incidentes.abiertoEn)),
    db.select().from(e.unidades).orderBy(e.unidades.nombre),
    db.select().from(e.reportes).where(inArray(e.reportes.estado, ['recibido', 'en_revision'])).orderBy(desc(e.reportes.creado)).limit(6),
    db.select().from(e.alertas).where(eq(e.alertas.atendida, false)).orderBy(desc(e.alertas.creado)).limit(5),
    db.select({ id: e.incidenteEventos.id, texto: e.incidenteEventos.texto, creado: e.incidenteEventos.creado, codigo: e.incidentes.codigo, incidenteId: e.incidentes.id })
      .from(e.incidenteEventos).innerJoin(e.incidentes, eq(e.incidentes.id, e.incidenteEventos.incidenteId))
      .orderBy(desc(e.incidenteEventos.creado), desc(e.incidenteEventos.id)).limit(8),
    db.select({ n: count() }).from(e.incidentes).where(and(gte(e.incidentes.abiertoEn, inicioDia(ahora)))),
  ]);
  const [bandejaTotal] = await db.select({ n: count() }).from(e.reportes).where(inArray(e.reportes.estado, ['recibido', 'en_revision']));

  const ordenados = [...activos].sort((a, b) => ORDEN.indexOf(a.prioridad) - ORDEN.indexOf(b.prioridad) || a.abiertoEn.getTime() - b.abiertoEn.getTime());
  const fuera = activos.filter((i) => calcularSla(i, ahora).fuera && !i.enSitioEn).length;
  const disponibles = unidades.filter((u) => u.estado === 'disponible');
  const asignadas = unidades.filter((u) => u.estado === 'asignada');
  const porPrioridad = Object.fromEntries(ORDEN.map((p) => [p, activos.filter((i) => i.prioridad === p).length])) as Record<Prioridad, number>;

  const tarjeta = 'rounded-2xl border border-noche-borde bg-noche-2 p-4';
  return (
    <div id="panel-turno" className="sobre-oscuro -mx-3 -my-6 min-h-[calc(100dvh-4rem)] overflow-auto bg-noche p-4 text-white sm:-mx-6 sm:p-6 lg:-mx-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="anotacion text-white/70"><span className="latido mr-2 inline-block size-2 rounded-full bg-[#7EE2A8] align-middle" aria-hidden="true" />En vivo · Sala de control</p>
          <h1 className="mt-1 text-3xl font-bold sm:text-4xl">Panel de <span className="serif text-senal">turno</span></h1>
        </div>
        <ControlesTurno objetivo="panel-turno" />
      </header>
      <div className="franja mt-4 h-1.5 rounded-full" aria-hidden="true" />

      <section aria-label="Indicadores del turno" className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {[
          ['En curso', activos.length, 'text-white'],
          ['Fuera de tiempo', fuera, fuera ? 'text-[#FF8A80]' : 'text-[#7EE2A8]'],
          ['Unidades libres', `${disponibles.length}/${unidades.filter((u) => u.estado !== 'fuera_servicio').length}`, 'text-[#7EE2A8]'],
          ['Reportes en bandeja', bandejaTotal.n, bandejaTotal.n ? 'text-senal' : 'text-white'],
          ['Alertas activas', alertas.length, alertas.length ? 'text-[#FF8A80]' : 'text-white'],
          ['Abiertos hoy', hoy.n, 'text-white'],
        ].map(([t, v, c]) => (
          <div key={t as string} className={tarjeta}>
            <p className="text-sm font-semibold text-white/75">{t}</p>
            <p className={`cifra mt-1 text-6xl ${c}`}>{v}</p>
          </div>
        ))}
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <section aria-labelledby="t-curso" className={tarjeta}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="t-curso" className="text-xl font-bold">Incidentes en curso</h2>
            <p className="text-sm text-white/75">{ORDEN.map((p) => `${PRIORIDAD[p].texto}: ${porPrioridad[p]}`).join(' · ')}</p>
          </div>
          {ordenados.length === 0 ? <p className="mt-6 text-white/75">Sin incidentes en curso. Vía tranquila.</p> : (
            <ul className="mt-3 divide-y divide-noche-borde">
              {ordenados.map((i) => (
                <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <span aria-hidden="true" className="size-3 rounded-full" style={{ background: COLOR_PRIORIDAD[i.prioridad], boxShadow: '0 0 0 2px #fff3' }} />
                      <span className={`font-bold uppercase tracking-wide ${TEXTO_PRIORIDAD[i.prioridad]}`}>{PRIORIDAD[i.prioridad].texto}</span>
                      <span className="font-mono text-white/70">{i.codigo}</span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold">{ESTADO_INCIDENTE[i.estado].texto}</span>
                    </p>
                    <Link href={`/consola/incidentes/${i.id}`} className="mt-1 block font-semibold hover:underline">{i.titulo}</Link>
                    <p className="text-sm text-white/70">{i.barrio ?? 'Sin barrio'} · abierto {formatoHora(i.abiertoEn)}</p>
                  </div>
                  <Cronometro desde={i.abiertoEn.toISOString()} hasta={i.enSitioEn?.toISOString() ?? null} slaMin={i.slaMin} oscuro />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Mapa de incidentes y unidades" className={tarjeta}>
          <h2 className="mb-3 text-xl font-bold">Mapa operativo</h2>
          <Mapa etiqueta="Mapa operativo: incidentes en curso y unidades" alto="26rem" oscuro
            capas={[
              { tipo: 'marcadores', items: unidades.filter((u) => u.lat != null && u.estado !== 'fuera_servicio').map((u) => ({ lat: u.lat!, lng: u.lng!, icono: 'unidad' as const, etiqueta: `${u.nombre}: ${u.estado === 'disponible' ? 'disponible' : 'asignada'}`, color: u.estado === 'disponible' ? '#15803D' : '#2437C7', ventana: { titulo: u.nombre, lineas: [UNIDAD[u.tipo], u.estado === 'disponible' ? 'Disponible' : 'Asignada'] } })) },
              { tipo: 'marcadores', items: activos.map((i) => ({ lat: i.lat, lng: i.lng, icono: 'incidente' as const, etiqueta: `${i.codigo}: ${i.titulo}`, color: COLOR_PRIORIDAD[i.prioridad], pulso: i.estado === 'abierto', ventana: { titulo: i.titulo, lineas: [i.codigo, ESTADO_INCIDENTE[i.estado].texto], enlace: { href: `/consola/incidentes/${i.id}`, texto: 'Abrir ficha' } } })) },
            ]} />
          <p className="mt-2 text-sm text-white/75">Incidentes por color de prioridad · unidades: verde libre, azul asignada.</p>
        </section>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <section aria-labelledby="t-unidades" className={tarjeta}>
          <h2 id="t-unidades" className="text-lg font-bold">Unidades</h2>
          <p className="text-sm text-white/75">{disponibles.length} disponibles · {asignadas.length} asignadas</p>
          <ul className="mt-3 max-h-72 space-y-1.5 overflow-y-auto pr-1 text-sm" tabIndex={0}>
            {unidades.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-2">
                <span>{u.nombre}</span>
                <span className={`font-semibold ${u.estado === 'disponible' ? 'text-[#7EE2A8]' : u.estado === 'asignada' ? 'text-senal' : 'text-white/60'}`}>
                  {u.estado === 'disponible' ? 'Libre' : u.estado === 'asignada' ? 'Asignada' : 'Fuera de servicio'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="t-bandeja" className={tarjeta}>
          <h2 id="t-bandeja" className="text-lg font-bold">Bandeja de reportes</h2>
          <p className="text-sm text-white/75">{bandejaTotal.n} por revisar</p>
          {bandeja.length === 0 ? <p className="mt-3 text-sm text-white/75">Bandeja al día.</p> : (
            <ul className="mt-3 space-y-2 text-sm">
              {bandeja.map((r) => (
                <li key={r.id}>
                  <Link href={`/consola/reportes?id=${r.id}`} className="font-semibold hover:underline">{r.barrio ?? 'Sin barrio'}</Link>
                  <span className="text-white/70"> · {CANAL[r.canal]} · {hace(r.creado, ahora)}</span>
                  <p className="line-clamp-1 text-white/80">{r.descripcion}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="t-alertas" className={tarjeta}>
          <h2 id="t-alertas" className="text-lg font-bold">Alertas activas</h2>
          {alertas.length === 0 ? <p className="mt-3 text-sm text-white/75">Sin alertas pendientes.</p> : (
            <ul className="mt-3 space-y-2 text-sm">
              {alertas.map((a) => (
                <li key={a.id}>
                  <p className="font-semibold"><span className={a.nivel === 'critico' ? 'text-[#FF8A80]' : 'text-senal'}>{NIVEL_ALERTA[a.nivel].texto}:</span> {a.titulo}</p>
                  <p className="text-white/70">{a.detalle} · {hace(a.creado, ahora)}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/consola/alertas" className="mt-3 inline-block text-sm font-semibold text-senal hover:underline">Gestionar alertas</Link>
        </section>

        <section aria-labelledby="t-eventos" className={tarjeta}>
          <h2 id="t-eventos" className="text-lg font-bold">Últimos eventos</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {eventos.map((ev) => (
              <li key={ev.id}>
                <span className="font-mono text-white/70">{formatoHora(ev.creado)}</span>{' '}
                <Link href={`/consola/incidentes/${ev.incidenteId}`} className="font-semibold hover:underline">{ev.codigo}</Link>{' '}
                <span className="text-white/85">{ev.texto}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
