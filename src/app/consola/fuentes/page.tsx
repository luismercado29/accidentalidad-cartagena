import { and, count, desc, eq, gte, sql, type SQL } from 'drizzle-orm';
import { ExternalLink, FilePlus2, Inbox, MapPin, Newspaper, Power, Trash2, Undo2, XCircle } from 'lucide-react';
import Link from 'next/link';

import { alternarFuente, convertirEnReporte, descartarNoticia, eliminarFuente } from '@/app/acciones/fuentes';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Aviso, Encabezado, Insignia, InsigniaGravedad, Panel, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, enPeriodo } from '@/lib/consultas';
import type { Tono } from '@/lib/etiquetas';
import { PERMISOS, puede, requerirRol } from '@/lib/sesion';
import { diaISO, formatoFechaHora, hace, resolverPeriodo } from '@/lib/tiempo';

import { BotonLeer, FormularioFuente, FormularioPublicacion, VincularNoticia } from './Formularios';

export const metadata = { title: 'Fuentes externas' };

const POR_PAGINA = 30;
const RED: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', x: 'X', tiktok: 'TikTok', prensa: 'Prensa', otra: 'Otra' };
const ESTADO: Record<string, { texto: string; tono: Tono }> = {
  nueva: { texto: 'Por revisar', tono: 'info' }, vinculada: { texto: 'Vinculada', tono: 'ok' }, convertida: { texto: 'Convertida', tono: 'ok' }, descartada: { texto: 'Descartada', tono: 'neutro' },
};
const ESTADOS_FILTRO = [['nueva', 'Por revisar'], ['vinculada', 'Vinculadas'], ['convertida', 'Convertidas'], ['descartada', 'Descartadas'], ['todas', 'Todas']] as const;
const RELEVANCIAS = [['45', 'Probables siniestros (≥ 45)'], ['25', 'Posibles (≥ 25)'], ['0', 'Todas']] as const;

function relevancia(n: number): { texto: string; tono: Tono } {
  if (n >= 70) return { texto: `Relevancia alta · ${n}/100`, tono: 'peligro' };
  if (n >= 45) return { texto: `Relevancia media · ${n}/100`, tono: 'aviso' };
  return { texto: `Relevancia baja · ${n}/100`, tono: 'neutro' };
}

export default async function Fuentes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [usuario, sp] = await Promise.all([requerirRol(PERMISOS.operar), searchParams]);
  const uno = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ''; };
  const periodo = resolverPeriodo(sp, '30d');
  const estado = ESTADOS_FILTRO.some(([k]) => k === uno('estado')) ? uno('estado') : 'nueva';
  const minimo = RELEVANCIAS.some(([k]) => k === uno('relevancia')) ? Number(uno('relevancia')) : 45;
  const red = RED[uno('red')] ? uno('red') : '';
  const pagina = Math.max(1, Number(uno('pagina')) || 1);

  const cond: (SQL | undefined)[] = [enPeriodo(e.noticias.publicadoEn, periodo), gte(e.noticias.relevancia, minimo)];
  if (estado !== 'todas') cond.push(eq(e.noticias.estado, estado as 'nueva'));
  if (red) cond.push(eq(e.noticias.red, red));
  const donde = and(...cond);

  const [[{ total }], lista, fuentes, anios, porEstado] = await Promise.all([
    db.select({ total: count() }).from(e.noticias).where(donde),
    db.select({ n: e.noticias, fuente: e.fuentes.nombre, codigo: e.siniestros.codigo }).from(e.noticias)
      .leftJoin(e.fuentes, eq(e.fuentes.id, e.noticias.fuenteId)).leftJoin(e.siniestros, eq(e.siniestros.id, e.noticias.siniestroId))
      .where(donde).orderBy(desc(e.noticias.publicadoEn)).limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA),
    db.select({ f: e.fuentes, n: sql<number>`(select count(*)::int from vial.noticias where fuente_id = ${e.fuentes.id})` }).from(e.fuentes).orderBy(e.fuentes.id),
    aniosDisponibles(),
    db.select({ estado: e.noticias.estado, n: count() }).from(e.noticias).where(and(enPeriodo(e.noticias.publicadoEn, periodo), gte(e.noticias.relevancia, minimo))).groupBy(e.noticias.estado),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const s = Array.isArray(v) ? v[0] : v; if (s && k !== 'pagina') params.set(k, s); }
  const conPagina = (p: number) => { const u = new URLSearchParams(params); u.set('pagina', String(p)); return `?${u.toString()}`; };
  const configurar = puede(usuario, 'configurar');
  const conteo = Object.fromEntries(porEstado.map((x) => [x.estado, x.n]));

  return (
    <div className="space-y-6">
      <Encabezado anotacion={`Monitoreo de medios y redes · ${periodo.etiqueta}`} titulo="Fuentes" destacado="externas"
        descripcion="Noticias de medios (leídas por RSS cada día y a demanda) y publicaciones de redes cargadas por el equipo. Cada una se clasifica por relevancia, barrio y gravedad probable para convertirla en reporte o vincularla a un siniestro."
        acciones={<BotonLeer />} />

      <Aviso tono="info">
        <strong>Sobre las redes sociales:</strong> no leemos Facebook, Instagram, X ni TikTok de forma automática, porque sus términos de uso prohíben el scraping;
        la conexión oficial requiere sus API con aprobación de cada plataforma. Mientras tanto, el equipo puede pegar aquí las publicaciones relevantes.
      </Aviso>

      <section aria-label="Filtros" className="tarjeta space-y-4 p-5">
        <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios}
          desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
        <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Filtrar noticias">
          {['periodo', 'desde', 'hasta'].map((k) => uno(k) && <input key={k} type="hidden" name={k} value={uno(k)} />)}
          <div>
            <label htmlFor="n-estado" className="block text-sm font-semibold text-tinta-2">Estado</label>
            <select id="n-estado" name="estado" defaultValue={estado} className="campo mt-1">
              {ESTADOS_FILTRO.map(([k, t]) => <option key={k} value={k}>{t}{k !== 'todas' && conteo[k] != null ? ` (${conteo[k]})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="n-rel" className="block text-sm font-semibold text-tinta-2">Relevancia</label>
            <select id="n-rel" name="relevancia" defaultValue={String(minimo)} className="campo mt-1">
              {RELEVANCIAS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="n-red" className="block text-sm font-semibold text-tinta-2">Red o medio</label>
            <select id="n-red" name="red" defaultValue={red} className="campo mt-1">
              <option value="">Todos</option>
              {Object.entries(RED).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
            </select>
          </div>
          <button type="submit" className="boton boton-secundario">Filtrar</button>
        </form>
      </section>

      <section aria-labelledby="titulo-noticias" className="space-y-3">
        <h2 id="titulo-noticias" className="text-xl font-bold">{total.toLocaleString('es-CO')} {total === 1 ? 'publicación' : 'publicaciones'}</h2>
        {lista.length === 0 ? (
          <Vacio titulo="No hay publicaciones con estos filtros" icono={Newspaper}>Prueba con «Todas» en relevancia o estado, amplía el periodo o pulsa «Leer fuentes ahora».</Vacio>
        ) : (
          <ul className="space-y-3">
            {lista.map(({ n, fuente, codigo }) => {
              const rel = relevancia(n.relevancia);
              return (
                <li key={n.id} className="tarjeta p-5">
                  <article aria-labelledby={`n-${n.id}`}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="anotacion text-tinta-3">{RED[n.red ?? ''] ?? 'Prensa'}{fuente ? ` · ${fuente}` : ''}</span>
                      <span className="text-tinta-2">· <time dateTime={n.publicadoEn.toISOString()} title={formatoFechaHora(n.publicadoEn)}>{hace(n.publicadoEn)}</time></span>
                      <Insignia tono={rel.tono}>{rel.texto}</Insignia>
                      <Insignia tono={ESTADO[n.estado].tono} punto={false}>{ESTADO[n.estado].texto}</Insignia>
                      {n.gravedadDetectada && <InsigniaGravedad gravedad={n.gravedadDetectada} />}
                    </div>
                    <h3 id={`n-${n.id}`} className="mt-2 text-lg font-semibold leading-snug">
                      <a href={n.url} target="_blank" rel="noopener noreferrer nofollow" className="hover:underline">
                        {n.titulo}<ExternalLink className="ml-1.5 inline size-4 text-tinta-3" aria-hidden="true" /><span className="sr-only"> (se abre en otra pestaña)</span>
                      </a>
                    </h3>
                    {n.resumen && n.resumen !== n.titulo && <p className="mt-1 line-clamp-3 text-tinta-2">{n.resumen}</p>}
                    <p className="mt-2 flex items-center gap-1.5 text-sm text-tinta-2">
                      <MapPin className="size-4" aria-hidden="true" />{n.barrio ? `Ubicación detectada: ${n.barrio} (aproximada)` : 'Sin barrio reconocible en el texto'}
                      {codigo && <> · Siniestro <Link href={`/consola/siniestros/${n.siniestroId}`} className="font-mono font-semibold text-marca hover:underline">{codigo}</Link></>}
                    </p>

                    <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-3 border-t border-borde pt-4">
                      {n.estado === 'nueva' && (
                        <>
                          {puede(usuario, 'registrar') && (
                            <Link href={`/consola/siniestros/nuevo?noticia=${n.id}`} className="boton boton-primario boton-chico"><FilePlus2 className="size-4" aria-hidden="true" />Crear siniestro</Link>
                          )}
                          <form action={convertirEnReporte}>
                            <input type="hidden" name="id" value={n.id} />
                            <button type="submit" className="boton boton-secundario boton-chico"><Inbox className="size-4" aria-hidden="true" />Enviar a reportes</button>
                          </form>
                          <VincularNoticia id={n.id} />
                        </>
                      )}
                      {(n.estado === 'nueva' || n.estado === 'descartada') && (
                        <form action={descartarNoticia} className="ml-auto">
                          <input type="hidden" name="id" value={n.id} />
                          <button type="submit" className="boton boton-fantasma boton-chico">
                            {n.estado === 'descartada' ? <><Undo2 className="size-4" aria-hidden="true" />Restaurar</> : <><XCircle className="size-4" aria-hidden="true" />Descartar<span className="sr-only">: {n.titulo}</span></>}
                          </button>
                        </form>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
        {paginas > 1 && (
          <nav aria-label="Paginación" className="flex items-center justify-end gap-2 text-sm">
            {pagina > 1 && <Link href={conPagina(pagina - 1)} className="boton boton-secundario boton-chico" rel="prev">Anterior</Link>}
            <span className="tabular">Página {pagina} de {paginas}</span>
            {pagina < paginas && <Link href={conPagina(pagina + 1)} className="boton boton-secundario boton-chico" rel="next">Siguiente</Link>}
          </nav>
        )}
      </section>

      <Panel titulo="Agregar publicación de redes o prensa" descripcion="Para publicaciones vistas en Facebook, Instagram, X, TikTok o un medio sin RSS">
        <FormularioPublicacion />
      </Panel>

      <Panel titulo="Fuentes configuradas" descripcion="Los canales RSS se leen automáticamente una vez al día">
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="tabla">
            <caption className="sr-only">Fuentes de noticias</caption>
            <thead><tr><th scope="col">Fuente</th><th scope="col">Tipo</th><th scope="col">Última lectura</th><th scope="col" className="num">Publicaciones</th><th scope="col">Estado</th>{configurar && <th scope="col"><span className="sr-only">Acciones</span></th>}</tr></thead>
            <tbody>
              {fuentes.map(({ f, n }) => (
                <tr key={f.id}>
                  <td className="font-medium">{f.nombre}{f.url && <span className="block max-w-md truncate font-mono text-xs font-normal text-tinta-3">{f.url}</span>}</td>
                  <td>{f.tipo === 'rss' ? 'RSS' : f.tipo === 'manual' ? 'Carga manual' : 'WhatsApp'}</td>
                  <td className="text-sm">{f.ultimaLectura ? hace(f.ultimaLectura) : 'Nunca'}{f.ultimoError && <span className="block font-semibold text-error">Error: {f.ultimoError}</span>}</td>
                  <td className="num">{n}</td>
                  <td><Insignia tono={f.activa ? 'ok' : 'neutro'}>{f.activa ? 'Activa' : 'Pausada'}</Insignia></td>
                  {configurar && (
                    <td>
                      {f.tipo === 'rss' && (
                        <div className="flex justify-end gap-1">
                          <form action={alternarFuente}><input type="hidden" name="id" value={f.id} />
                            <button type="submit" className="boton boton-fantasma boton-chico"><Power className="size-4" aria-hidden="true" />{f.activa ? 'Pausar' : 'Activar'}<span className="sr-only"> {f.nombre}</span></button>
                          </form>
                          <form action={eliminarFuente}><input type="hidden" name="id" value={f.id} />
                            <button type="submit" className="boton boton-fantasma boton-chico text-error"><Trash2 className="size-4" aria-hidden="true" />Quitar<span className="sr-only"> {f.nombre}</span></button>
                          </form>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {configurar && <div className="mt-5 border-t border-borde pt-5"><h3 className="mb-3 font-semibold">Agregar canal RSS</h3><FormularioFuente /></div>}
      </Panel>
    </div>
  );
}
