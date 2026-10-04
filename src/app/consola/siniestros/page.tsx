import { Download, Plus, Search, Upload } from 'lucide-react';
import Link from 'next/link';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Aviso, Encabezado, Insignia, InsigniaGravedad, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { CLASES, FUENTES_SINIESTRO, GRAVEDADES, VEHICULOS } from '@/db/esquema';
import { aniosDisponibles, barriosConDatos } from '@/lib/consultas';
import { CLASE, GRAVEDAD, VEHICULO } from '@/lib/etiquetas';
import { condicionesRegistro, ESTADOS_FILTRO, leerFiltrosRegistro, ORDENES, ordenSql, POR_PAGINA, totalesRegistro } from '@/lib/registro-siniestros';
import { PERMISOS, puede, requerirRol } from '@/lib/sesion';
import { diaISO, formatoFechaHora } from '@/lib/tiempo';

export const metadata = { title: 'Siniestros' };

const FUENTE: Record<string, string> = { manual: 'Registro manual', ciudadano: 'Reporte ciudadano', importado: 'Importado', externo: 'Fuente externa', camara: 'Cámara', legado: 'Versión anterior', simulado: 'Demostración' };
const ESTADO: Record<string, { texto: string; tono: 'ok' | 'aviso' | 'neutro' }> = { verificado: { texto: 'Verificado', tono: 'ok' }, pendiente: { texto: 'Pendiente', tono: 'aviso' }, descartado: { texto: 'Descartado', tono: 'neutro' } };

export default async function Siniestros({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [usuario, sp] = await Promise.all([requerirRol([...new Set([...PERMISOS.registrar, ...PERMISOS.analizar])]), searchParams]);
  const f = leerFiltrosRegistro(sp);
  const donde = condicionesRegistro(f.filtros, f.estado);

  const [totales, filas, anios, barrios] = await Promise.all([
    totalesRegistro(donde),
    db.select({
      id: e.siniestros.id, codigo: e.siniestros.codigo, ocurridoEn: e.siniestros.ocurridoEn, barrio: e.siniestros.barrio, direccion: e.siniestros.direccion,
      gravedad: e.siniestros.gravedad, clase: e.siniestros.clase, vehiculos: e.siniestros.vehiculos, heridos: e.siniestros.heridos, fallecidos: e.siniestros.fallecidos,
      fuente: e.siniestros.fuente, estado: e.siniestros.estado,
    }).from(e.siniestros).where(donde).orderBy(...ordenSql(f.orden)).limit(POR_PAGINA).offset((f.pagina - 1) * POR_PAGINA),
    aniosDisponibles(),
    barriosConDatos(),
  ]);
  const paginas = Math.max(1, Math.ceil(totales.total / POR_PAGINA));

  // Conserva todos los filtros al paginar y exportar.
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) { const s = Array.isArray(v) ? v[0] : v; if (s && k !== 'pagina') params.set(k, s); }
  const conPagina = (p: number) => { const u = new URLSearchParams(params); u.set('pagina', String(p)); return `?${u.toString()}`; };
  const hayFiltros = ['q', 'gravedad', 'clase', 'vehiculo', 'barrio', 'fuente', 'estado', 'orden'].some((k) => params.has(k));
  const sel = (k: string) => { const v = sp[k]; return (Array.isArray(v) ? v[0] : v) ?? ''; };
  const etiquetaCampo = 'block text-sm font-semibold text-tinta-2';

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={`Registro histórico · ${f.periodo.etiqueta}`}
        titulo="Registro de"
        destacado="siniestros"
        descripcion="Busca cualquier siniestro por fecha, lugar, gravedad o vehículo. Usa el periodo «Año…», «Hace un año» o un rango de fechas para consultar el historial."
        acciones={
          <>
            {puede(usuario, 'registrar') && <Link href="/consola/importar" className="boton boton-secundario"><Upload className="size-4" aria-hidden="true" />Importar</Link>}
            <a href={`/api/exportar/siniestros?${params.toString()}`} className="boton boton-secundario" download><Download className="size-4" aria-hidden="true" />Exportar CSV</a>
            {puede(usuario, 'registrar') && <Link href="/consola/siniestros/nuevo" className="boton boton-primario"><Plus className="size-4" aria-hidden="true" />Nuevo siniestro</Link>}
          </>
        }
      />

      {sel('eliminado') && <Aviso tono="exito">El siniestro fue eliminado.</Aviso>}

      <section aria-label="Filtros" className="tarjeta space-y-4 p-5">
        <FiltroTiempo actual={f.periodo.clave} etiqueta={f.periodo.etiqueta} anios={anios}
          desde={f.periodo.desde ? diaISO(f.periodo.desde) : undefined} hasta={diaISO(new Date(f.periodo.hasta.getTime() - 1))} />
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Buscar siniestros">
          {['periodo', 'desde', 'hasta'].map((k) => sel(k) && <input key={k} type="hidden" name={k} value={sel(k)} />)}
          <div className="sm:col-span-2">
            <label htmlFor="f-q" className={etiquetaCampo}>Texto</label>
            <input id="f-q" name="q" type="search" defaultValue={sel('q')} placeholder="Código, dirección, barrio o descripción" className="campo mt-1" maxLength={120} />
          </div>
          <div>
            <label htmlFor="f-gravedad" className={etiquetaCampo}>Gravedad</label>
            <select id="f-gravedad" name="gravedad" defaultValue={sel('gravedad')} className="campo mt-1">
              <option value="">Todas</option>
              {GRAVEDADES.map((g) => <option key={g} value={g}>{GRAVEDAD[g].texto}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-clase" className={etiquetaCampo}>Clase</label>
            <select id="f-clase" name="clase" defaultValue={sel('clase')} className="campo mt-1">
              <option value="">Todas</option>
              {CLASES.map((c) => <option key={c} value={c}>{CLASE[c]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-vehiculo" className={etiquetaCampo}>Vehículo involucrado</label>
            <select id="f-vehiculo" name="vehiculo" defaultValue={sel('vehiculo')} className="campo mt-1">
              <option value="">Todos</option>
              {VEHICULOS.map((v) => <option key={v} value={v}>{VEHICULO[v]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-barrio" className={etiquetaCampo}>Barrio o corredor</label>
            <select id="f-barrio" name="barrio" defaultValue={sel('barrio')} className="campo mt-1">
              <option value="">Todos</option>
              {barrios.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-fuente" className={etiquetaCampo}>Fuente</label>
            <select id="f-fuente" name="fuente" defaultValue={sel('fuente')} className="campo mt-1">
              <option value="">Todas</option>
              {FUENTES_SINIESTRO.map((x) => <option key={x} value={x}>{FUENTE[x]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-estado" className={etiquetaCampo}>Estado</label>
            <select id="f-estado" name="estado" defaultValue={f.estado} className="campo mt-1">
              {ESTADOS_FILTRO.map((x) => <option key={x.clave} value={x.clave}>{x.texto}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="f-orden" className={etiquetaCampo}>Orden</label>
            <select id="f-orden" name="orden" defaultValue={f.orden} className="campo mt-1">
              {ORDENES.map((x) => <option key={x.clave} value={x.clave}>{x.texto}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
            <button type="submit" className="boton boton-primario"><Search className="size-4" aria-hidden="true" />Buscar</button>
            {hayFiltros && <Link href={`?${new URLSearchParams(Object.fromEntries(['periodo', 'desde', 'hasta'].filter((k) => sel(k)).map((k) => [k, sel(k)]))).toString()}`} className="boton boton-fantasma">Limpiar</Link>}
          </div>
        </form>
      </section>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="Totales del filtro">
        {[
          ['Siniestros', totales.total, 'text-tinta'],
          ['Fatales', totales.fatales, 'text-fatal'],
          ['Graves', totales.graves, 'text-error'],
          ['Personas heridas', totales.heridos, 'text-tinta'],
          ['Víctimas fatales', totales.fallecidos, 'text-fatal'],
        ].map(([t, v, c]) => (
          <div key={t as string} className="tarjeta px-4 py-3">
            <dt className="text-sm font-semibold text-tinta-2">{t}</dt>
            <dd className={`cifra mt-1 text-3xl ${c}`}>{(v as number).toLocaleString('es-CO')}</dd>
          </div>
        ))}
      </dl>

      {filas.length === 0 ? (
        <Vacio titulo="No hay siniestros con estos filtros" icono={Search}>
          Prueba con otro periodo (por ejemplo «Todo el historial» o «Año anterior») o quita algún filtro.
        </Vacio>
      ) : (
        <div className="tarjeta overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="tabla min-w-[960px]">
              <caption className="sr-only">Siniestros encontrados, página {f.pagina} de {paginas}</caption>
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Fecha y hora</th>
                  <th scope="col">Lugar</th>
                  <th scope="col">Gravedad</th>
                  <th scope="col">Clase y vehículos</th>
                  <th scope="col" className="num">Heridos</th>
                  <th scope="col" className="num">Fallecidos</th>
                  <th scope="col">Fuente</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((s) => (
                  <tr key={s.id}>
                    <td className="font-normal"><Link href={`/consola/siniestros/${s.id}`} className="font-mono text-sm font-medium text-marca hover:underline">{s.codigo}</Link></td>
                    <td className="whitespace-nowrap tabular">{formatoFechaHora(s.ocurridoEn)}</td>
                    <td><span className="font-medium">{s.barrio ?? '—'}</span>{s.direccion && <span className="block text-sm text-tinta-2">{s.direccion}</span>}</td>
                    <td><InsigniaGravedad gravedad={s.gravedad} /></td>
                    <td>{CLASE[s.clase]}<span className="block text-sm text-tinta-2">{s.vehiculos.map((v) => VEHICULO[v]).join(', ') || 'Sin dato'}</span></td>
                    <td className="num">{s.heridos}</td>
                    <td className="num">{s.fallecidos}</td>
                    <td className="text-sm">{FUENTE[s.fuente]}</td>
                    <td><Insignia tono={ESTADO[s.estado].tono}>{ESTADO[s.estado].texto}</Insignia></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 border-t border-borde px-4 py-3 text-sm">
            <p className="text-tinta-2">
              {((f.pagina - 1) * POR_PAGINA + 1).toLocaleString('es-CO')}–{Math.min(f.pagina * POR_PAGINA, totales.total).toLocaleString('es-CO')} de {totales.total.toLocaleString('es-CO')}
            </p>
            <div className="flex items-center gap-2">
              {f.pagina > 1 ? <Link href={conPagina(f.pagina - 1)} className="boton boton-secundario boton-chico" rel="prev">Anterior</Link> : <span className="boton boton-secundario boton-chico" aria-disabled="true">Anterior</span>}
              <span className="tabular">Página {f.pagina} de {paginas}</span>
              {f.pagina < paginas ? <Link href={conPagina(f.pagina + 1)} className="boton boton-secundario boton-chico" rel="next">Siguiente</Link> : <span className="boton boton-secundario boton-chico" aria-disabled="true">Siguiente</span>}
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
