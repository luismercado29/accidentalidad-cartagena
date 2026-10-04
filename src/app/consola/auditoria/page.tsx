import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import Link from 'next/link';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { param } from '@/components/territorio/Mensaje';
import { Encabezado, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, enPeriodo } from '@/lib/consultas';
import { requerirRol, PERMISOS } from '@/lib/sesion';
import { diaISO, formatoFechaHora, paramsPeriodo, resolverPeriodo } from '@/lib/tiempo';

export const metadata = { title: 'Auditoría' };

const POR_PAGINA = 50;

export default async function Auditoria({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([requerirRol(PERMISOS.administrar), searchParams]);
  const periodo = resolverPeriodo(sp, '30d');
  const usuarioId = Number(param(sp, 'usuario')) || null;
  const accion = param(sp, 'accion')?.slice(0, 40) || null;
  const entidad = param(sp, 'entidad')?.slice(0, 40) || null;
  const pagina = Math.max(1, Number(param(sp, 'pagina')) || 1);

  const cond: (SQL | undefined)[] = [enPeriodo(e.auditoria.creado, periodo)];
  if (usuarioId) cond.push(eq(e.auditoria.usuarioId, usuarioId));
  if (accion) cond.push(eq(e.auditoria.accion, accion));
  if (entidad) cond.push(eq(e.auditoria.entidad, entidad));
  const donde = and(...cond);

  const [filas, [{ total }], usuarios, acciones, entidades, anios] = await Promise.all([
    db.select({ id: e.auditoria.id, creado: e.auditoria.creado, accion: e.auditoria.accion, entidad: e.auditoria.entidad, entidadId: e.auditoria.entidadId, detalle: e.auditoria.detalle, usuario: e.usuarios.usuario, nombre: e.usuarios.nombre })
      .from(e.auditoria).leftJoin(e.usuarios, eq(e.usuarios.id, e.auditoria.usuarioId))
      .where(donde).orderBy(desc(e.auditoria.creado)).limit(POR_PAGINA).offset((pagina - 1) * POR_PAGINA),
    db.select({ total: count() }).from(e.auditoria).where(donde),
    db.selectDistinct({ id: e.usuarios.id, usuario: e.usuarios.usuario }).from(e.auditoria).innerJoin(e.usuarios, eq(e.usuarios.id, e.auditoria.usuarioId)),
    db.selectDistinct({ v: e.auditoria.accion }).from(e.auditoria).orderBy(e.auditoria.accion),
    db.selectDistinct({ v: e.auditoria.entidad }).from(e.auditoria).orderBy(e.auditoria.entidad),
    aniosDisponibles(),
  ]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlacePagina = (p: number) => {
    const u = paramsPeriodo(sp);
    if (usuarioId) u.set('usuario', String(usuarioId));
    if (accion) u.set('accion', accion);
    if (entidad) u.set('entidad', entidad);
    u.set('pagina', String(p));
    return `/consola/auditoria?${u.toString()}`;
  };

  return (
    <div className="space-y-6">
      <Encabezado anotacion={`Administración · ${periodo.etiqueta}`} titulo="Auditoría" destacado="del sistema"
        descripcion="Registro inalterable de quién hizo qué y cuándo: ingresos, cambios en siniestros, incidentes, configuración y cuentas."
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />} />

      <form method="get" className="tarjeta flex flex-wrap items-end gap-3 p-4" aria-label="Filtros de auditoría">
        {['periodo', 'desde', 'hasta'].map((k) => param(sp, k) && <input key={k} type="hidden" name={k} value={param(sp, k)} />)}
        <div className="min-w-44 space-y-1">
          <label htmlFor="au-usuario" className="block text-sm font-semibold text-tinta-2">Usuario</label>
          <select id="au-usuario" name="usuario" className="campo min-h-10 py-1.5" defaultValue={usuarioId ?? ''}>
            <option value="">Todos</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.usuario}</option>)}
          </select>
        </div>
        <div className="min-w-44 space-y-1">
          <label htmlFor="au-accion" className="block text-sm font-semibold text-tinta-2">Acción</label>
          <select id="au-accion" name="accion" className="campo min-h-10 py-1.5" defaultValue={accion ?? ''}>
            <option value="">Todas</option>
            {acciones.map((a) => <option key={a.v} value={a.v}>{a.v.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div className="min-w-44 space-y-1">
          <label htmlFor="au-entidad" className="block text-sm font-semibold text-tinta-2">Entidad</label>
          <select id="au-entidad" name="entidad" className="campo min-h-10 py-1.5" defaultValue={entidad ?? ''}>
            <option value="">Todas</option>
            {entidades.map((a) => <option key={a.v} value={a.v}>{a.v.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <button type="submit" className="boton boton-primario boton-chico min-h-10">Filtrar</button>
        <Link href={`/consola/auditoria?${paramsPeriodo(sp).toString()}`} className="boton boton-fantasma boton-chico min-h-10">Quitar filtros</Link>
      </form>

      <Panel titulo="Eventos" descripcion={`${total.toLocaleString('es-CO')} registros · página ${pagina} de ${paginas}`}>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="tabla">
            <thead><tr><th scope="col">Fecha</th><th scope="col">Usuario</th><th scope="col">Acción</th><th scope="col">Entidad</th><th scope="col">Detalle</th></tr></thead>
            <tbody>
              {filas.map((f) => {
                const det = Object.entries(f.detalle ?? {});
                return (
                  <tr key={f.id}>
                    <td className="whitespace-nowrap text-sm">{formatoFechaHora(f.creado)}</td>
                    <td>{f.usuario ? <><span className="block font-semibold">{f.nombre}</span><span className="font-mono text-xs text-tinta-2">{f.usuario}</span></> : <span className="text-tinta-2">Sistema</span>}</td>
                    <td className="capitalize">{f.accion.replace(/_/g, ' ')}</td>
                    <td><span className="capitalize">{f.entidad.replace(/_/g, ' ')}</span>{f.entidadId && <span className="ml-1 font-mono text-xs text-tinta-2">#{f.entidadId}</span>}</td>
                    <td className="text-sm">
                      {det.length === 0 ? <span className="text-tinta-3">—</span> : (
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                          {det.slice(0, 8).map(([k, v]) => (
                            <div key={k} className="contents">
                              <dt className="text-tinta-2">{k}</dt>
                              <dd className="break-all font-mono text-xs leading-5">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filas.length === 0 && <tr><td colSpan={5} className="text-center text-tinta-2">Sin eventos con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        {paginas > 1 && (
          <nav aria-label="Paginación" className="mt-4 flex items-center justify-between gap-2">
            {pagina > 1 ? <Link href={enlacePagina(pagina - 1)} className="boton boton-secundario boton-chico">Anterior</Link> : <span />}
            <span className="text-sm text-tinta-2">Página {pagina} de {paginas}</span>
            {pagina < paginas ? <Link href={enlacePagina(pagina + 1)} className="boton boton-secundario boton-chico">Siguiente</Link> : <span />}
          </nav>
        )}
      </Panel>
    </div>
  );
}
