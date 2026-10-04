import { and, count, desc, eq, isNotNull } from 'drizzle-orm';
import { Printer, QrCode } from 'lucide-react';
import Link from 'next/link';

import { alternarPuntoQr, eliminarPuntoQr } from '@/app/acciones/qr';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Encabezado, Insignia, Panel, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, enPeriodo } from '@/lib/consultas';
import { enlaceReporte, origenPublico, qrSvg } from '@/lib/qr';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { diaISO, resolverPeriodo } from '@/lib/tiempo';

import { FormularioQr } from './FormularioQr';

export const metadata = { title: 'Códigos QR' };

export default async function PuntosQr({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requerirRol(PERMISOS.configurar, '/consola/qr');
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, '90d');
  const editarId = Number(Array.isArray(sp.editar) ? sp.editar[0] : sp.editar) || null;

  const [puntos, reportesPorPunto, anios, origen] = await Promise.all([
    db.select().from(e.puntosQr).orderBy(desc(e.puntosQr.activo), e.puntosQr.codigo),
    db.select({ punto: e.reportes.puntoQrId, n: count() }).from(e.reportes)
      .where(and(isNotNull(e.reportes.puntoQrId), enPeriodo(e.reportes.creado, periodo))).groupBy(e.reportes.puntoQrId),
    aniosDisponibles(),
    origenPublico(),
  ]);
  const reportes = new Map(reportesPorPunto.map((r) => [r.punto, r.n]));
  const svgs = await Promise.all(puntos.map((p) => qrSvg(enlaceReporte(origen, p.codigo))));
  const editar = editarId ? puntos.find((p) => p.id === editarId) ?? null : null;
  const totalEscaneos = puntos.reduce((s, p) => s + p.escaneos, 0);

  return (
    <div className="space-y-6">
      <Encabezado anotacion={`${puntos.length} puntos · ${totalEscaneos.toLocaleString('es-CO')} escaneos en total`} titulo="Códigos" destacado="QR"
        descripcion="Afiches en paraderos, glorietas y corredores críticos: al escanearlos, el formulario de reporte se abre con la ubicación ya marcada."
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />} />

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <section aria-label="Puntos QR" className="space-y-4">
          {puntos.length === 0 && <Vacio titulo="Aún no hay puntos QR" icono={QrCode}>Crea el primero con el formulario.</Vacio>}
          <ul className="grid gap-4 md:grid-cols-2">
            {puntos.map((p, i) => (
              <li key={p.id} className={`tarjeta flex gap-4 p-4 ${p.activo ? '' : 'opacity-75'}`}>
                <div className="size-28 shrink-0 overflow-hidden rounded-lg border border-borde bg-white p-1 [&>svg]:size-full" role="img"
                  aria-label={`Código QR de ${p.nombre}`} dangerouslySetInnerHTML={{ __html: svgs[i] }} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{p.codigo}</span>
                    {p.activo ? <Insignia tono="ok">Activo</Insignia> : <Insignia tono="neutro">Inactivo</Insignia>}
                  </p>
                  <h2 className="mt-1 font-bold leading-snug">{p.nombre}</h2>
                  <p className="text-sm text-tinta-2">{p.barrio}</p>
                  <dl className="mt-2 flex gap-5 text-sm">
                    <div><dt className="text-tinta-2">Escaneos</dt><dd className="cifra text-2xl">{p.escaneos.toLocaleString('es-CO')}</dd></div>
                    <div><dt className="text-tinta-2">Reportes <span className="sr-only">({periodo.etiqueta})</span></dt><dd className="cifra text-2xl">{(reportes.get(p.id) ?? 0).toLocaleString('es-CO')}</dd></div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Link href={`/afiche-qr/${p.codigo}`} className="boton boton-secundario boton-chico" target="_blank"><Printer className="size-4" aria-hidden="true" />Afiche<span className="sr-only"> de {p.codigo} (se abre en otra pestaña)</span></Link>
                    <Link href={`/consola/qr?editar=${p.id}`} className="boton boton-fantasma boton-chico">Editar<span className="sr-only"> {p.codigo}</span></Link>
                    <form action={alternarPuntoQr.bind(null, p.id)}>
                      <button type="submit" className="boton boton-fantasma boton-chico">{p.activo ? 'Desactivar' : 'Activar'}<span className="sr-only"> {p.codigo}</span></button>
                    </form>
                    {!p.activo && (
                      <form action={eliminarPuntoQr.bind(null, p.id)}>
                        <button type="submit" className="boton boton-fantasma boton-chico text-error">Eliminar<span className="sr-only"> {p.codigo}</span></button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-tinta-2">Para eliminar un punto, primero desactívalo. Los reportes que ya llegaron por ese punto se conservan.</p>
        </section>

        <Panel titulo={editar ? `Editar ${editar.codigo}` : 'Nuevo punto QR'} className="self-start xl:sticky xl:top-20"
          acciones={editar ? <Link href="/consola/qr" className="text-sm font-semibold text-marca underline">Cancelar</Link> : undefined}>
          <FormularioQr punto={editar ? { id: editar.id, codigo: editar.codigo, nombre: editar.nombre, lat: editar.lat, lng: editar.lng } : null} />
        </Panel>
      </div>
    </div>
  );
}
