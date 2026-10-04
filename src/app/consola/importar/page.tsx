import { desc, eq } from 'drizzle-orm';

import { Encabezado, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { formatoFechaHora } from '@/lib/tiempo';

import { Importador } from './Importador';

export const metadata = { title: 'Importar datos' };

export default async function Importar() {
  await requerirRol(PERMISOS.registrar);
  const historial = await db.select({ id: e.auditoria.id, creado: e.auditoria.creado, detalle: e.auditoria.detalle, nombre: e.usuarios.nombre })
    .from(e.auditoria).leftJoin(e.usuarios, eq(e.usuarios.id, e.auditoria.usuarioId))
    .where(eq(e.auditoria.accion, 'importar')).orderBy(desc(e.auditoria.creado)).limit(10);

  return (
    <div className="space-y-6">
      <Encabezado anotacion="Históricos · CSV y Excel" titulo="Importar" destacado="datos"
        descripcion="Carga siniestros de años anteriores u otras bases. Reconocemos sinónimos en español (moto, carro, «solo daños», muertos…), fechas en varios formatos y coordenadas con coma decimal. Los duplicados (misma hora ±10 min a menos de 50 m) se omiten." />
      <Importador />
      <Panel titulo="Cargas recientes" descripcion="Cada lote queda en la auditoría">
        {historial.length === 0 ? <p className="text-tinta-2">Todavía no hay importaciones.</p> : (
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="tabla">
              <caption className="sr-only">Últimas cargas de datos</caption>
              <thead><tr><th scope="col">Fecha</th><th scope="col">Archivo</th><th scope="col">Por</th><th scope="col" className="num">Insertados</th><th scope="col" className="num">Duplicados</th></tr></thead>
              <tbody>
                {historial.map((h) => {
                  const d = h.detalle as { archivo?: string; lote?: number; insertados?: number; duplicados?: number };
                  return (
                    <tr key={h.id}>
                      <td className="tabular">{formatoFechaHora(h.creado)}</td>
                      <td>{d.archivo ?? '—'}{d.lote ? <span className="text-tinta-2"> · lote {d.lote}</span> : null}</td>
                      <td>{h.nombre ?? '—'}</td>
                      <td className="num">{d.insertados ?? 0}</td>
                      <td className="num">{d.duplicados ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
