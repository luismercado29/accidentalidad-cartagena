import { asc, desc } from 'drizzle-orm';

import { alternarActivo, cambiarRol } from '@/app/acciones/administracion';
import { Mensaje } from '@/components/territorio/Mensaje';
import { Encabezado, Insignia, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { ROL } from '@/lib/etiquetas';
import { requerirRol, PERMISOS } from '@/lib/sesion';
import { hace } from '@/lib/tiempo';

import { BotonRestablecer, FormularioNuevoUsuario } from './FormulariosUsuario';

export const metadata = { title: 'Usuarios' };

export default async function Usuarios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [yo, sp] = await Promise.all([requerirRol(PERMISOS.administrar), searchParams]);
  const lista = await db.select({
    id: e.usuarios.id, nombre: e.usuarios.nombre, usuario: e.usuarios.usuario, email: e.usuarios.email, rol: e.usuarios.rol,
    activo: e.usuarios.activo, ultimoIngreso: e.usuarios.ultimoIngreso, legadoId: e.usuarios.legadoId, creado: e.usuarios.creado,
  }).from(e.usuarios).orderBy(desc(e.usuarios.activo), asc(e.usuarios.rol), asc(e.usuarios.usuario));
  const equipo = lista.filter((u) => u.rol !== 'ciudadano');
  const ciudadania = lista.filter((u) => u.rol === 'ciudadano');

  const fila = (u: (typeof lista)[number]) => (
    <tr key={u.id}>
      <td>
        <span className="block font-semibold">{u.nombre}{u.id === yo.id && <span className="ml-1.5 text-sm font-normal text-tinta-2">(tú)</span>}</span>
        <span className="font-mono text-sm text-tinta-2">{u.usuario}</span>
        {u.legadoId && <span className="ml-2 text-xs text-tinta-3">· versión anterior</span>}
      </td>
      <td className="text-sm">{u.email}</td>
      <td>
        <form action={cambiarRol} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={u.id} />
          <label htmlFor={`rol-${u.id}`} className="sr-only">Rol de {u.usuario}</label>
          <select id={`rol-${u.id}`} name="rol" defaultValue={u.rol} className="campo min-h-9 w-40 py-1 text-sm">
            {Object.entries(ROL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button type="submit" className="boton boton-secundario boton-chico">Guardar<span className="sr-only"> rol de {u.usuario}</span></button>
        </form>
      </td>
      <td><Insignia tono={u.activo ? 'ok' : 'neutro'}>{u.activo ? 'Activa' : 'Desactivada'}</Insignia></td>
      <td className="whitespace-nowrap text-sm text-tinta-2">{u.ultimoIngreso ? hace(u.ultimoIngreso) : 'Nunca'}</td>
      <td>
        <div className="flex flex-wrap items-start gap-1">
          <form action={alternarActivo}>
            <input type="hidden" name="id" value={u.id} />
            <input type="hidden" name="activo" value={u.activo ? '0' : '1'} />
            <button type="submit" className="boton boton-fantasma boton-chico" disabled={u.id === yo.id && u.activo}>
              {u.activo ? 'Desactivar' : 'Activar'}<span className="sr-only"> la cuenta {u.usuario}</span>
            </button>
          </form>
          <BotonRestablecer id={u.id} usuario={u.usuario} />
        </div>
      </td>
    </tr>
  );

  const tabla = (filas: typeof lista) => (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="tabla">
        <thead><tr><th scope="col">Persona</th><th scope="col">Correo</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col">Último ingreso</th><th scope="col">Acciones</th></tr></thead>
        <tbody>{filas.map(fila)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <Encabezado anotacion="Administración" titulo="Usuarios" destacado="y roles"
        descripcion="Administración puede todo; supervisión configura y opera; operación atiende incidentes y reportes; análisis consulta y registra datos. Las contraseñas temporales se muestran una sola vez." />
      <Mensaje sp={sp} />
      <Panel titulo="Equipo" descripcion={`${equipo.length} cuentas`}>{tabla(equipo)}</Panel>
      <details className="tarjeta p-5">
        <summary className="cursor-pointer text-lg font-bold">Crear una cuenta</summary>
        <div className="mt-4"><FormularioNuevoUsuario /></div>
      </details>
      {ciudadania.length > 0 && (
        <Panel titulo="Cuentas de ciudadanía" descripcion="Incluye las cuentas copiadas de la versión anterior (las administrativas quedaron desactivadas por seguridad).">
          {tabla(ciudadania)}
        </Panel>
      )}
    </div>
  );
}
