import { and, count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { Activity, Ambulance, HeartCrack, Inbox, Siren, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BarraGravedad, Barras, MatrizHoraDia, Serie } from '@/components/graficos';
import { Mapa } from '@/components/mapa/Mapa';
import { Aviso, Encabezado, Insignia, Kpi, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, matrizHoraDia, puntosMapa, ranking, resumen, serie } from '@/lib/consultas';
import { ESTADO_INCIDENTE, PRIORIDAD } from '@/lib/etiquetas';
import { diaISO, hace, periodoAnterior, resolverPeriodo, variacion } from '@/lib/tiempo';
import { requerirRol } from '@/lib/sesion';

export const metadata = { title: 'Resumen' };

export default async function Resumen({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [usuario, sp] = await Promise.all([requerirRol(), searchParams]);
  const periodo = resolverPeriodo(sp, '30d');
  const anterior = periodoAnterior(periodo);
  const dias = periodo.desde ? (periodo.hasta.getTime() - periodo.desde.getTime()) / 86_400_000 : 9999;
  const unidad = dias <= 45 ? 'day' : dias <= 200 ? 'week' : 'month';

  const [actual, previo, puntos, linea, matriz, barrios, anios, abiertos, pendientes, alertasAbiertas, sla] = await Promise.all([
    resumen({ periodo }),
    anterior ? resumen({ periodo: anterior }) : null,
    puntosMapa({ periodo }, 8000),
    serie({ periodo }, unidad),
    matrizHoraDia({ periodo }),
    ranking({ periodo }, 'barrio', 8),
    aniosDisponibles(),
    db.select().from(e.incidentes).where(inArray(e.incidentes.estado, ['abierto', 'despachado', 'en_sitio', 'controlado'])).orderBy(desc(e.incidentes.abiertoEn)).limit(6),
    db.select({ n: count() }).from(e.reportes).where(inArray(e.reportes.estado, ['recibido', 'en_revision'])),
    db.select({ n: count() }).from(e.alertas).where(eq(e.alertas.atendida, false)),
    db.select({
      total: count(),
      cumplidos: sql<number>`count(*) filter (where extract(epoch from (${e.incidentes.enSitioEn} - ${e.incidentes.abiertoEn}))/60 <= ${e.incidentes.slaMin})::int`,
      promedio: sql<number>`coalesce(avg(extract(epoch from (${e.incidentes.enSitioEn} - ${e.incidentes.abiertoEn}))/60), 0)::float`,
    }).from(e.incidentes).where(and(gte(e.incidentes.abiertoEn, periodo.desde ?? new Date(0)), sql`${e.incidentes.enSitioEn} is not null`)),
  ]);

  const fmtBalde = (b: string) => {
    const [a, m, d] = b.split('-');
    return unidad === 'month' ? `${m}/${a.slice(2)}` : `${d}/${m}`;
  };
  const cumplimiento = sla[0].total ? Math.round((sla[0].cumplidos / sla[0].total) * 100) : null;

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={`${periodo.etiqueta} · actualizado ${hace(new Date())}`}
        titulo={`Hola, ${usuario.nombre.split(' ')[0]}.`}
        destacado="Así va la vía."
        descripcion="Indicadores del periodo, lo que está en curso y dónde se concentra la siniestralidad."
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />}
      />

      {(pendientes[0].n > 0 || alertasAbiertas[0].n > 0) && (
        <Aviso tono="aviso">
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <TriangleAlert className="size-5 text-aviso" aria-hidden="true" />
            {pendientes[0].n > 0 && <Link href="/consola/reportes" className="font-semibold underline underline-offset-4">{pendientes[0].n} reportes ciudadanos por revisar</Link>}
            {alertasAbiertas[0].n > 0 && <Link href="/consola/alertas" className="font-semibold underline underline-offset-4">{alertasAbiertas[0].n} alertas sin atender</Link>}
          </span>
        </Aviso>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Siniestros" icono={Activity} valor={actual.total} variacion={previo ? variacion(actual.total, previo.total) : undefined} />
        <Kpi etiqueta="Víctimas fatales" icono={HeartCrack} tono="fatal" valor={actual.fallecidos} variacion={previo ? variacion(actual.fallecidos, previo.fallecidos) : undefined} />
        <Kpi etiqueta="Personas heridas" icono={Ambulance} tono="grave" valor={actual.heridos} variacion={previo ? variacion(actual.heridos, previo.heridos) : undefined} />
        <Kpi etiqueta="Llegada dentro del tiempo" icono={Siren} valor={cumplimiento == null ? '—' : `${cumplimiento}`} unidad={cumplimiento == null ? undefined : '%'}
          detalle={sla[0].total ? `Promedio de llegada: ${Math.round(sla[0].promedio)} min · ${sla[0].total} incidentes` : 'Sin incidentes atendidos en el periodo'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel titulo="Mapa de calor del periodo" descripcion={`${puntos.length.toLocaleString('es-CO')} siniestros georreferenciados`}
          acciones={<Link href={`/consola/mapa?periodo=${periodo.clave}`} className="boton boton-secundario boton-chico">Abrir mapa completo</Link>}>
          <Mapa etiqueta="Mapa de calor de siniestros del periodo" alto="24rem"
            capas={[{ tipo: 'calor', puntos: puntos.map((p) => [p.lat, p.lng, p.gravedad === 'fatal' ? 1 : p.gravedad === 'grave' ? 0.7 : 0.4]) }]} />
        </Panel>

        <Panel titulo="En curso ahora" descripcion="Incidentes abiertos"
          acciones={<Link href="/consola/incidentes" className="boton boton-secundario boton-chico">Ver todos</Link>}>
          {abiertos.length === 0 ? <p className="text-tinta-2">No hay incidentes abiertos.</p> : (
            <ul className="divide-y divide-borde">
              {abiertos.map((i) => (
                <li key={i.id} className="py-3 first:pt-0">
                  <Link href={`/consola/incidentes/${i.id}`} className="group block">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="anotacion text-tinta-3">{i.codigo}</span>
                      <Insignia tono={PRIORIDAD[i.prioridad].tono}>{PRIORIDAD[i.prioridad].texto}</Insignia>
                      <Insignia tono={ESTADO_INCIDENTE[i.estado].tono} punto={false}>{ESTADO_INCIDENTE[i.estado].texto}</Insignia>
                    </span>
                    <span className="mt-1 block font-semibold group-hover:underline">{i.titulo}</span>
                    <span className="text-sm text-tinta-2">{i.barrio} · {hace(i.abiertoEn)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 border-t border-borde pt-4">
            <Link href="/consola/reportes" className="flex items-center gap-2 font-semibold text-marca hover:underline">
              <Inbox className="size-4" aria-hidden="true" />{pendientes[0].n} reportes en bandeja
            </Link>
          </div>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel titulo="Evolución" descripcion={`Siniestros por ${unidad === 'day' ? 'día' : unidad === 'week' ? 'semana' : 'mes'}`}>
          <Serie titulo="Evolución de siniestros" puntos={linea.map((l) => ({ x: fmtBalde(l.balde), y: l.total, y2: l.graves }))} />
        </Panel>
        <Panel titulo="Gravedad">
          <BarraGravedad por={actual.porGravedad} />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel titulo="¿Cuándo ocurren?" descripcion="Día de la semana y hora (hora local)">
          <MatrizHoraDia matriz={matriz} />
        </Panel>
        <Panel titulo="Barrios con más siniestros">
          <Barras titulo="Barrios con más siniestros" datos={barrios.map((b) => ({ etiqueta: b.clave, valor: b.n, nota: b.fatales ? `${b.fatales} fatales` : undefined }))} />
        </Panel>
      </div>
    </div>
  );
}
