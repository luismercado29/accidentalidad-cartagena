import { count, eq, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { CircleCheck, CircleMinus, Trash2 } from 'lucide-react';

import { borrarSimulados, cambiarModoDemo } from '@/app/acciones/administracion';
import { BotonEnviar } from '@/components/formulario';
import { Mensaje } from '@/components/territorio/Mensaje';
import { Encabezado, Insignia, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { requerirRol, PERMISOS } from '@/lib/sesion';
import { formatoFecha, hace } from '@/lib/tiempo';

export const metadata = { title: 'Ajustes' };
export const dynamic = 'force-dynamic';

const FUENTE: Record<string, string> = { manual: 'Registro manual', ciudadano: 'Reporte ciudadano', importado: 'Importado', externo: 'Fuente externa', camara: 'Cámara', legado: 'Versión anterior', simulado: 'Simulado (demostración)' };

export default async function Ajustes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([requerirRol(PERMISOS.administrar), searchParams]);
  const tablas: [string, PgTable][] = [
    ['Siniestros', e.siniestros], ['Reportes ciudadanos', e.reportes], ['Incidentes', e.incidentes], ['Unidades', e.unidades],
    ['Alertas', e.alertas], ['Zonas de alerta', e.zonasAlerta], ['Geocercas', e.geocercas], ['Puntos negros', e.puntosNegros],
    ['Cámaras', e.camaras], ['Novedades en la vía', e.novedadesVia], ['Fuentes externas', e.fuentes], ['Noticias', e.noticias],
    ['Puntos QR', e.puntosQr], ['Usuarios', e.usuarios], ['Auditoría', e.auditoria],
  ];
  const [conteos, porFuente, rango, demo, simulacion, simulados] = await Promise.all([
    Promise.all(tablas.map(async ([nombre, t]) => ({ nombre, n: (await db.select({ n: count() }).from(t))[0].n }))),
    db.select({ fuente: e.siniestros.fuente, n: count(), desde: sql<string>`min(${e.siniestros.ocurridoEn})`, hasta: sql<string>`max(${e.siniestros.ocurridoEn})` })
      .from(e.siniestros).groupBy(e.siniestros.fuente).orderBy(sql`count(*) desc`),
    db.select({ desde: sql<string | null>`min(${e.siniestros.ocurridoEn})`, hasta: sql<string | null>`max(${e.siniestros.ocurridoEn})` }).from(e.siniestros),
    db.query.ajustes.findFirst({ where: eq(e.ajustes.clave, 'demo') }),
    db.query.ajustes.findFirst({ where: eq(e.ajustes.clave, 'simulacion') }),
    db.select({ n: count() }).from(e.incidentes).where(eq(e.incidentes.simulado, true)),
  ]);
  const demoActivo = !!(demo?.valor as { activo?: boolean } | undefined)?.activo;
  const totalSim = (porFuente.find((f) => f.fuente === 'simulado')?.n ?? 0) + simulados[0].n;

  // Solo se informa si existen; jamas se muestran valores.
  const variables = [
    { nombre: 'Base de datos (DATABASE_URL)', ok: !!process.env.DATABASE_URL, nota: process.env.DATABASE_URL ? 'Postgres remoto' : 'Base local de desarrollo (PGlite)' },
    { nombre: 'Firma de sesiones (AUTH_SECRET)', ok: !!(process.env.AUTH_SECRET ?? process.env.SECRET_KEY), nota: 'Obligatoria en producción' },
    { nombre: 'Mapas Mapbox (NEXT_PUBLIC_MAPBOX_TOKEN)', ok: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN, nota: 'Sin ella se usan teselas de CARTO' },
    { nombre: 'Asistente IA (AI Gateway)', ok: !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN), nota: 'Sin ella el asistente responde por reglas' },
    { nombre: 'WhatsApp (TWILIO_AUTH_TOKEN)', ok: !!process.env.TWILIO_AUTH_TOKEN, nota: 'Recepción de reportes por WhatsApp' },
    { nombre: 'Tareas programadas (CRON_SECRET)', ok: !!process.env.CRON_SECRET, nota: 'Lectura diaria de fuentes externas' },
  ];

  return (
    <div className="space-y-6">
      <Encabezado anotacion="Administración" titulo="Ajustes" destacado="del sistema" descripcion="Modo demostración, estado de la base de datos y configuración del despliegue." />
      <Mensaje sp={sp} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel titulo="Modo demostración"
          descripcion="Mientras está activo, la consola simula actividad realista (reportes, incidentes, despachos) para mostrar el sistema en vivo. Nunca modifica datos reales.">
          <div className="flex flex-wrap items-center gap-3">
            <Insignia tono={demoActivo ? 'ok' : 'neutro'}>{demoActivo ? 'Activo' : 'Desactivado'}</Insignia>
            {simulacion && <span className="text-sm text-tinta-2">Última simulación: {hace(new Date((simulacion.valor as { t: string }).t))}</span>}
          </div>
          <form action={cambiarModoDemo} className="mt-4">
            <input type="hidden" name="activo" value={demoActivo ? '0' : '1'} />
            <BotonEnviar className={`boton ${demoActivo ? 'boton-secundario' : 'boton-primario'}`} pendiente="Guardando…">
              {demoActivo ? 'Desactivar modo demostración' : 'Activar modo demostración'}
            </BotonEnviar>
          </form>
        </Panel>

        <Panel titulo="Borrar datos simulados" descripcion="Elimina los siniestros, incidentes y reportes de demostración. Los datos reales (registro manual, ciudadanía, importados, fuentes externas y versión anterior) no se tocan.">
          <p className="mb-3 text-sm"><strong className="cifra mr-1 text-3xl">{totalSim.toLocaleString('es-CO')}</strong> registros simulados (siniestros e incidentes).</p>
          <form action={borrarSimulados} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="conf" className="block font-semibold">Para confirmar escribe <span className="font-mono">BORRAR DATOS SIMULADOS</span></label>
              <input id="conf" name="confirmacion" className="campo font-mono" autoComplete="off" required aria-describedby="conf-ayuda" />
              <p id="conf-ayuda" className="text-sm text-tinta-2">No se puede deshacer. También desactiva el modo demostración y borra los puntos negros calculados para recalcularlos.</p>
            </div>
            <BotonEnviar className="boton boton-peligro" pendiente="Borrando…"><Trash2 className="size-4" aria-hidden="true" />Borrar datos simulados</BotonEnviar>
          </form>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel titulo="Siniestros por origen"
          descripcion={rango[0].desde ? `Historial del ${formatoFecha(rango[0].desde)} al ${formatoFecha(rango[0].hasta!)}` : 'Sin siniestros registrados'}>
          <div className="overflow-x-auto" tabIndex={0}><table className="tabla">
            <thead><tr><th scope="col">Origen</th><th scope="col" className="num">Registros</th><th scope="col">Desde</th><th scope="col">Hasta</th></tr></thead>
            <tbody>
              {porFuente.map((f) => (
                <tr key={f.fuente}>
                  <th scope="row" className="font-normal">{FUENTE[f.fuente] ?? f.fuente}</th>
                  <td className="num">{f.n.toLocaleString('es-CO')}</td>
                  <td className="whitespace-nowrap text-sm">{formatoFecha(f.desde)}</td>
                  <td className="whitespace-nowrap text-sm">{formatoFecha(f.hasta)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Panel>

        <Panel titulo="Tablas" descripcion="Registros en cada tabla del esquema «vial»">
          <div className="overflow-x-auto" tabIndex={0}><table className="tabla">
            <thead><tr><th scope="col">Tabla</th><th scope="col" className="num">Registros</th></tr></thead>
            <tbody>{conteos.map((c) => <tr key={c.nombre}><th scope="row" className="font-normal">{c.nombre}</th><td className="num">{c.n.toLocaleString('es-CO')}</td></tr>)}</tbody>
          </table></div>
        </Panel>
      </div>

      <Panel titulo="Configuración del despliegue" descripcion="Solo se indica si cada variable existe; sus valores nunca se muestran.">
        <ul className="divide-y divide-borde">
          {variables.map((v) => (
            <li key={v.nombre} className="flex items-start gap-3 py-2.5">
              {v.ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-exito" aria-hidden="true" /> : <CircleMinus className="mt-0.5 size-5 shrink-0 text-tinta-3" aria-hidden="true" />}
              <span className="flex-1"><span className="block font-semibold">{v.nombre}</span><span className="text-sm text-tinta-2">{v.nota}</span></span>
              <Insignia tono={v.ok ? 'ok' : 'neutro'}>{v.ok ? 'Configurada' : 'No configurada'}</Insignia>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
