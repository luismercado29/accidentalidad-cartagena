import { ArrowRight, ArrowUpRight, ChartColumn, Flame, MessageCircleQuestion, Route, Siren } from 'lucide-react';
import Link from 'next/link';

import { Mapa } from '@/components/mapa/Mapa';
import { AnimacionesPortada } from '@/components/portada/AnimacionesPortada';
import { CintaBarrios } from '@/components/portada/CintaBarrios';
import { puntosMapa, ranking, resumen } from '@/lib/consultas';
import { mismoPeriodoAnioAnterior, partesLocales, resolverPeriodo, variacion } from '@/lib/tiempo';

export const dynamic = 'force-dynamic';

const ACCIONES = [
  { href: '/reportar', titulo: 'Reporta', destacado: 'un siniestro', texto: 'Sin cuenta, desde el celular o con el código QR del paradero. Recibes un código para seguir tu reporte.', icono: Siren },
  { href: '/ruta-segura', titulo: 'Elige tu', destacado: 'ruta segura', texto: 'Compara recorridos según los siniestros registrados cerca de la vía y a la hora en que viajas.', icono: Route },
  { href: '/mapa', titulo: 'Mira el', destacado: 'mapa de calor', texto: 'Dónde se concentran los siniestros, filtrados por fecha, gravedad y tipo de vehículo.', icono: Flame },
  { href: '/datos', titulo: 'Consulta los', destacado: 'datos abiertos', texto: 'Indicadores, tendencias y descargas en CSV, agregados y sin datos personales.', icono: ChartColumn },
  { href: '/asistente', titulo: 'Pregunta al', destacado: 'asistente', texto: '«¿Dónde hubo más choques de moto este año?» Respuestas a partir de los datos.', icono: MessageCircleQuestion },
];

function Variacion({ actual, anterior, etiqueta }: { actual: number; anterior: number; etiqueta: string }) {
  const v = variacion(actual, anterior);
  if (v == null) return <span className="anotacion text-white/60">Sin base de comparación</span>;
  const baja = v < 0;
  return (
    <span className={`anotacion ${baja ? 'text-[#7EE2A8]' : 'text-[#FF9C8A]'}`}>
      {v > 0 ? '+' : ''}{v} % vs. {etiqueta}<span className="sr-only">{baja ? ' (disminuyó)' : v > 0 ? ' (aumentó)' : ''}</span>
    </span>
  );
}

export default async function Portada() {
  const ahora = new Date();
  const anio = partesLocales(ahora).anio;
  const periodo = resolverPeriodo({ periodo: 'anio' }, 'anio', ahora);
  const anterior = mismoPeriodoAnioAnterior(periodo)!;
  const [actual, previo, barrios, puntos] = await Promise.all([
    resumen({ periodo }),
    resumen({ periodo: anterior }),
    ranking({ periodo: resolverPeriodo({ periodo: '12m' }, '12m', ahora) }, 'barrio', 10),
    puntosMapa({ periodo: resolverPeriodo({ periodo: '90d' }, '90d', ahora) }, 6000),
  ]);

  const cifras = [
    { etiqueta: 'siniestros viales', valor: actual.total, anterior: previo.total },
    { etiqueta: 'personas fallecidas', valor: actual.fallecidos, anterior: previo.fallecidos },
    { etiqueta: 'personas heridas', valor: actual.heridos, anterior: previo.heridos },
  ];

  return (
    <AnimacionesPortada>
      {/* Heroe */}
      <section className="relative overflow-hidden">
        <div className="contenedor grid gap-10 pb-16 pt-12 lg:grid-cols-[1.25fr_1fr] lg:items-end lg:pb-24 lg:pt-20">
          <div>
            <p className="anotacion text-tinta-3" data-anim="entrada">Observatorio de siniestralidad vial · Cartagena de Indias</p>
            <h1 className="titular mt-5" data-anim="titular">
              Cada siniestro tiene un <span className="whitespace-nowrap"><span className="serif text-marca">lugar</span>,</span> una hora y una historia.
            </h1>
            <p className="mt-6 max-w-xl text-lg text-tinta-2" data-anim="entrada">
              Pulso Vial reúne los siniestros de la ciudad para que sepas dónde está el riesgo, elijas rutas más seguras
              y reportes lo que ves en la vía. Datos abiertos, sin cuenta y accesibles.
            </p>
            <div className="mt-8 flex flex-wrap gap-3" data-anim="entrada">
              <Link href="/reportar" className="boton boton-senal h-[52px] px-6"><Siren className="size-5" aria-hidden="true" />Reportar un siniestro</Link>
              <Link href="/mapa" className="boton boton-secundario h-[52px] px-6">Ver el mapa de calor <ArrowRight className="size-4" aria-hidden="true" /></Link>
            </div>
          </div>
          <div className="relative">
            <div className="tarjeta overflow-hidden p-2" data-anim="portada">
              <Mapa etiqueta="Mapa de calor de siniestros de los últimos 90 días en Cartagena" alto="22rem" zoom={12}
                capas={[{ tipo: 'calor', puntos: puntos.map((p) => [p.lat, p.lng, p.gravedad === 'fatal' ? 1 : p.gravedad === 'grave' ? 0.7 : 0.4]) }]} />
            </div>
            <p className="anotacion mt-3 flex justify-between text-tinta-3">
              <span>Fig. 01 — Últimos 90 días</span><span>{puntos.length.toLocaleString('es-CO')} puntos</span>
            </p>
            <p className="sr-only">
              El mapa muestra {puntos.length} siniestros de los últimos 90 días. Los barrios con más siniestros en los últimos 12 meses son:
              {' '}{barrios.slice(0, 5).map((b) => `${b.clave} (${b.n})`).join(', ')}. La tabla completa está en Datos abiertos.
            </p>
          </div>
        </div>
      </section>

      {/* Cifras del año */}
      <section aria-labelledby="cifras-titulo" className="sobre-oscuro bg-noche text-white">
        <div className="franja h-2" aria-hidden="true" />
        <div className="contenedor py-16 lg:py-20">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="cifras-titulo" className="text-3xl font-bold sm:text-5xl" data-anim="titulo-seccion">
              {anio}, <span className="serif text-senal">en cifras</span>.
            </h2>
            <p className="anotacion text-white/60">Del 1 de enero a hoy · comparado con el mismo periodo de {anio - 1}</p>
          </div>
          <dl className="mt-12 grid gap-10 md:grid-cols-3">
            {cifras.map((c) => (
              <div key={c.etiqueta} className="revelar border-t border-white/20 pt-6">
                <dt className="text-lg text-white/80">{c.etiqueta}</dt>
                <dd className="mt-2">
                  <span className="cifra block text-[clamp(4rem,10vw,7.5rem)] text-white">{c.valor.toLocaleString('es-CO')}</span>
                  <Variacion actual={c.valor} anterior={c.anterior} etiqueta={String(anio - 1)} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {barrios.length > 0 && <CintaBarrios barrios={barrios.map((b) => ({ nombre: b.clave, total: b.n, fatales: b.fatales }))} />}

      {/* Que puedes hacer */}
      <section aria-labelledby="acciones-titulo" className="contenedor py-20 lg:py-28">
        <p className="anotacion text-tinta-3">Para la ciudadanía</p>
        <h2 id="acciones-titulo" className="mt-3 max-w-3xl text-4xl font-bold sm:text-6xl" data-anim="titulo-seccion">
          Qué puedes <span className="serif text-marca">hacer</span> hoy.
        </h2>
        <ol className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {ACCIONES.map((a, i) => {
            const Icono = a.icono;
            return (
              <li key={a.href} className="revelar">
                <Link href={a.href} className="tarjeta group flex h-full flex-col p-6 transition-transform duration-300 hover:-translate-y-1 hover:shadow-elevada">
                  <span className="flex items-start justify-between">
                    <span className="serif text-[4.5rem] leading-none text-tinta-3" data-anim="numero" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                    <Icono className="size-6 text-marca" aria-hidden="true" />
                  </span>
                  <span className="mt-6 block text-2xl font-bold">{a.titulo} <span className="serif text-marca">{a.destacado}</span></span>
                  <span className="mt-2 block text-tinta-2">{a.texto}</span>
                  <span className="mt-auto flex items-center gap-1 pt-6 font-semibold text-marca group-hover:underline">
                    Ir<ArrowUpRight className="size-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Sala de control */}
      <section aria-labelledby="sala-titulo" className="sobre-oscuro bg-noche text-white">
        <div className="contenedor grid gap-12 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div>
            <p className="anotacion text-white/60">Para el equipo de gestión</p>
            <h2 id="sala-titulo" className="mt-3 text-4xl font-bold sm:text-6xl" data-anim="titulo-seccion">
              Cómo se usa en la <span className="serif text-senal">sala de control</span>.
            </h2>
            <p className="mt-6 max-w-lg text-lg text-white/80">
              Los reportes ciudadanos, las noticias y los mensajes llegan a una sola bandeja. El equipo los verifica,
              despacha unidades, sigue cada incidente hasta su cierre y analiza dónde intervenir.
            </p>
            <Link href="/ingresar" className="boton boton-claro mt-8 h-[52px] px-6">Ingreso del equipo <ArrowRight className="size-4" aria-hidden="true" /></Link>
          </div>
          <ol className="space-y-px overflow-hidden rounded-2xl border border-noche-borde">
            {[
              ['Recibe', 'Reportes por web, QR y WhatsApp, más noticias clasificadas automáticamente.'],
              ['Despacha', 'Asigna la unidad más cercana y mide el tiempo de llegada contra el objetivo.'],
              ['Vigila', 'Alertas por zona, geocercas y cámaras en un panel de turno en vivo.'],
              ['Analiza', 'Puntos negros, comparativos anuales y predicción de riesgo por hora.'],
            ].map(([t, d], i) => (
              <li key={t} className="revelar flex gap-5 bg-noche-2 p-6">
                <span className="anotacion pt-1 text-senal">{String(i + 1).padStart(2, '0')}</span>
                <span><span className="block text-xl font-bold">{t}</span><span className="mt-1 block text-white/75">{d}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </AnimacionesPortada>
  );
}
