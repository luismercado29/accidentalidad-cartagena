import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';

import { Logo } from '@/components/Logo';
import { db, esquema as e } from '@/db';
import { enlaceReporte, origenPublico, qrSvg } from '@/lib/qr';
import { PERMISOS, requerirRol } from '@/lib/sesion';

import { BotonImprimir } from './BotonImprimir';

export const metadata = { title: 'Afiche QR', robots: { index: false } };

/** Afiche imprimible (carta/A4) para instalar en el punto. Fuera de la consola para imprimir sin menus. */
export default async function Afiche({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  await requerirRol(PERMISOS.configurar, `/afiche-qr/${codigo}`);
  const p = await db.query.puntosQr.findFirst({ where: eq(e.puntosQr.codigo, decodeURIComponent(codigo).toUpperCase()) });
  if (!p) notFound();
  const origen = await origenPublico();
  const enlace = enlaceReporte(origen, p.codigo);
  const svg = await qrSvg(enlace);

  return (
    <main id="contenido" className="min-h-dvh bg-hundido py-8 print:bg-white print:py-0">
      <div className="no-imprimir mx-auto mb-6 flex max-w-[210mm] items-center justify-between px-4">
        <a href="/consola/qr" className="font-semibold text-marca underline">← Volver a Códigos QR</a>
        <BotonImprimir />
      </div>
      <article className="mx-auto flex min-h-[277mm] max-w-[210mm] flex-col overflow-hidden bg-white shadow-elevada print:shadow-none" aria-label={`Afiche del punto ${p.codigo}`}>
        <div className="franja h-6 print:[print-color-adjust:exact]" aria-hidden="true" />
        <div className="flex flex-1 flex-col px-[14mm] py-[12mm]">
          <Logo />
          <h1 className="mt-8 text-[3.4rem] font-bold leading-[0.95] tracking-tight">
            ¿Viste un <span className="serif text-marca">siniestro</span> en esta vía?
          </h1>
          <p className="mt-4 text-2xl">Escanea el código y repórtalo en menos de un minuto. <strong>Sin cuenta, sin app.</strong></p>
          <div className="mt-8 flex flex-1 items-center gap-8">
            <div className="size-[88mm] shrink-0 rounded-2xl border-4 border-noche p-2 [&>svg]:size-full" role="img" aria-label="Código QR para reportar" dangerouslySetInnerHTML={{ __html: svg }} />
            <ol className="space-y-5 text-xl">
              <li><span className="cifra mr-3 text-4xl">1</span>Abre la cámara del celular.</li>
              <li><span className="cifra mr-3 text-4xl">2</span>Apunta al código y toca el enlace.</li>
              <li><span className="cifra mr-3 text-4xl">3</span>Cuenta qué pasó. La ubicación ya está marcada.</li>
            </ol>
          </div>
          <div className="sobre-oscuro mt-8 rounded-2xl bg-noche p-6 text-white print:[print-color-adjust:exact]">
            <p className="text-2xl font-bold"><span className="text-senal">Si hay heridos, llama primero al 123.</span></p>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4 text-sm text-tinta-2">
            <div>
              <p className="font-mono text-base font-semibold text-tinta">{p.codigo} · {p.nombre}</p>
              <p className="break-all font-mono">{enlace}</p>
            </div>
            <p className="max-w-[60mm] text-right">Iniciativa independiente; no representa a ninguna entidad oficial.</p>
          </div>
        </div>
        <div className="franja h-6 print:[print-color-adjust:exact]" aria-hidden="true" />
      </article>
    </main>
  );
}
