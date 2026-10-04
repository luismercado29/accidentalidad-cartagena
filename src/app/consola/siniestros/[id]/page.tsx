import { and, eq, gte, lte, ne } from 'drizzle-orm';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { eliminarSiniestro } from '@/app/acciones/siniestros';
import { Mapa } from '@/components/mapa/Mapa';
import { Aviso, Insignia, InsigniaGravedad, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { CANAL, CLASE, CLIMA, COLOR_MAPA, ESTADO_INCIDENTE, ESTADO_REPORTE, ESTADO_VIA, etiquetaDe, VEHICULO } from '@/lib/etiquetas';
import { coordenadas, distanciaM } from '@/lib/geo';
import { PERMISOS, puede, requerirRol } from '@/lib/sesion';
import { DESFASE_MS, formatoFechaHora } from '@/lib/tiempo';

import { FormularioSiniestro } from '../FormularioSiniestro';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = Number.isInteger(Number(id)) ? await db.query.siniestros.findFirst({ where: eq(e.siniestros.id, Number(id)), columns: { codigo: true } }) : null;
  return { title: s ? `Siniestro ${s.codigo}` : 'Siniestro' };
}

const FUENTE: Record<string, string> = { manual: 'Registro manual', ciudadano: 'Reporte ciudadano', importado: 'Importación de históricos', externo: 'Fuente externa (noticia o red social)', camara: 'Cámara', legado: 'Versión anterior del sistema', simulado: 'Datos de demostración' };
const ILUMINACION: Record<string, string> = { dia: 'De día', amanecer_atardecer: 'Amanecer o atardecer', noche_con_alumbrado: 'De noche, con alumbrado', noche_sin_alumbrado: 'De noche, sin alumbrado' };

export default async function FichaSiniestro({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ guardado?: string; editar?: string }> }) {
  const [usuario, { id }, sp] = await Promise.all([requerirRol([...new Set([...PERMISOS.registrar, ...PERMISOS.analizar])]), params, searchParams]);
  const num = Number(id);
  if (!Number.isInteger(num) || num < 1) notFound();
  const s = await db.query.siniestros.findFirst({ where: eq(e.siniestros.id, num) });
  if (!s) notFound();

  const m = 0.0025; // ~275 m: se filtra a 200 m exactos despues
  const [reportes, incidentes, noticias, registrador, vecinos] = await Promise.all([
    db.select().from(e.reportes).where(eq(e.reportes.siniestroId, s.id)),
    db.select().from(e.incidentes).where(eq(e.incidentes.siniestroId, s.id)),
    db.select().from(e.noticias).where(eq(e.noticias.siniestroId, s.id)),
    s.registradoPor ? db.query.usuarios.findFirst({ where: eq(e.usuarios.id, s.registradoPor), columns: { nombre: true } }) : null,
    db.select({ id: e.siniestros.id, codigo: e.siniestros.codigo, lat: e.siniestros.lat, lng: e.siniestros.lng, gravedad: e.siniestros.gravedad, ocurridoEn: e.siniestros.ocurridoEn })
      .from(e.siniestros)
      .where(and(ne(e.siniestros.id, s.id), ne(e.siniestros.estado, 'descartado'), gte(e.siniestros.lat, s.lat - m), lte(e.siniestros.lat, s.lat + m), gte(e.siniestros.lng, s.lng - m), lte(e.siniestros.lng, s.lng + m))),
  ]);
  const cercanos = vecinos
    .map((x) => ({ ...x, d: distanciaM(s.lat, s.lng, x.lat, x.lng) }))
    .filter((x) => x.d <= 200)
    .sort((a, b) => b.ocurridoEn.getTime() - a.ocurridoEn.getTime());

  const editable = puede(usuario, 'registrar');
  const local = new Date(s.ocurridoEn.getTime() + DESFASE_MS).toISOString();
  const datos: [string, React.ReactNode][] = [
    ['Fecha y hora', formatoFechaHora(s.ocurridoEn)],
    ['Lugar', <>{s.barrio ?? '—'}{s.direccion && <span className="block text-tinta-2">{s.direccion}</span>}</>],
    ['Coordenadas', <span key="c" className="font-mono text-sm">{coordenadas(s.lat, s.lng)}</span>],
    ['Clase', CLASE[s.clase]],
    ['Vehículos', s.vehiculos.map((v) => VEHICULO[v]).join(', ') || 'Sin dato'],
    ['Heridos / fallecidos', `${s.heridos} / ${s.fallecidos}`],
    ['Clima', etiquetaDe(CLIMA, s.clima, 'Sin dato')],
    ['Estado de la vía', etiquetaDe(ESTADO_VIA, s.estadoVia, 'Sin dato')],
    ['Iluminación', etiquetaDe(ILUMINACION, s.iluminacion, 'Sin dato')],
    ['Día festivo', s.diaFestivo ? 'Sí' : 'No'],
    ['Causa probable', s.causaProbable ?? 'Sin dato'],
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/consola/siniestros" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Volver al registro</Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="anotacion text-tinta-3">Siniestro · {FUENTE[s.fuente]}</p>
          <h1 className="mt-1 font-mono text-3xl font-bold sm:text-4xl">{s.codigo}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <InsigniaGravedad gravedad={s.gravedad} corta={false} />
            <Insignia tono={s.estado === 'verificado' ? 'ok' : s.estado === 'pendiente' ? 'aviso' : 'neutro'}>{s.estado === 'verificado' ? 'Verificado' : s.estado === 'pendiente' ? 'Pendiente de verificar' : 'Descartado'}</Insignia>
          </div>
        </div>
        {editable && <a href="#editar" className="boton boton-secundario">Editar</a>}
      </header>

      {sp.guardado && <Aviso tono="exito">Registro guardado.</Aviso>}
      {s.fuente === 'simulado' && <Aviso tono="info">Este registro pertenece a los datos de demostración.</Aviso>}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel titulo="Ubicación" descripcion={`${cercanos.length} siniestros más a menos de 200 m`}>
          <Mapa etiqueta={`Ubicación del siniestro ${s.codigo} y siniestros cercanos`} alto="22rem" centro={[s.lat, s.lng]} zoom={16}
            capas={[
              { tipo: 'circulos', items: [{ lat: s.lat, lng: s.lng, radioM: 200, color: '#2437C7', relleno: 0.05 }] },
              { tipo: 'puntos', items: cercanos.map((c) => ({ lat: c.lat, lng: c.lng, color: COLOR_MAPA[c.gravedad], radio: 5, ventana: { titulo: c.codigo, lineas: [formatoFechaHora(c.ocurridoEn)], enlace: { href: `/consola/siniestros/${c.id}`, texto: 'Ver ficha' } } })) },
              { tipo: 'marcadores', items: [{ lat: s.lat, lng: s.lng, icono: 'incidente', etiqueta: s.codigo, color: COLOR_MAPA[s.gravedad] }] },
            ]} />
        </Panel>
        <Panel titulo="Datos del siniestro">
          <dl className="divide-y divide-borde">
            {datos.map(([t, x]) => (
              <div key={t} className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-[0.95rem]">
                <dt className="font-semibold text-tinta-2">{t}</dt>
                <dd>{x}</dd>
              </div>
            ))}
          </dl>
          {s.descripcion && <p className="mt-4 whitespace-pre-line rounded-xl bg-hundido p-4">{s.descripcion}</p>}
          <p className="mt-4 text-xs text-tinta-3">
            Registrado {formatoFechaHora(s.creado)}{registrador ? ` por ${registrador.nombre}` : ''} · Última actualización {formatoFechaHora(s.actualizado)}
          </p>
        </Panel>
      </div>

      <Panel titulo="Procedencia" descripcion="Reportes, incidentes y noticias vinculados a este siniestro">
        {reportes.length + incidentes.length + noticias.length === 0 ? <p className="text-tinta-2">No tiene registros vinculados.</p> : (
          <ul className="divide-y divide-borde">
            {reportes.map((r) => (
              <li key={`r${r.id}`} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="anotacion text-tinta-3">Reporte {CANAL[r.canal]}</span>
                <span className="font-mono text-sm">{r.codigo}</span>
                <Insignia tono={ESTADO_REPORTE[r.estado].tono}>{ESTADO_REPORTE[r.estado].texto}</Insignia>
                <span className="text-sm text-tinta-2">{formatoFechaHora(r.creado)}</span>
                <Link href={`/consola/reportes?id=${r.id}`} className="ml-auto text-sm font-semibold text-marca hover:underline">Ver reporte</Link>
              </li>
            ))}
            {incidentes.map((i) => (
              <li key={`i${i.id}`} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="anotacion text-tinta-3">Incidente</span>
                <span className="font-mono text-sm">{i.codigo}</span>
                <Insignia tono={ESTADO_INCIDENTE[i.estado].tono}>{ESTADO_INCIDENTE[i.estado].texto}</Insignia>
                <span className="text-sm text-tinta-2">{formatoFechaHora(i.abiertoEn)}</span>
                <Link href={`/consola/incidentes/${i.id}`} className="ml-auto text-sm font-semibold text-marca hover:underline">Ver incidente</Link>
              </li>
            ))}
            {noticias.map((n) => (
              <li key={`n${n.id}`} className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="anotacion text-tinta-3">Noticia{n.red ? ` · ${n.red}` : ''}</span>
                <span className="min-w-0 flex-1 truncate">{n.titulo}</span>
                <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="text-sm font-semibold text-marca hover:underline">Abrir fuente<span className="sr-only"> (se abre en otra pestaña)</span></a>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {cercanos.length > 0 && (
        <Panel titulo="Siniestros cercanos" descripcion="A menos de 200 m, del más reciente al más antiguo">
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="tabla">
              <caption className="sr-only">Siniestros a menos de 200 metros</caption>
              <thead><tr><th scope="col">Código</th><th scope="col">Fecha</th><th scope="col">Gravedad</th><th scope="col" className="num">Distancia</th></tr></thead>
              <tbody>
                {cercanos.slice(0, 15).map((c) => (
                  <tr key={c.id}>
                    <td className="font-normal"><Link href={`/consola/siniestros/${c.id}`} className="font-mono text-sm text-marca hover:underline">{c.codigo}</Link></td>
                    <td className="tabular">{formatoFechaHora(c.ocurridoEn)}</td>
                    <td><InsigniaGravedad gravedad={c.gravedad} /></td>
                    <td className="num">{Math.round(c.d)} m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cercanos.length > 15 && <p className="mt-2 text-sm text-tinta-2">Y {cercanos.length - 15} más.</p>}
        </Panel>
      )}

      {editable && (
        <section id="editar" aria-labelledby="titulo-editar" className="scroll-mt-24 space-y-4">
          <h2 id="titulo-editar" className="text-2xl font-bold">Editar <span className="serif text-marca">registro</span></h2>
          <FormularioSiniestro inicial={{
            id: s.id, fecha: local.slice(0, 10), hora: local.slice(11, 16), lat: String(s.lat), lng: String(s.lng), direccion: s.direccion ?? '', barrio: s.barrio ?? '',
            gravedad: s.gravedad, clase: s.clase, vehiculos: s.vehiculos, heridos: String(s.heridos), fallecidos: String(s.fallecidos), clima: s.clima ?? '',
            estadoVia: s.estadoVia ?? '', iluminacion: s.iluminacion ?? '', diaFestivo: s.diaFestivo, causaProbable: s.causaProbable ?? '', descripcion: s.descripcion ?? '', estado: s.estado,
          }} />
        </section>
      )}

      {usuario.rol === 'admin' && (
        <section aria-labelledby="titulo-eliminar" className="rounded-2xl border border-error/30 bg-error-suave p-5">
          <h2 id="titulo-eliminar" className="font-bold text-error">Eliminar siniestro</h2>
          <p className="mt-1 text-sm">Borra el registro de forma permanente. Si solo es un error de verificación, es mejor marcarlo como «Descartado». La eliminación queda en la auditoría.</p>
          <form action={eliminarSiniestro} className="mt-3 flex flex-wrap items-center gap-4">
            <input type="hidden" name="id" value={s.id} />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="confirmo" required className="size-5 accent-error" />
              <span>Entiendo que no se puede deshacer</span>
            </label>
            <button type="submit" className="boton boton-peligro"><Trash2 className="size-4" aria-hidden="true" />Eliminar {s.codigo}</button>
          </form>
        </section>
      )}
    </div>
  );
}
