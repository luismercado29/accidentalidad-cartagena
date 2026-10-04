import { eq, sql } from 'drizzle-orm';
import { PhoneCall } from 'lucide-react';
import Link from 'next/link';

import { db, esquema as e } from '@/db';

import { FormularioReporte } from './FormularioReporte';

export const metadata = { title: 'Reportar un siniestro', description: 'Reporta un siniestro vial en Cartagena sin crear cuenta y sigue su atención con un código.' };

export default async function Reportar({ searchParams }: { searchParams: Promise<{ punto?: string }> }) {
  const { punto: codigo } = await searchParams;
  let punto: { codigo: string; nombre: string; lat: number; lng: number } | null = null;
  if (codigo && /^[A-Z0-9-]{2,20}$/i.test(codigo)) {
    const p = await db.query.puntosQr.findFirst({ where: eq(e.puntosQr.codigo, codigo.toUpperCase()) });
    if (p?.activo) {
      punto = { codigo: p.codigo, nombre: p.nombre, lat: p.lat, lng: p.lng };
      // Cada visita con el codigo cuenta como un escaneo.
      await db.update(e.puntosQr).set({ escaneos: sql`${e.puntosQr.escaneos} + 1` }).where(eq(e.puntosQr.id, p.id));
    }
  }

  return (
    <div className="contenedor grid gap-10 py-10 lg:grid-cols-[1fr_20rem] lg:py-14">
      <div className="min-w-0">
        <p className="anotacion text-tinta-3">Reporte ciudadano · sin cuenta · 3 pasos</p>
        <h1 className="titular mt-3">Reporta un <span className="serif text-marca">siniestro</span>.</h1>
        <p className="mt-5 max-w-2xl text-lg text-tinta-2">Tu reporte llega al centro de gestión y ayuda a que la atención llegue antes. También alimenta el mapa de puntos críticos de la ciudad.</p>

        <div role="note" className="sobre-oscuro mt-8 overflow-hidden rounded-2xl bg-noche text-white">
          <div className="franja h-2" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-4 p-5">
            <PhoneCall className="size-8 shrink-0 text-senal" aria-hidden="true" />
            <p className="flex-1 text-lg"><strong className="text-senal">Si hay heridos, llama primero al 123.</strong> Este formulario no reemplaza la línea de emergencias.</p>
            <a href="tel:123" className="boton boton-senal">Llamar al 123</a>
          </div>
        </div>

        <div className="mt-8"><FormularioReporte punto={punto} /></div>
      </div>

      <aside className="space-y-4 lg:pt-28" aria-label="Información sobre el reporte">
        <div className="tarjeta p-5">
          <h2 className="font-bold">¿Qué pasa después?</h2>
          <ol className="mt-3 space-y-3 text-sm text-tinta-2">
            <li><span className="cifra mr-2 text-2xl text-tinta">1</span>Recibes un código de seguimiento.</li>
            <li><span className="cifra mr-2 text-2xl text-tinta">2</span>El equipo revisa el reporte y, si hace falta, despacha una unidad.</li>
            <li><span className="cifra mr-2 text-2xl text-tinta">3</span>Cuando se verifica, entra al registro y al mapa de la ciudad.</li>
          </ol>
        </div>
        <div className="tarjeta p-5 text-sm">
          <h2 className="font-bold">¿Ya reportaste?</h2>
          <p className="mt-1 text-tinta-2">Consulta el estado con tu código.</p>
          <Link href="/seguimiento" className="boton boton-secundario boton-chico mt-3">Seguir mi reporte</Link>
        </div>
      </aside>
    </div>
  );
}
