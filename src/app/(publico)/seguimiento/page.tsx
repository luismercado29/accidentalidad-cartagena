import { eq } from 'drizzle-orm';
import { Check, Circle, CircleX, Search } from 'lucide-react';
import Link from 'next/link';

import { Aviso, Insignia } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { ESTADO_INCIDENTE, ESTADO_REPORTE } from '@/lib/etiquetas';
import { formatoFechaHora } from '@/lib/tiempo';

export const metadata = { title: 'Seguir mi reporte' };

type Paso = { titulo: string; detalle?: string; hecho: boolean; fallido?: boolean };

export default async function Seguimiento({ searchParams }: { searchParams: Promise<{ codigo?: string; nuevo?: string }> }) {
  const sp = await searchParams;
  const codigo = (sp.codigo ?? '').trim().toUpperCase().slice(0, 20);
  const valido = /^RV-[A-Z0-9]{4}-[A-Z0-9]{2}$|^RV-D\d{6}$/.test(codigo);
  const rep = valido ? await db.query.reportes.findFirst({ where: eq(e.reportes.codigo, codigo) }) : null;
  const inc = rep?.incidenteId ? await db.query.incidentes.findFirst({ where: eq(e.incidentes.id, rep.incidenteId) }) : null;

  // Solo se muestra el estado del proceso: nunca descripciones, contactos ni ubicaciones exactas.
  const pasos: Paso[] = [];
  if (rep) {
    pasos.push({ titulo: 'Reporte recibido', detalle: formatoFechaHora(rep.creado), hecho: true });
    pasos.push({ titulo: 'En revisión por el equipo', hecho: rep.estado !== 'recibido' });
    if (inc) {
      pasos.push({ titulo: 'Atención en curso', detalle: `Incidente ${inc.codigo} · ${ESTADO_INCIDENTE[inc.estado].texto}`, hecho: true });
      if (inc.despachadoEn) pasos.push({ titulo: 'Unidad despachada', detalle: formatoFechaHora(inc.despachadoEn), hecho: true });
      if (inc.enSitioEn) pasos.push({ titulo: 'Unidad en el sitio', detalle: formatoFechaHora(inc.enSitioEn), hecho: true });
      if (inc.cerradoEn) pasos.push({ titulo: 'Atención finalizada', detalle: formatoFechaHora(inc.cerradoEn), hecho: true });
    }
    if (rep.estado === 'descartado') pasos.push({ titulo: 'Reporte descartado', detalle: 'No se pudo confirmar el siniestro con la información disponible.', hecho: true, fallido: true });
    else if (rep.estado === 'duplicado') pasos.push({ titulo: 'Unido a otro reporte', detalle: 'Otra persona ya había reportado este mismo siniestro; se atiende como uno solo.', hecho: true });
    else pasos.push({ titulo: 'Verificado e incluido en el registro', detalle: rep.revisadoEn && rep.estado === 'verificado' ? formatoFechaHora(rep.revisadoEn) : undefined, hecho: rep.estado === 'verificado' });
  }

  return (
    <div className="contenedor max-w-3xl py-10 lg:py-16">
      {sp.nuevo && rep && (
        <div className="sobre-oscuro mb-10 overflow-hidden rounded-3xl bg-noche text-white" role="status">
          <div className="franja h-2" aria-hidden="true" />
          <div className="p-6 sm:p-10">
            <p className="anotacion text-senal">Reporte enviado</p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Gracias. Tu reporte ya está en el <span className="serif text-senal">centro de gestión</span>.</h1>
            <p className="mt-6 text-white/80">Tu código de seguimiento:</p>
            <p className="cifra mt-1 break-all text-6xl tracking-wide text-senal sm:text-7xl" aria-label={`Código ${codigo.split('').join(' ')}`}>{codigo}</p>
            <p className="mt-4 text-white/80">Guárdalo o toma una captura. Con él puedes consultar el estado en esta página.</p>
            {inc && <p className="mt-3 font-semibold text-white">Como reportaste heridos o un siniestro grave, ya se abrió una atención prioritaria. Si no lo has hecho, llama al 123.</p>}
          </div>
        </div>
      )}
      {sp.nuevo && !rep && <div className="mb-8"><Aviso tono="exito">Recibimos tu reporte. Gracias por ayudar.</Aviso></div>}

      {!sp.nuevo && (
        <>
          <p className="anotacion text-tinta-3">Seguimiento de reportes ciudadanos</p>
          <h1 className="titular mt-3">Sigue tu <span className="serif text-marca">reporte</span>.</h1>
        </>
      )}

      <form action="/seguimiento" method="get" className="tarjeta mt-8 flex flex-wrap items-end gap-3 p-5" role="search">
        <div className="min-w-[14rem] flex-1">
          <label htmlFor="codigo" className="block font-semibold">Código de seguimiento</label>
          <input id="codigo" name="codigo" className="campo mt-1 font-mono uppercase" placeholder="RV-XXXX-XX" defaultValue={codigo} maxLength={20} autoComplete="off"
            aria-describedby="codigo-ayuda" aria-invalid={codigo && !rep ? true : undefined} />
          <p id="codigo-ayuda" className="mt-1 text-sm text-tinta-2">Lo recibiste al enviar el reporte (web, QR o WhatsApp).</p>
        </div>
        <button type="submit" className="boton boton-primario"><Search className="size-4" aria-hidden="true" />Consultar</button>
      </form>

      {codigo && !rep && <div className="mt-6"><Aviso tono="error">No encontramos un reporte con el código {codigo}. Revisa que esté bien escrito.</Aviso></div>}

      {rep && (
        <section className="tarjeta mt-6 p-6" aria-labelledby="estado-titulo">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="estado-titulo" className="text-xl font-bold">Estado de <span className="font-mono">{rep.codigo}</span></h2>
            <Insignia tono={ESTADO_REPORTE[rep.estado].tono}>{ESTADO_REPORTE[rep.estado].texto}</Insignia>
          </div>
          <ol className="mt-6 space-y-0">
            {pasos.map((p, i) => {
              const I = p.fallido ? CircleX : p.hecho ? Check : Circle;
              return (
                <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {i < pasos.length - 1 && <span aria-hidden="true" className={`absolute left-[15px] top-8 h-[calc(100%-2rem)] w-0.5 ${p.hecho ? 'bg-marca' : 'bg-borde'}`} />}
                  <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full ${p.fallido ? 'bg-error text-white' : p.hecho ? 'bg-marca text-white' : 'border-2 border-borde-fuerte bg-superficie text-tinta-3'}`}>
                    <I className="size-4" />
                  </span>
                  <div>
                    <p className={`font-semibold ${p.hecho ? '' : 'text-tinta-2'}`}>{p.titulo}<span className="sr-only">{p.hecho ? ' (completado)' : ' (pendiente)'}</span></p>
                    {p.detalle && <p className="text-sm text-tinta-2">{p.detalle}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <p className="mt-8 text-tinta-2">¿Viste otro siniestro? <Link href="/reportar" className="font-semibold text-marca underline underline-offset-4">Repórtalo aquí</Link>.</p>
    </div>
  );
}
