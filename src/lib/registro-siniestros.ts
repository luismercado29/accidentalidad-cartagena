import 'server-only';

import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import { condicionesSiniestros, enPeriodo, leerFiltros, type FiltrosSiniestros } from '@/lib/consultas';
import { resolverPeriodo } from '@/lib/tiempo';

export const ESTADOS_FILTRO = [
  { clave: 'verificado', texto: 'Verificados' },
  { clave: 'pendiente', texto: 'Pendientes de verificar' },
  { clave: 'activos', texto: 'Verificados y pendientes' },
  { clave: 'descartado', texto: 'Descartados' },
] as const;
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number]['clave'];

export const ORDENES = [
  { clave: 'reciente', texto: 'Más recientes primero' },
  { clave: 'antiguo', texto: 'Más antiguos primero' },
  { clave: 'gravedad', texto: 'Más graves primero' },
  { clave: 'codigo', texto: 'Por código' },
] as const;
export type Orden = (typeof ORDENES)[number]['clave'];

export const POR_PAGINA = 50;

type Sp = Record<string, string | string[] | undefined>;
const uno = (sp: Sp, k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };

export function leerFiltrosRegistro(sp: Sp) {
  const base = leerFiltros(sp);
  const estado = (ESTADOS_FILTRO.some((x) => x.clave === uno(sp, 'estado')) ? uno(sp, 'estado') : 'verificado') as EstadoFiltro;
  const orden = (ORDENES.some((x) => x.clave === uno(sp, 'orden')) ? uno(sp, 'orden') : 'reciente') as Orden;
  const periodo = resolverPeriodo(sp, '30d');
  const filtros: FiltrosSiniestros = { periodo, gravedad: base.gravedad, barrio: base.barrio, clase: base.clase, vehiculo: base.vehiculo, fuente: base.fuente, texto: base.texto };
  return { ...base, periodo, estado, orden, filtros };
}

/**
 * Condiciones del registro segun el estado elegido. Para verificados y pendientes
 * se usa condicionesSiniestros(); los descartados no los cubre (nunca cuentan en
 * estadisticas), asi que se arman aqui con los mismos filtros.
 */
export function condicionesRegistro(f: FiltrosSiniestros, estado: EstadoFiltro): SQL | undefined {
  if (estado === 'verificado') return condicionesSiniestros(f);
  if (estado === 'activos') return condicionesSiniestros({ ...f, incluirPendientes: true });
  if (estado === 'pendiente') return and(condicionesSiniestros({ ...f, incluirPendientes: true }), eq(e.siniestros.estado, 'pendiente'));
  const c: (SQL | undefined)[] = [enPeriodo(e.siniestros.ocurridoEn, f.periodo), eq(e.siniestros.estado, 'descartado')];
  if (f.gravedad) c.push(eq(e.siniestros.gravedad, f.gravedad));
  if (f.barrio) c.push(eq(e.siniestros.barrio, f.barrio));
  if (f.clase) c.push(eq(e.siniestros.clase, f.clase as never));
  if (f.fuente) c.push(eq(e.siniestros.fuente, f.fuente as never));
  if (f.vehiculo) c.push(sql`${e.siniestros.vehiculos} @> ${JSON.stringify([f.vehiculo])}::jsonb`);
  if (f.texto) {
    const t = `%${f.texto.replace(/[%_]/g, '')}%`;
    c.push(sql`(${e.siniestros.codigo} ilike ${t} or ${e.siniestros.descripcion} ilike ${t} or ${e.siniestros.direccion} ilike ${t} or ${e.siniestros.barrio} ilike ${t})`);
  }
  return and(...c);
}

const ORDEN_GRAVEDAD = sql`case ${e.siniestros.gravedad} when 'fatal' then 0 when 'grave' then 1 when 'leve' then 2 else 3 end`;

export function ordenSql(orden: Orden) {
  switch (orden) {
    case 'antiguo': return [asc(e.siniestros.ocurridoEn)];
    case 'gravedad': return [ORDEN_GRAVEDAD, desc(e.siniestros.ocurridoEn)];
    case 'codigo': return [asc(e.siniestros.codigo)];
    default: return [desc(e.siniestros.ocurridoEn)];
  }
}

/** Totales del filtro actual (incluye el estado elegido, a diferencia de resumen()). */
export async function totalesRegistro(donde: SQL | undefined) {
  const [r] = await db.select({
    total: count(),
    fatales: sql<number>`count(*) filter (where ${e.siniestros.gravedad} = 'fatal')::int`,
    graves: sql<number>`count(*) filter (where ${e.siniestros.gravedad} = 'grave')::int`,
    heridos: sql<number>`coalesce(sum(${e.siniestros.heridos}),0)::int`,
    fallecidos: sql<number>`coalesce(sum(${e.siniestros.fallecidos}),0)::int`,
  }).from(e.siniestros).where(donde);
  return r;
}
