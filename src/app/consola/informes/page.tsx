import { and, asc, count, gte, lt, sql } from 'drizzle-orm';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BarraGravedad, Barras, MatrizHoraDia, Serie } from '@/components/graficos';
import { Logo } from '@/components/Logo';
import { Kpi, numero, porcentaje } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, enPeriodo, matrizHoraDia, porVehiculo, ranking, resumen, serie } from '@/lib/consultas';
import { CANAL, CLASE, ESTADO_REPORTE, INTERVENCION, PRIORIDAD, VEHICULO } from '@/lib/etiquetas';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { DIAS_SEMANA, diaISO, formatoFecha, formatoFechaHora, mismoPeriodoAnioAnterior, periodoAnterior, resolverPeriodo, variacion } from '@/lib/tiempo';

import { BotonImprimir } from './BotonImprimir';

export const metadata = { title: 'Informes' };

// Al imprimir se ocultan la barra lateral, la cabecera y el pie de la consola (solo en esta pagina).
const ESTILO_IMPRESION = `@media print {
  aside, div:has(> main#contenido) > header, main#contenido ~ footer { display: none !important; }
  main#contenido { padding: 0 !important; }
  .informe-pagina { break-before: page; }
  @page { margin: 16mm 14mm; }
}`;

function Seccion({ numero: n, titulo, children, nuevaPagina = false }: { numero: string; titulo: string; children: React.ReactNode; nuevaPagina?: boolean }) {
  return (
    <section className={`break-inside-avoid-page ${nuevaPagina ? 'informe-pagina' : ''}`} aria-labelledby={`sec-${n}`}>
      <div className="flex items-baseline gap-4 border-b-2 border-tinta pb-2">
        <span className="serif text-4xl text-tinta-3" aria-hidden="true">{n}</span>
        <h2 id={`sec-${n}`} className="text-2xl font-bold">{titulo}</h2>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

const texto = (v: number | null, sujeto: string) =>
  v == null ? '' : v === 0 ? `${sujeto} se mantuvo igual` : `${sujeto} ${v > 0 ? 'aumentó' : 'disminuyó'} ${Math.abs(v)} %`;

export default async function Informes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [usuario, sp] = await Promise.all([requerirRol(PERMISOS.analizar), searchParams]);
  const periodo = resolverPeriodo(sp, 'mes-anterior');
  const anterior = periodoAnterior(periodo);
  const anioPasado = mismoPeriodoAnioAnterior(periodo);
  const dias = periodo.desde ? (periodo.hasta.getTime() - periodo.desde.getTime()) / 86_400_000 : 9999;
  const unidad = dias <= 45 ? 'day' : dias <= 200 ? 'week' : 'month';
  const f = { periodo };

  const [anios, act, prev, pasado, linea, matriz, barrios, clases, vehiculos, puntos, incidentes, reportesCanal, reportesEstado] = await Promise.all([
    aniosDisponibles(),
    resumen(f),
    anterior ? resumen({ periodo: anterior }) : null,
    anioPasado ? resumen({ periodo: anioPasado }) : null,
    serie(f, unidad),
    matrizHoraDia(f),
    ranking(f, 'barrio', 10),
    ranking(f, 'clase', 10),
    porVehiculo(f),
    db.select().from(e.puntosNegros).orderBy(asc(e.puntosNegros.ranking)).limit(10),
    db.select({
      prioridad: e.incidentes.prioridad,
      total: count(),
      atendidos: sql<number>`count(*) filter (where ${e.incidentes.enSitioEn} is not null)::int`,
      cumplidos: sql<number>`count(*) filter (where extract(epoch from (${e.incidentes.enSitioEn} - ${e.incidentes.abiertoEn}))/60 <= ${e.incidentes.slaMin})::int`,
      llegada: sql<number>`coalesce(avg(extract(epoch from (${e.incidentes.enSitioEn} - ${e.incidentes.abiertoEn}))/60), 0)::float`,
      cierre: sql<number>`coalesce(avg(extract(epoch from (${e.incidentes.cerradoEn} - ${e.incidentes.abiertoEn}))/60), 0)::float`,
    }).from(e.incidentes).where(enPeriodo(e.incidentes.abiertoEn, periodo)).groupBy(e.incidentes.prioridad),
    db.select({ canal: e.reportes.canal, n: count() }).from(e.reportes).where(enPeriodo(e.reportes.creado, periodo)).groupBy(e.reportes.canal),
    db.select({ estado: e.reportes.estado, n: count() }).from(e.reportes)
      .where(and(periodo.desde ? gte(e.reportes.creado, periodo.desde) : undefined, lt(e.reportes.creado, periodo.hasta))).groupBy(e.reportes.estado),
  ]);

  // Resumen ejecutivo con reglas simples y verificables.
  let pico = { dia: 0, hora: 0, n: -1 };
  matriz.forEach((fila, d) => fila.forEach((n, h) => { if (n > pico.n) pico = { dia: d, hora: h, n }; }));
  const porHora = Array.from({ length: 24 }, (_, h) => matriz.reduce((s, fila) => s + fila[h], 0));
  const horaPico = porHora.indexOf(Math.max(...porHora));
  const motos = vehiculos.find((v) => v.vehiculo === 'motocicleta')?.n ?? 0;
  const conMotos = await db.select({ n: count() }).from(e.siniestros)
    .where(and(enPeriodo(e.siniestros.ocurridoEn, periodo), sql`${e.siniestros.estado} = 'verificado'`, sql`${e.siniestros.vehiculos} @> '["motocicleta"]'::jsonb`));
  const totInc = incidentes.reduce((s, i) => s + i.total, 0);
  const atendidos = incidentes.reduce((s, i) => s + i.atendidos, 0);
  const cumplidos = incidentes.reduce((s, i) => s + i.cumplidos, 0);
  const llegadaProm = atendidos ? incidentes.reduce((s, i) => s + i.llegada * i.atendidos, 0) / atendidos : 0;
  const totRep = reportesCanal.reduce((s, r) => s + r.n, 0);
  const vPrev = prev ? variacion(act.total, prev.total) : null;
  const vPasado = pasado ? variacion(act.total, pasado.total) : null;
  const vFatal = pasado ? variacion(act.fallecidos, pasado.fallecidos) : null;
  const claseTop = clases[0];

  const hallazgos = [
    `Se registraron ${numero(act.total)} siniestros viales verificados, con ${numero(act.fallecidos)} personas fallecidas y ${numero(act.heridos)} heridas.`,
    vPrev != null && `${texto(vPrev, 'Frente al periodo anterior, la siniestralidad')}${vPasado != null ? `; frente al mismo periodo del año anterior, ${vPasado === 0 ? 'se mantuvo igual' : `${vPasado > 0 ? 'aumentó' : 'disminuyó'} ${Math.abs(vPasado)} %`}` : ''}.`,
    vFatal != null && act.fallecidos + (pasado?.fallecidos ?? 0) > 0 && `${texto(vFatal, 'El número de personas fallecidas')} frente al mismo periodo del año anterior (${pasado!.fallecidos} → ${act.fallecidos}).`,
    barrios[0] && `El sector más crítico fue ${barrios[0].clave}, con ${barrios[0].n} siniestros (${porcentaje(barrios[0].n, act.total)} del total)${barrios[0].fatales ? ` y ${barrios[0].fatales} con víctimas fatales` : ''}.`,
    act.total > 0 && `La hora de mayor siniestralidad fue entre las ${horaPico}:00 y las ${horaPico + 1}:00; el momento más crítico de la semana, los ${DIAS_SEMANA[pico.dia].toLowerCase().replace(/([^s])$/, '$1s')} a las ${pico.hora}:00.`,
    act.total > 0 && `Las motocicletas estuvieron involucradas en el ${porcentaje(conMotos[0].n, act.total)} de los siniestros.`,
    claseTop && `La clase de siniestro más frecuente fue ${(CLASE[claseTop.clave as keyof typeof CLASE] ?? claseTop.clave).toLowerCase()} (${porcentaje(claseTop.n, act.total)}).`,
    totInc > 0 && `Se atendieron ${numero(totInc)} incidentes; la llegada promedio al sitio fue de ${numero(llegadaProm, 0)} minutos y el ${porcentaje(cumplidos, atendidos)} se atendió dentro del tiempo objetivo.`,
    totRep > 0 && `La ciudadanía envió ${numero(totRep)} reportes por los canales web, código QR y WhatsApp.`,
  ].filter(Boolean) as string[];

  const fmtBalde = (b: string) => { const [a, m, d] = b.split('-'); return unidad === 'month' ? `${m}/${a.slice(2)}` : `${d}/${m}`; };
  const rango = periodo.desde ? `${formatoFecha(periodo.desde)} – ${formatoFecha(new Date(periodo.hasta.getTime() - 1))}` : `Hasta ${formatoFecha(new Date(periodo.hasta.getTime() - 1))}`;

  return (
    <div className="mx-auto max-w-5xl">
      <style>{ESTILO_IMPRESION}</style>

      <div className="no-imprimir mb-8 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-borde bg-superficie p-4">
        <div>
          <h1 className="text-xl font-bold">Informe del periodo</h1>
          <p className="text-sm text-tinta-2">Elige el periodo y usa «Imprimir / Guardar PDF». El informe se arma solo con los datos verificados.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
          <BotonImprimir />
        </div>
      </div>

      <article className="space-y-12" aria-label="Informe de siniestralidad vial">
        {/* Portada */}
        <div className="overflow-hidden rounded-2xl bg-noche text-white">
          <div className="franja h-3" aria-hidden="true" />
          <div className="p-8 sm:p-12">
            <Logo claro />
            <p className="anotacion mt-10 text-white/70">Informe de siniestralidad vial · Cartagena de Indias</p>
            <p className="mt-3 text-4xl font-bold leading-tight sm:text-6xl">{periodo.etiqueta}<br /><span className="serif text-senal">{rango}</span></p>
            <p className="mt-8 text-white/80">Generado el {formatoFechaHora(new Date())} por {usuario.nombre}.</p>
          </div>
        </div>

        <Seccion numero="01" titulo="Resumen ejecutivo">
          <ul className="list-disc space-y-2 pl-5 text-lg leading-relaxed">
            {hallazgos.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi etiqueta="Siniestros" valor={act.total} variacion={prev ? variacion(act.total, prev.total) : undefined} />
            <Kpi etiqueta="Fallecidos" tono="fatal" valor={act.fallecidos} variacion={prev ? variacion(act.fallecidos, prev.fallecidos) : undefined} />
            <Kpi etiqueta="Heridos" tono="grave" valor={act.heridos} variacion={prev ? variacion(act.heridos, prev.heridos) : undefined} />
            <Kpi etiqueta="Llegada a tiempo" valor={atendidos ? Math.round((cumplidos / atendidos) * 100) : '—'} unidad={atendidos ? '%' : undefined} detalle={`${numero(totInc)} incidentes`} />
          </div>
        </Seccion>

        <Seccion numero="02" titulo="Evolución y gravedad" nuevaPagina>
          <Serie titulo="Evolución de siniestros en el periodo" puntos={linea.map((l) => ({ x: fmtBalde(l.balde), y: l.total, y2: l.graves }))} />
          <div className="mt-8"><BarraGravedad por={act.porGravedad} /></div>
        </Seccion>

        <Seccion numero="03" titulo="Dónde y cuándo">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-3 font-semibold">Barrios con más siniestros</h3>
              <div className="overflow-x-auto" tabIndex={0}><table className="tabla">
                <caption className="sr-only">Barrios con más siniestros</caption>
                <thead><tr><th scope="col">Barrio</th><th scope="col" className="num">Siniestros</th><th scope="col" className="num">Fatales</th><th scope="col" className="num">% del total</th></tr></thead>
                <tbody>{barrios.map((b) => <tr key={b.clave}><th scope="row" className="font-medium">{b.clave}</th><td className="num">{b.n}</td><td className="num">{b.fatales}</td><td className="num">{porcentaje(b.n, act.total)}</td></tr>)}</tbody>
              </table></div>
            </div>
            <div className="space-y-6">
              <div>
                <h3 className="mb-3 font-semibold">Vehículos involucrados</h3>
                <Barras titulo="Vehículos involucrados" datos={vehiculos.slice(0, 7).map((v) => ({ etiqueta: VEHICULO[v.vehiculo as keyof typeof VEHICULO] ?? v.vehiculo, valor: v.n }))} />
                <p className="mt-2 text-xs text-tinta-2">Un siniestro puede involucrar varios vehículos ({numero(motos)} menciones de motocicleta).</p>
              </div>
              <div>
                <h3 className="mb-3 font-semibold">Clase de siniestro</h3>
                <Barras titulo="Clase de siniestro" color="#B45309" datos={clases.map((c) => ({ etiqueta: CLASE[c.clave as keyof typeof CLASE] ?? c.clave, valor: c.n }))} />
              </div>
            </div>
          </div>
          <h3 className="mb-3 mt-8 font-semibold">Día de la semana y hora</h3>
          <MatrizHoraDia matriz={matriz} />
        </Seccion>

        <Seccion numero="04" titulo="Puntos negros" nuevaPagina>
          {puntos.length === 0 ? <p className="text-tinta-2">No hay puntos negros calculados.</p> : (
            <div className="overflow-x-auto" tabIndex={0}><table className="tabla">
              <caption className="sr-only">Diez puntos negros principales</caption>
              <thead><tr><th scope="col" className="num">#</th><th scope="col">Sitio</th><th scope="col" className="num">Siniestros</th><th scope="col" className="num">Fatales</th><th scope="col" className="num">EPDO</th><th scope="col">Intervención</th></tr></thead>
              <tbody>{puntos.map((p) => <tr key={p.id}><td className="num">{p.ranking}</td><th scope="row" className="font-medium">{p.nombre}</th><td className="num">{p.total}</td><td className="num">{p.fatales}</td><td className="num">{numero(p.indice)}</td><td>{INTERVENCION[p.estadoIntervencion].texto}</td></tr>)}</tbody>
            </table></div>
          )}
          <p className="mt-2 text-sm text-tinta-2">Ranking vigente (último cálculo: {puntos[0] ? formatoFechaHora(puntos[0].calculadoEn) : '—'}).</p>
        </Seccion>

        <Seccion numero="05" titulo="Atención de incidentes">
          {totInc === 0 ? <p className="text-tinta-2">No hubo incidentes en el periodo.</p> : (
            <div className="overflow-x-auto" tabIndex={0}><table className="tabla">
              <caption className="sr-only">Incidentes atendidos por prioridad</caption>
              <thead><tr><th scope="col">Prioridad</th><th scope="col" className="num">Tiempo objetivo</th><th scope="col" className="num">Incidentes</th><th scope="col" className="num">Llegada promedio</th><th scope="col" className="num">Dentro del objetivo</th><th scope="col" className="num">Cierre promedio</th></tr></thead>
              <tbody>
                {(['critica', 'alta', 'media', 'baja'] as const).map((p) => {
                  const i = incidentes.find((x) => x.prioridad === p);
                  if (!i) return null;
                  return (
                    <tr key={p}>
                      <th scope="row" className="font-medium">{PRIORIDAD[p].texto}</th>
                      <td className="num">{PRIORIDAD[p].sla} min</td>
                      <td className="num">{i.total}</td>
                      <td className="num">{i.atendidos ? `${numero(i.llegada, 0)} min` : '—'}</td>
                      <td className="num">{porcentaje(i.cumplidos, i.atendidos)}</td>
                      <td className="num">{i.cierre ? `${numero(i.cierre, 0)} min` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </Seccion>

        <Seccion numero="06" titulo="Reportes ciudadanos">
          {totRep === 0 ? <p className="text-tinta-2">No hubo reportes ciudadanos en el periodo.</p> : (
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <h3 className="mb-3 font-semibold">Por canal</h3>
                <Barras titulo="Reportes por canal" datos={reportesCanal.sort((a, b) => b.n - a.n).map((r) => ({ etiqueta: CANAL[r.canal] ?? r.canal, valor: r.n, nota: porcentaje(r.n, totRep) }))} />
              </div>
              <div>
                <h3 className="mb-3 font-semibold">Por resultado de la revisión</h3>
                <Barras titulo="Reportes por estado" color="#15803D" datos={reportesEstado.sort((a, b) => b.n - a.n).map((r) => ({ etiqueta: ESTADO_REPORTE[r.estado].texto, valor: r.n }))} />
              </div>
            </div>
          )}
        </Seccion>

        <Seccion numero="07" titulo="Metodología">
          <div className="space-y-3 text-tinta-2">
            <p>Se cuentan solo siniestros <strong className="text-tinta">verificados</strong>; los descartados y los pendientes de verificación no se incluyen. Las horas están en hora de Colombia (UTC−5).</p>
            <p>Las variaciones comparan con el periodo inmediatamente anterior de igual duración y con el mismo periodo del año anterior. Los puntos negros se detectan con DBSCAN y se ordenan por el índice EPDO (daños equivalentes: solo daños ×1, heridos leves ×3, graves ×6, fatales ×12).</p>
            <p>El tiempo objetivo de llegada depende de la prioridad del incidente. Los reportes ciudadanos se clasifican por el canal de entrada y el resultado de su revisión.</p>
            <p className="text-sm">Pulso Vial es una iniciativa independiente; este informe no representa a ninguna entidad oficial.</p>
          </div>
        </Seccion>
      </article>
    </div>
  );
}
