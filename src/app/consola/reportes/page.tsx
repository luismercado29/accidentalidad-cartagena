import { and, count, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { Inbox, Phone, X } from 'lucide-react';
import Link from 'next/link';

import { tomarReporte } from '@/app/acciones/reportes';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Mapa, type Capa } from '@/components/mapa/Mapa';
import { Encabezado, Insignia, InsigniaGravedad, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { CANALES_REPORTE, ESTADOS_REPORTE } from '@/db/esquema';
import { aniosDisponibles, enPeriodo } from '@/lib/consultas';
import { CANAL, ESTADO_INCIDENTE, ESTADO_REPORTE, VEHICULO } from '@/lib/etiquetas';
import { coordenadas } from '@/lib/geo';
import { posiblesDuplicados } from '@/lib/reportes';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { diaISO, formatoFechaHora, hace, paramsPeriodo, resolverPeriodo } from '@/lib/tiempo';

import { AccionesReporte } from './AccionesReporte';

export const metadata = { title: 'Reportes ciudadanos' };

const POR_PAGINA = 25;
type SP = Record<string, string | string[] | undefined>;
const uno = (sp: SP, k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ''; };

export default async function Reportes({ searchParams }: { searchParams: Promise<SP> }) {
  await requerirRol(PERMISOS.operar, '/consola/reportes');
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, '7d');
  const estadoFiltro = uno(sp, 'estado');
  const canalFiltro = uno(sp, 'canal');
  const pagina = Math.max(1, Number(uno(sp, 'pagina')) || 1);
  const idSel = Number(uno(sp, 'id')) || null;

  const condiciones: (SQL | undefined)[] = [enPeriodo(e.reportes.creado, periodo)];
  if (estadoFiltro === 'pendientes') condiciones.push(inArray(e.reportes.estado, ['recibido', 'en_revision']));
  else if ((ESTADOS_REPORTE as readonly string[]).includes(estadoFiltro)) condiciones.push(eq(e.reportes.estado, estadoFiltro as 'recibido'));
  if ((CANALES_REPORTE as readonly string[]).includes(canalFiltro)) condiciones.push(eq(e.reportes.canal, canalFiltro as 'web'));
  const donde = and(...condiciones);

  const [lista, [{ total }], porEstado, anios] = await Promise.all([
    db.select().from(e.reportes).where(donde).orderBy(desc(e.reportes.creado)).limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA),
    db.select({ total: count() }).from(e.reportes).where(donde),
    db.select({ estado: e.reportes.estado, n: count() }).from(e.reportes).where(enPeriodo(e.reportes.creado, periodo)).groupBy(e.reportes.estado),
    aniosDisponibles(),
  ]);
  const conteo = Object.fromEntries(porEstado.map((x) => [x.estado, x.n])) as Record<string, number>;

  const sel = idSel ? await db.query.reportes.findFirst({ where: eq(e.reportes.id, idSel) }) : null;
  const [dup, inc, punto, sin] = sel ? await Promise.all([
    posiblesDuplicados(sel),
    sel.incidenteId ? db.query.incidentes.findFirst({ where: eq(e.incidentes.id, sel.incidenteId) }) : null,
    sel.puntoQrId ? db.query.puntosQr.findFirst({ where: eq(e.puntosQr.id, sel.puntoQrId) }) : null,
    sel.siniestroId ? db.query.siniestros.findFirst({ where: eq(e.siniestros.id, sel.siniestroId), columns: { id: true, codigo: true } }) : null,
  ]) : [null, null, null, null];

  const base = paramsPeriodo(sp);
  if (estadoFiltro) base.set('estado', estadoFiltro);
  if (canalFiltro) base.set('canal', canalFiltro);
  const enlace = (cambios: Record<string, string | number | null>) => {
    const u = new URLSearchParams(base);
    if (pagina > 1) u.set('pagina', String(pagina));
    for (const [k, v] of Object.entries(cambios)) { if (v == null || v === '') u.delete(k); else u.set(k, String(v)); }
    return `/consola/reportes?${u.toString()}`;
  };
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));

  const capas: Capa[] = sel ? [
    { tipo: 'circulos', items: [{ lat: sel.lat, lng: sel.lng, radioM: 200, color: '#2437C7', relleno: 0.06 }] },
    { tipo: 'marcadores', items: [
      { lat: sel.lat, lng: sel.lng, icono: 'reporte', etiqueta: `Reporte ${sel.codigo}`, color: '#B42318' },
      ...(dup?.reportes ?? []).map((r) => ({ lat: r.lat, lng: r.lng, icono: 'reporte' as const, etiqueta: `Reporte ${r.codigo}`, color: '#B45309', ventana: { titulo: r.codigo, lineas: [`A ${r.distancia} m`] } })),
      ...(dup?.incidentes ?? []).map((i) => ({ lat: i.lat, lng: i.lng, icono: 'incidente' as const, etiqueta: `Incidente ${i.codigo}`, color: '#121019', ventana: { titulo: i.codigo, lineas: [`A ${i.distancia} m`] } })),
    ] },
  ] : [];

  const candidatos = [
    ...(dup?.incidentes ?? []).map((i) => ({ valor: `incidente:${i.id}`, texto: `Incidente ${i.codigo} · a ${i.distancia} m · ${ESTADO_INCIDENTE[i.estado].texto}` })),
    ...(dup?.reportes ?? []).map((r) => ({ valor: `reporte:${r.id}`, texto: `Reporte ${r.codigo} · a ${r.distancia} m · ${ESTADO_REPORTE[r.estado].texto}` })),
  ];
  const cerrado = sel ? ['verificado', 'descartado', 'duplicado'].includes(sel.estado) : false;

  return (
    <div className="space-y-6">
      <Encabezado anotacion={`${periodo.etiqueta} · ${total.toLocaleString('es-CO')} reportes`} titulo="Reportes" destacado="ciudadanos"
        descripcion="Bandeja de reportes por web, código QR y WhatsApp. Verifica, une duplicados o abre un incidente para despachar."
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />} />

      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {[{ k: '', t: 'Todos', n: Object.values(conteo).reduce((a, b) => a + b, 0) },
          { k: 'pendientes', t: 'Por atender', n: (conteo.recibido ?? 0) + (conteo.en_revision ?? 0) },
          ...ESTADOS_REPORTE.map((s) => ({ k: s, t: ESTADO_REPORTE[s].texto, n: conteo[s] ?? 0 }))].map((f) => (
          <Link key={f.k} href={enlace({ estado: f.k, pagina: null, id: null })} aria-current={estadoFiltro === f.k ? 'page' : undefined}
            className={`boton boton-chico ${estadoFiltro === f.k ? 'bg-noche text-white' : 'boton-secundario'}`}>
            {f.t} <span className="tabular opacity-70">{f.n.toLocaleString('es-CO')}</span>
          </Link>
        ))}
        <form method="get" action="/consola/reportes" className="ml-auto flex items-center gap-2">
          {[...base.entries()].filter(([k]) => k !== 'canal').map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <label htmlFor="canal" className="text-sm font-semibold text-tinta-2">Canal</label>
          <select id="canal" name="canal" defaultValue={canalFiltro} className="campo min-h-9 w-auto py-1">
            <option value="">Todos</option>
            {CANALES_REPORTE.map((c) => <option key={c} value={c}>{CANAL[c]}</option>)}
          </select>
          <button type="submit" className="boton boton-secundario boton-chico">Filtrar</button>
        </form>
      </nav>

      <div className={`grid gap-6 ${sel ? 'xl:grid-cols-[1fr_28rem]' : ''}`}>
        <section aria-label="Lista de reportes" className="tarjeta min-w-0 overflow-hidden">
          {lista.length === 0 ? <div className="p-6"><Vacio titulo="No hay reportes con estos filtros" icono={Inbox}>Prueba con otro periodo o estado.</Vacio></div> : (
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="tabla">
                <caption className="sr-only">Reportes ciudadanos del periodo, del más reciente al más antiguo</caption>
                <thead><tr><th scope="col">Código</th><th scope="col">Recibido</th><th scope="col">Lugar</th><th scope="col">Gravedad</th><th scope="col">Canal</th><th scope="col">Estado</th></tr></thead>
                <tbody>
                  {lista.map((r) => (
                    <tr key={r.id} className={r.id === idSel ? '[&>td]:bg-marca-suave' : ''}>
                      <td><Link href={enlace({ id: r.id })} className="font-mono text-sm font-semibold text-marca hover:underline" aria-current={r.id === idSel ? 'true' : undefined}>{r.codigo}</Link></td>
                      <td className="whitespace-nowrap text-sm"><time dateTime={r.creado.toISOString()} title={formatoFechaHora(r.creado)}>{hace(r.creado)}</time></td>
                      <td className="max-w-[16rem]"><span className="block truncate">{r.barrio ?? '—'}</span><span className="block truncate text-sm text-tinta-2">{r.descripcion}</span></td>
                      <td><InsigniaGravedad gravedad={r.gravedadEstimada} />{r.hayHeridos && <span className="mt-1 block text-xs font-semibold text-error">Con heridos</span>}</td>
                      <td className="text-sm">{CANAL[r.canal]}</td>
                      <td><Insignia tono={ESTADO_REPORTE[r.estado].tono}>{ESTADO_REPORTE[r.estado].texto}</Insignia></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {paginas > 1 && (
            <nav aria-label="Paginación" className="flex items-center justify-between gap-3 border-t border-borde px-4 py-3 text-sm">
              <span className="text-tinta-2">Página {pagina} de {paginas}</span>
              <span className="flex gap-2">
                {pagina > 1 && <Link className="boton boton-secundario boton-chico" href={enlace({ pagina: pagina - 1, id: null })}>Anterior</Link>}
                {pagina < paginas && <Link className="boton boton-secundario boton-chico" href={enlace({ pagina: pagina + 1, id: null })}>Siguiente</Link>}
              </span>
            </nav>
          )}
        </section>

        {sel && (
          <aside aria-labelledby="detalle-titulo" className="tarjeta space-y-5 p-5 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-6rem)] xl:overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="anotacion text-tinta-3">{CANAL[sel.canal]}{punto ? ` · ${punto.nombre}` : ''}</p>
                <h2 id="detalle-titulo" className="font-mono text-xl font-bold">{sel.codigo}</h2>
                <p className="text-sm text-tinta-2">{formatoFechaHora(sel.creado)} · {hace(sel.creado)}</p>
              </div>
              <Link href={enlace({ id: null })} className="boton boton-fantasma px-2" aria-label="Cerrar detalle"><X className="size-5" aria-hidden="true" /></Link>
            </div>
            <div className="flex flex-wrap gap-2">
              <Insignia tono={ESTADO_REPORTE[sel.estado].tono}>{ESTADO_REPORTE[sel.estado].texto}</Insignia>
              <InsigniaGravedad gravedad={sel.gravedadEstimada} corta={false} />
              {sel.hayHeridos && <Insignia tono="peligro">Con heridos</Insignia>}
            </div>
            <p className="whitespace-pre-line">{sel.descripcion}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="font-semibold text-tinta-2">Lugar</dt><dd>{sel.barrio}{sel.direccion ? ` · ${sel.direccion}` : ''}</dd>
              <dt className="font-semibold text-tinta-2">Coordenadas</dt><dd className="font-mono text-xs">{coordenadas(sel.lat, sel.lng)}</dd>
              <dt className="font-semibold text-tinta-2">Involucrados</dt><dd>{sel.vehiculos.length ? sel.vehiculos.map((v) => VEHICULO[v]).join(', ') : 'Sin dato'}</dd>
              {(sel.contactoNombre || sel.contactoTelefono) && <><dt className="font-semibold text-tinta-2">Contacto</dt>
                <dd>{sel.contactoNombre}{sel.contactoTelefono && <a href={`tel:${sel.contactoTelefono}`} className="ml-2 inline-flex items-center gap-1 font-semibold text-marca"><Phone className="size-3.5" aria-hidden="true" />{sel.contactoTelefono}</a>}</dd></>}
              {inc && <><dt className="font-semibold text-tinta-2">Incidente</dt><dd><Link href={`/consola/incidentes/${inc.id}`} className="font-semibold text-marca underline">{inc.codigo}</Link> · {ESTADO_INCIDENTE[inc.estado].texto}</dd></>}
              {sin && <><dt className="font-semibold text-tinta-2">Siniestro</dt><dd><Link href={`/consola/siniestros/${sin.id}`} className="font-semibold text-marca underline">{sin.codigo}</Link></dd></>}
              {sel.motivo && <><dt className="font-semibold text-tinta-2">Motivo</dt><dd>{sel.motivo}</dd></>}
            </dl>

            <Mapa etiqueta={`Ubicación del reporte ${sel.codigo} y eventos cercanos`} alto="14rem" centro={[sel.lat, sel.lng]} zoom={16} capas={capas} />

            <section aria-labelledby="dup-titulo">
              <h3 id="dup-titulo" className="font-semibold">Posibles duplicados <span className="font-normal text-tinta-2">(a menos de 200 m y 60 min)</span></h3>
              {candidatos.length === 0 ? <p className="text-sm text-tinta-2">No hay reportes ni incidentes cercanos.</p> : (
                <ul className="mt-2 space-y-1 text-sm">
                  {dup!.incidentes.map((i) => <li key={`i${i.id}`}><Link href={`/consola/incidentes/${i.id}`} className="font-mono font-semibold text-marca underline">{i.codigo}</Link> · {i.titulo} · {i.distancia} m</li>)}
                  {dup!.reportes.map((r) => <li key={`r${r.id}`}><Link href={enlace({ id: r.id })} className="font-mono font-semibold text-marca underline">{r.codigo}</Link> · {ESTADO_REPORTE[r.estado].texto} · {r.distancia} m</li>)}
                </ul>
              )}
            </section>

            {sel.estado === 'recibido' && (
              <form action={tomarReporte.bind(null, sel.id)}>
                <button type="submit" className="boton boton-secundario boton-chico w-full">Tomar el reporte (pasa a «En revisión»)</button>
              </form>
            )}
            <AccionesReporte key={sel.id} id={sel.id} gravedad={sel.gravedadEstimada} cerrado={cerrado}
              tieneIncidente={!!sel.incidenteId} tieneSiniestro={!!sel.siniestroId} candidatos={candidatos} />
          </aside>
        )}
      </div>
    </div>
  );
}
