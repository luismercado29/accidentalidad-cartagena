import { count, eq } from 'drizzle-orm';
import { Activity, Ambulance, Download, HeartCrack, TriangleAlert } from 'lucide-react';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BarraGravedad, Barras, MatrizHoraDia, Serie } from '@/components/graficos';
import { Aviso, Kpi, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, matrizHoraDia, porVehiculo, ranking, resumen, serie } from '@/lib/consultas';
import { CLASE, etiquetaDe, GRAVEDAD, VEHICULO } from '@/lib/etiquetas';
import { diaISO, mismoPeriodoAnioAnterior, paramsPeriodo, resolverPeriodo, variacion } from '@/lib/tiempo';

export const metadata = { title: 'Datos abiertos', description: 'Indicadores de siniestralidad vial de Cartagena con descarga en CSV.' };
export const dynamic = 'force-dynamic';

export default async function Datos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, 'anio');
  const comparado = mismoPeriodoAnioAnterior(periodo);
  const dias = periodo.desde ? (periodo.hasta.getTime() - periodo.desde.getTime()) / 86_400_000 : 9999;
  const unidad = dias <= 45 ? 'day' : dias <= 200 ? 'week' : 'month';

  const [actual, previo, linea, matriz, barrios, clases, vehiculos, anios, simulados] = await Promise.all([
    resumen({ periodo }),
    comparado ? resumen({ periodo: comparado }) : null,
    serie({ periodo }, unidad),
    matrizHoraDia({ periodo }),
    ranking({ periodo }, 'barrio', 10),
    ranking({ periodo }, 'clase', 6),
    porVehiculo({ periodo }),
    aniosDisponibles(),
    db.select({ n: count() }).from(e.siniestros).where(eq(e.siniestros.fuente, 'simulado')),
  ]);

  const fmtBalde = (b: string) => {
    const [a, m, d] = b.split('-');
    return unidad === 'month' ? `${m}/${a.slice(2)}` : `${d}/${m}`;
  };
  const graves = actual.porGravedad.grave + actual.porGravedad.fatal;
  const gravesPrevio = previo ? previo.porGravedad.grave + previo.porGravedad.fatal : 0;
  const csv = `/api/datos/csv?${paramsPeriodo(sp).toString()}`;

  return (
    <div className="contenedor space-y-8 py-12 lg:py-16">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="anotacion text-tinta-3">Datos abiertos · {periodo.etiqueta}</p>
          <h1 className="mt-3 text-4xl font-bold sm:text-6xl">La vía, en <span className="serif text-marca">números</span>.</h1>
          <p className="mt-3 max-w-2xl text-lg text-tinta-2">
            Indicadores de siniestralidad vial de Cartagena. Elige un periodo —también puedes consultar años anteriores
            o un rango de fechas— y descarga los datos agregados.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios}
            desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
          <a href={csv} className="boton boton-secundario min-h-10" download>
            <Download className="size-4" aria-hidden="true" />Descargar CSV
          </a>
        </div>
      </header>

      {simulados[0].n > 0 && (
        <Aviso tono="aviso">
          <span className="flex gap-2"><TriangleAlert className="mt-0.5 size-5 shrink-0 text-aviso" aria-hidden="true" />
            <span>Esta instalación incluye <strong>datos de demostración</strong> generados con patrones realistas. No corresponden a hechos reales. <a href="#metodologia" className="font-semibold underline underline-offset-4">Ver metodología</a>.</span>
          </span>
        </Aviso>
      )}

      <section aria-label="Indicadores principales" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Siniestros" icono={Activity} valor={actual.total} variacion={previo ? variacion(actual.total, previo.total) : undefined} />
        <Kpi etiqueta="Víctimas fatales" icono={HeartCrack} tono="fatal" valor={actual.fallecidos} variacion={previo ? variacion(actual.fallecidos, previo.fallecidos) : undefined} />
        <Kpi etiqueta="Personas heridas" icono={Ambulance} tono="grave" valor={actual.heridos} variacion={previo ? variacion(actual.heridos, previo.heridos) : undefined} />
        <Kpi etiqueta="Siniestros graves o fatales" icono={TriangleAlert} valor={graves} variacion={previo ? variacion(graves, gravesPrevio) : undefined} />
      </section>
      {previo && <p className="-mt-4 text-sm text-tinta-2">Las variaciones comparan con el mismo periodo del año anterior.</p>}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel titulo="Evolución" descripcion={`Siniestros por ${unidad === 'day' ? 'día' : unidad === 'week' ? 'semana' : 'mes'}`}>
          <Serie titulo="Evolución de siniestros" puntos={linea.map((l) => ({ x: fmtBalde(l.balde), y: l.total, y2: l.graves }))} />
        </Panel>
        <Panel titulo="Gravedad"><BarraGravedad por={actual.porGravedad} /></Panel>
      </div>

      <Panel titulo="¿Cuándo ocurren?" descripcion="Siniestros por día de la semana y hora (hora de Colombia)">
        <MatrizHoraDia matriz={matriz} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel titulo="Barrios">
          <Barras titulo="Siniestros por barrio" datos={barrios.map((b) => ({ etiqueta: b.clave, valor: b.n, nota: b.fatales ? `${b.fatales} fatales` : undefined }))} />
        </Panel>
        <Panel titulo="Clase de siniestro">
          <Barras titulo="Siniestros por clase" color="#B45309" datos={clases.map((c) => ({ etiqueta: etiquetaDe(CLASE, c.clave, c.clave), valor: c.n }))} />
        </Panel>
        <Panel titulo="Actores involucrados" descripcion="Un siniestro puede involucrar varios">
          <Barras titulo="Siniestros por tipo de vehículo o actor vial" color="#121019" datos={vehiculos.slice(0, 8).map((v) => ({ etiqueta: etiquetaDe(VEHICULO, v.vehiculo, v.vehiculo), valor: v.n }))} />
        </Panel>
      </div>

      <section id="metodologia" aria-labelledby="metodologia-titulo" className="sobre-oscuro scroll-mt-24 overflow-hidden rounded-3xl bg-noche text-white">
        <div className="franja h-2" aria-hidden="true" />
        <div className="grid gap-10 p-8 lg:grid-cols-[1fr_1.4fr] lg:p-12">
          <div>
            <p className="anotacion text-white/60">Notas técnicas</p>
            <h2 id="metodologia-titulo" className="mt-3 text-4xl font-bold">Metodo<span className="serif text-senal">logía</span></h2>
            <p className="mt-4 text-white/80">Cómo se construyen estas cifras y qué significan.</p>
          </div>
          <div className="space-y-8 text-white/85">
            <div>
              <h3 className="text-xl font-bold text-white">Fuentes</h3>
              <p className="mt-2">Registros del equipo de gestión, reportes ciudadanos verificados (web, QR y WhatsApp), cargas de históricos
                y noticias de medios locales clasificadas y confirmadas por el equipo. Solo se cuentan siniestros <strong>verificados</strong>;
                los descartados o pendientes no aparecen en estos indicadores.</p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Gravedad</h3>
              <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                {(['solo_danos', 'leve', 'grave', 'fatal'] as const).map((g) => (
                  <div key={g} className="contents">
                    <dt className="font-semibold text-white">{GRAVEDAD[g].texto}</dt>
                    <dd>{{ solo_danos: 'Solo daños materiales, sin personas lesionadas.', leve: 'Al menos una persona herida que no requirió hospitalización prolongada.', grave: 'Al menos una persona con lesiones graves u hospitalizada.', fatal: 'Al menos una persona fallecida en el sitio o a consecuencia del siniestro.' }[g]}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Índice EPDO</h3>
              <p className="mt-2">Para priorizar sitios se usa el índice de daños equivalentes (EPDO): cada siniestro pesa según su gravedad
                — solo daños 1, leve 3, grave 6, fatal 12 — de modo que un lugar con víctimas fatales pesa más que uno con muchos choques simples.</p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Fechas y horas</h3>
              <p className="mt-2">Todas las fechas están en hora de Colombia (UTC−5). «Hace un año» compara los mismos 30 días del año anterior;
                los KPI se comparan con el mismo periodo del año anterior.</p>
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Descarga y privacidad</h3>
              <p className="mt-2">El CSV trae conteos por día, barrio y gravedad. No incluye coordenadas exactas, descripciones ni datos de
                quienes reportan.</p>
            </div>
            {simulados[0].n > 0 && (
              <div className="rounded-2xl border border-senal/40 bg-white/5 p-5">
                <h3 className="text-xl font-bold text-senal">Datos de demostración</h3>
                <p className="mt-2">Esta instalación contiene {simulados[0].n.toLocaleString('es-CO')} siniestros simulados con patrones típicos de
                  la ciudad (corredores principales, horas pico, fines de semana nocturnos, temporada de lluvias). Sirven para mostrar el
                  funcionamiento del sistema y se pueden eliminar desde la consola.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
