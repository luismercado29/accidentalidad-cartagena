import { and, asc, between, eq, ne, sql } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Serie } from '@/components/graficos';
import { Mapa } from '@/components/mapa/Mapa';
import { Encabezado, Insignia, Kpi, Panel, numero } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { PESO_EPDO } from '@/lib/analitica/puntos-negros';
import { COLOR_MAPA, GRAVEDAD, INTERVENCION } from '@/lib/etiquetas';
import { coordenadas, distanciaM } from '@/lib/geo';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { diaISO, fechaLocal, formatoFecha, formatoFechaHora, parsearDia, partesLocales } from '@/lib/tiempo';

import { FormPunto } from '../Formularios';

export const metadata = { title: 'Ficha de punto negro' };

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export default async function FichaPunto({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, { id }, sp] = await Promise.all([requerirRol(PERMISOS.analizar), params, searchParams]);
  const num = Number(id);
  if (!Number.isInteger(num)) notFound();
  const p = await db.query.puntosNegros.findFirst({ where: eq(e.puntosNegros.id, num) });
  if (!p) notFound();

  // Siniestros dentro del radio en los ultimos 3 años (caja aproximada y luego distancia exacta).
  const ahora = new Date();
  const { anio, mes } = partesLocales(ahora);
  const inicio = fechaLocal(anio - 3, mes, 1);
  const margen = (p.radioM + 50) / 111_000;
  const crudos = await db.select({ id: e.siniestros.id, codigo: e.siniestros.codigo, lat: e.siniestros.lat, lng: e.siniestros.lng, gravedad: e.siniestros.gravedad, ocurridoEn: e.siniestros.ocurridoEn, descripcion: e.siniestros.descripcion })
    .from(e.siniestros)
    .where(and(
      ne(e.siniestros.estado, 'descartado'),
      between(e.siniestros.lat, p.lat - margen, p.lat + margen),
      between(e.siniestros.lng, p.lng - margen * 1.02, p.lng + margen * 1.02),
      sql`${e.siniestros.ocurridoEn} >= ${inicio}`,
    ))
    .orderBy(asc(e.siniestros.ocurridoEn));
  const dentro = crudos.filter((s) => distanciaM(p.lat, p.lng, s.lat, s.lng) <= p.radioM);

  // Serie mensual de 36 meses.
  const meses = Array.from({ length: 37 }, (_, i) => {
    const f = fechaLocal(anio - 3, mes + i, 1);
    const x = partesLocales(f);
    return { clave: `${x.anio}-${x.mes}`, etiqueta: `${MESES_CORTOS[x.mes]} ${String(x.anio).slice(2)}`, inicio: f, total: 0, graves: 0 };
  });
  const indice = new Map(meses.map((m, i) => [m.clave, i]));
  for (const s of dentro) {
    const x = partesLocales(s.ocurridoEn);
    const i = indice.get(`${x.anio}-${x.mes}`);
    if (i == null) continue;
    meses[i].total++;
    if (s.gravedad === 'grave' || s.gravedad === 'fatal') meses[i].graves++;
  }

  // Fecha de corte para el antes/despues: la elegida, o la primera vez que se marco en intervencion.
  const marca = await db.select({ creado: e.auditoria.creado }).from(e.auditoria)
    .where(and(eq(e.auditoria.entidad, 'puntos_negros'), eq(e.auditoria.entidadId, String(p.id)),
      sql`${e.auditoria.detalle}->>'estadoIntervencion' in ('en_intervencion','intervenido')`))
    .orderBy(asc(e.auditoria.creado)).limit(1);
  const corte = parsearDia(typeof sp.corte === 'string' ? sp.corte : undefined) ?? marca[0]?.creado ?? null;

  let comparacion: { antes: number; despues: number; mesesAntes: number; mesesDespues: number; epdoAntes: number; epdoDespues: number } | null = null;
  if (corte) {
    const ventana = 365 * 86_400_000;
    const antes = dentro.filter((s) => s.ocurridoEn < corte && s.ocurridoEn.getTime() >= corte.getTime() - ventana);
    const despues = dentro.filter((s) => s.ocurridoEn >= corte && s.ocurridoEn.getTime() < corte.getTime() + ventana);
    const mesesDespues = Math.max(1, Math.min(12, (ahora.getTime() - corte.getTime()) / (30.4 * 86_400_000)));
    comparacion = {
      antes: antes.length, despues: despues.length, mesesAntes: 12, mesesDespues,
      epdoAntes: antes.reduce((a, s) => a + PESO_EPDO[s.gravedad], 0), epdoDespues: despues.reduce((a, s) => a + PESO_EPDO[s.gravedad], 0),
    };
  }
  const tasa = (n: number, m: number) => n / m;
  const cambio = comparacion && comparacion.antes
    ? Math.round(((tasa(comparacion.despues, comparacion.mesesDespues) - tasa(comparacion.antes, 12)) / tasa(comparacion.antes, 12)) * 100)
    : null;

  return (
    <div className="space-y-6">
      <Link href="/consola/puntos-negros" className="inline-flex items-center gap-1.5 font-semibold text-marca hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />Volver al ranking
      </Link>
      <Encabezado
        anotacion={`#${p.ranking} · ${coordenadas(p.lat, p.lng)} · radio ${p.radioM} m`}
        titulo={p.nombre}
        descripcion={<>Barrio {p.barrio ?? 'sin dato'} · calculado el {formatoFechaHora(p.calculadoEn)} · <Insignia tono={INTERVENCION[p.estadoIntervencion].tono}>{INTERVENCION[p.estadoIntervencion].texto}</Insignia></>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="Siniestros en el grupo" valor={p.total} />
        <Kpi etiqueta="Fatales" valor={p.fatales} tono="fatal" />
        <Kpi etiqueta="Graves" valor={p.graves} tono="grave" />
        <Kpi etiqueta="Índice EPDO" valor={numero(p.indice)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Siniestros en el radio" descripcion={`${dentro.length} en los últimos 3 años`}>
          <Mapa etiqueta={`Mapa del punto negro ${p.nombre}`} alto="22rem" centro={[p.lat, p.lng]} zoom={17}
            capas={[
              { tipo: 'circulos', items: [{ lat: p.lat, lng: p.lng, radioM: p.radioM, color: '#121019', relleno: 0.05 }] },
              { tipo: 'puntos', items: dentro.map((s) => ({ lat: s.lat, lng: s.lng, color: COLOR_MAPA[s.gravedad], radio: 6, ventana: { titulo: s.codigo, lineas: [GRAVEDAD[s.gravedad].texto, formatoFechaHora(s.ocurridoEn), s.descripcion ?? ''] } })) },
            ]} />
        </Panel>
        <Panel titulo="Seguimiento" descripcion="Nombre, estado de la intervención y medidas tomadas.">
          <FormPunto id={p.id} nombre={p.nombre} estadoIntervencion={p.estadoIntervencion} notas={p.notas} />
        </Panel>
      </div>

      <Panel titulo="Evolución mensual en el radio" descripcion="Total de siniestros y, en línea discontinua, los graves y fatales.">
        <Serie titulo={`Siniestros por mes en ${p.nombre}`} puntos={meses.map((m) => ({ x: m.etiqueta, y: m.total, y2: m.graves }))} />
      </Panel>

      <Panel titulo="Antes y después de la intervención"
        descripcion="Compara los 12 meses previos a la fecha de corte con los meses posteriores (hasta 12), en siniestros por mes.">
        <form className="mb-4 flex flex-wrap items-end gap-3" method="get">
          <label className="block">
            <span className="text-sm font-semibold text-tinta-2">Fecha de corte (inicio de la intervención)</span>
            <input type="date" name="corte" defaultValue={corte ? diaISO(corte) : ''} className="campo mt-1 min-h-10 py-1.5" />
          </label>
          <button type="submit" className="boton boton-secundario boton-chico min-h-10">Comparar</button>
        </form>
        {!comparacion ? (
          <p className="text-tinta-2">Elige una fecha de corte, o marca el punto como «En intervención»: esa fecha se usará automáticamente.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-hundido p-4">
              <p className="text-sm font-semibold text-tinta-2">Antes (12 meses hasta el {formatoFecha(corte!)})</p>
              <p className="cifra mt-2 text-4xl">{numero(tasa(comparacion.antes, 12), 1)}<span className="ml-1 font-sans text-base text-tinta-2">/ mes</span></p>
              <p className="text-sm text-tinta-2">{comparacion.antes} siniestros · EPDO {comparacion.epdoAntes}</p>
            </div>
            <div className="rounded-xl bg-hundido p-4">
              <p className="text-sm font-semibold text-tinta-2">Después ({numero(comparacion.mesesDespues, 1)} meses)</p>
              <p className="cifra mt-2 text-4xl">{numero(tasa(comparacion.despues, comparacion.mesesDespues), 1)}<span className="ml-1 font-sans text-base text-tinta-2">/ mes</span></p>
              <p className="text-sm text-tinta-2">{comparacion.despues} siniestros · EPDO {comparacion.epdoDespues}</p>
            </div>
            <div className="rounded-xl bg-hundido p-4">
              <p className="text-sm font-semibold text-tinta-2">Cambio en la tasa mensual</p>
              <p className={`cifra mt-2 text-4xl ${cambio == null ? '' : cambio <= 0 ? 'text-exito' : 'text-error'}`}>{cambio == null ? '—' : `${cambio > 0 ? '+' : ''}${cambio} %`}</p>
              <p className="text-sm text-tinta-2">{cambio == null ? 'Sin siniestros antes del corte.' : cambio <= 0 ? 'La siniestralidad bajó tras la intervención.' : 'La siniestralidad no ha bajado aún.'}</p>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
