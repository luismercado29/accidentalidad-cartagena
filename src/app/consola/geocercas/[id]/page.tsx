import { and, desc, eq, gte, lt, ne } from 'drizzle-orm';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { eliminarGeocerca } from '@/app/acciones/territorio';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BarraGravedad } from '@/components/graficos';
import { Mapa } from '@/components/mapa/Mapa';
import { Mensaje } from '@/components/territorio/Mensaje';
import { Encabezado, Insignia, InsigniaGravedad, Kpi, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import type { Gravedad } from '@/db/esquema';
import { aniosDisponibles } from '@/lib/consultas';
import { COLOR_MAPA, ESTADO_INCIDENTE, NIVEL_ALERTA, PRIORIDAD } from '@/lib/etiquetas';
import { puntoEnPoligono } from '@/lib/geo';
import { requerirRol, PERMISOS } from '@/lib/sesion';
import { diaISO, formatoFechaHora, hace, resolverPeriodo } from '@/lib/tiempo';

import { FormularioGeocerca } from '../FormularioGeocerca';

export const metadata = { title: 'Ficha de geocerca' };

export default async function FichaGeocerca({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, { id }, sp] = await Promise.all([requerirRol(PERMISOS.configurar), params, searchParams]);
  const g = await db.query.geocercas.findFirst({ where: eq(e.geocercas.id, Number(id) || 0) });
  if (!g) notFound();
  const periodo = resolverPeriodo(sp, '12m');

  // Prefiltro por la caja del poligono en SQL; el poligono exacto se evalua aqui.
  const lngs = g.poligono.map((p) => p[0]), lats = g.poligono.map((p) => p[1]);
  const caja = and(
    gte(e.siniestros.lat, Math.min(...lats)), lt(e.siniestros.lat, Math.max(...lats)),
    gte(e.siniestros.lng, Math.min(...lngs)), lt(e.siniestros.lng, Math.max(...lngs)),
  );
  const [candidatos, incidentesCaja, alertas, anios, otras] = await Promise.all([
    db.select({ id: e.siniestros.id, codigo: e.siniestros.codigo, lat: e.siniestros.lat, lng: e.siniestros.lng, gravedad: e.siniestros.gravedad, ocurridoEn: e.siniestros.ocurridoEn, descripcion: e.siniestros.descripcion, heridos: e.siniestros.heridos, fallecidos: e.siniestros.fallecidos })
      .from(e.siniestros)
      .where(and(caja, ne(e.siniestros.estado, 'descartado'), periodo.desde ? gte(e.siniestros.ocurridoEn, periodo.desde) : undefined, lt(e.siniestros.ocurridoEn, periodo.hasta)))
      .orderBy(desc(e.siniestros.ocurridoEn)),
    db.select().from(e.incidentes)
      .where(and(gte(e.incidentes.lat, Math.min(...lats)), lt(e.incidentes.lat, Math.max(...lats)), gte(e.incidentes.lng, Math.min(...lngs)), lt(e.incidentes.lng, Math.max(...lngs))))
      .orderBy(desc(e.incidentes.abiertoEn)).limit(200),
    db.select().from(e.alertas).where(eq(e.alertas.geocercaId, g.id)).orderBy(desc(e.alertas.creado)).limit(5),
    aniosDisponibles(),
    db.select().from(e.geocercas).where(ne(e.geocercas.id, g.id)),
  ]);
  const dentro = candidatos.filter((s) => puntoEnPoligono(s.lat, s.lng, g.poligono));
  const incidentes = incidentesCaja.filter((i) => puntoEnPoligono(i.lat, i.lng, g.poligono)).slice(0, 6);
  const por = { solo_danos: 0, leve: 0, grave: 0, fatal: 0 } as Record<Gravedad, number>;
  for (const s of dentro) por[s.gravedad]++;
  const latLng = g.poligono.map(([lng, lat]) => [lat, lng] as [number, number]);

  return (
    <div className="space-y-6">
      <Link href="/consola/geocercas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Todas las geocercas</Link>
      <Encabezado
        anotacion={`Geocerca · ${periodo.etiqueta}`}
        titulo={g.nombre}
        descripcion={g.descripcion ?? undefined}
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />}
      />
      <div className="flex flex-wrap gap-2">
        <Insignia tono={NIVEL_ALERTA[g.nivel].tono}>Nivel {NIVEL_ALERTA[g.nivel].texto.toLowerCase()}</Insignia>
        <Insignia tono={g.activa ? 'ok' : 'neutro'}>{g.activa ? 'Activa' : 'Inactiva'}</Insignia>
      </div>
      <Mensaje sp={sp} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi etiqueta="Siniestros dentro" valor={dentro.length} detalle={periodo.etiqueta} />
        <Kpi etiqueta="Víctimas fatales" tono="fatal" valor={dentro.reduce((s, x) => s + x.fallecidos, 0)} />
        <Kpi etiqueta="Personas heridas" tono="grave" valor={dentro.reduce((s, x) => s + x.heridos, 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Siniestros en la zona">
          <Mapa etiqueta={`Siniestros dentro de la geocerca ${g.nombre}`} alto="26rem" ajustar
            capas={[
              { tipo: 'poligonos', items: [{ coords: latLng, color: g.color }] },
              { tipo: 'puntos', items: dentro.slice(0, 3000).map((s) => ({ lat: s.lat, lng: s.lng, color: COLOR_MAPA[s.gravedad], radio: s.gravedad === 'fatal' ? 7 : 5, ventana: { titulo: s.codigo, lineas: [formatoFechaHora(s.ocurridoEn), s.descripcion ?? ''] } })) },
            ]} />
        </Panel>
        <div className="space-y-6">
          <Panel titulo="Gravedad"><BarraGravedad por={por} /></Panel>
          <Panel titulo="Incidentes recientes en la zona">
            {incidentes.length === 0 ? <p className="text-tinta-2">Sin incidentes registrados dentro de la zona.</p> : (
              <ul className="divide-y divide-borde">
                {incidentes.map((i) => (
                  <li key={i.id} className="py-2.5 first:pt-0">
                    <Link href={`/consola/incidentes/${i.id}`} className="group block">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="anotacion text-tinta-3">{i.codigo}</span>
                        <Insignia tono={PRIORIDAD[i.prioridad].tono}>{PRIORIDAD[i.prioridad].texto}</Insignia>
                        <Insignia tono={ESTADO_INCIDENTE[i.estado].tono} punto={false}>{ESTADO_INCIDENTE[i.estado].texto}</Insignia>
                      </span>
                      <span className="mt-0.5 block font-semibold group-hover:underline">{i.titulo}</span>
                      <span className="text-sm text-tinta-2">{hace(i.abiertoEn)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {alertas.length > 0 && (
            <Panel titulo="Alertas de esta geocerca">
              <ul className="space-y-2 text-sm">{alertas.map((a) => <li key={a.id}><strong>{a.titulo}</strong> · {hace(a.creado)}<br /><span className="text-tinta-2">{a.detalle}</span></li>)}</ul>
            </Panel>
          )}
        </div>
      </div>

      <Panel titulo="Últimos siniestros dentro" descripcion={`${dentro.length.toLocaleString('es-CO')} en total`}>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="tabla">
            <thead><tr><th scope="col">Código</th><th scope="col">Fecha</th><th scope="col">Gravedad</th><th scope="col">Descripción</th></tr></thead>
            <tbody>
              {dentro.slice(0, 15).map((s) => (
                <tr key={s.id}>
                  <td className="font-mono text-sm"><Link href={`/consola/siniestros/${s.id}`} className="text-marca hover:underline">{s.codigo}</Link></td>
                  <td className="whitespace-nowrap">{formatoFechaHora(s.ocurridoEn)}</td>
                  <td><InsigniaGravedad gravedad={s.gravedad} /></td>
                  <td>{s.descripcion}</td>
                </tr>
              ))}
              {dentro.length === 0 && <tr><td colSpan={4} className="text-center text-tinta-2">Sin siniestros en el periodo.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <details className="tarjeta p-5">
        <summary className="cursor-pointer text-lg font-bold">Editar geocerca</summary>
        <div className="mt-4">
          <FormularioGeocerca g={g} otras={otras.map((o) => ({ coords: o.poligono.map(([lng, lat]) => [lat, lng] as [number, number]), color: o.color, nombre: o.nombre }))} />
        </div>
        <form action={eliminarGeocerca} className="mt-6 border-t border-borde pt-4">
          <input type="hidden" name="id" value={g.id} />
          <button type="submit" className="boton boton-peligro boton-chico"><Trash2 className="size-4" aria-hidden="true" />Eliminar geocerca</button>
          <span className="ml-3 text-sm text-tinta-2">Los siniestros no se borran; solo la zona.</span>
        </form>
      </details>
    </div>
  );
}
