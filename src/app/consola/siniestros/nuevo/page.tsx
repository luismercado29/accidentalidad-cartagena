import { eq } from 'drizzle-orm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Aviso, Encabezado } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { DESFASE_MS } from '@/lib/tiempo';

import { FormularioSiniestro, type ValoresSiniestro } from '../FormularioSiniestro';

export const metadata = { title: 'Nuevo siniestro' };

const partes = (d: Date) => { const l = new Date(d.getTime() + DESFASE_MS).toISOString(); return { fecha: l.slice(0, 10), hora: l.slice(11, 16) }; };

export default async function NuevoSiniestro({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [, sp] = await Promise.all([requerirRol(PERMISOS.registrar), searchParams]);
  const inicial: ValoresSiniestro = {
    ...partes(new Date()), lat: '', lng: '', direccion: '', barrio: '', gravedad: '', clase: 'choque', vehiculos: [],
    heridos: '0', fallecidos: '0', clima: '', estadoVia: '', iluminacion: '', diaFestivo: false, causaProbable: '', descripcion: '', estado: 'verificado',
  };

  // Precarga desde una noticia o un reporte ciudadano (se leen de la base, no de la URL).
  const noticiaId = Number(sp.noticia) || undefined;
  const reporteId = Number(sp.reporte) || undefined;
  let origen: string | null = null;
  if (noticiaId) {
    const n = await db.query.noticias.findFirst({ where: eq(e.noticias.id, noticiaId) });
    if (n) {
      origen = `Desde la noticia: «${n.titulo}»`;
      Object.assign(inicial, partes(n.publicadoEn), {
        lat: n.lat != null ? String(n.lat) : '', lng: n.lng != null ? String(n.lng) : '', barrio: n.barrio ?? '',
        gravedad: n.gravedadDetectada ?? '', heridos: n.gravedadDetectada === 'leve' || n.gravedadDetectada === 'grave' ? '1' : '0',
        fallecidos: n.gravedadDetectada === 'fatal' ? '1' : '0', estado: 'pendiente',
        descripcion: `${n.titulo}${n.resumen ? `\n\n${n.resumen}` : ''}\n\nFuente: ${n.url}`.slice(0, 2000),
      });
    }
  } else if (reporteId) {
    const r = await db.query.reportes.findFirst({ where: eq(e.reportes.id, reporteId) });
    if (r) {
      origen = `Desde el reporte ciudadano ${r.codigo}`;
      Object.assign(inicial, partes(r.creado), {
        lat: String(r.lat), lng: String(r.lng), barrio: r.barrio ?? '', direccion: r.direccion ?? '', gravedad: r.gravedadEstimada,
        vehiculos: r.vehiculos, heridos: r.hayHeridos ? '1' : '0', fallecidos: r.gravedadEstimada === 'fatal' ? '1' : '0', descripcion: r.descripcion,
        clase: r.vehiculos.includes('peaton') ? 'atropello' : 'choque',
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/consola/siniestros" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />Volver al registro</Link>
      <Encabezado anotacion="Formulario tipo informe de siniestro" titulo="Registrar un" destacado="siniestro"
        descripcion="Los campos con * son obligatorios. La información queda auditada con tu usuario." />
      {origen && <Aviso tono="info">{origen}. Revisa y completa los datos antes de guardar.</Aviso>}
      <FormularioSiniestro inicial={inicial} noticiaId={noticiaId} reporteId={reporteId} />
    </div>
  );
}
