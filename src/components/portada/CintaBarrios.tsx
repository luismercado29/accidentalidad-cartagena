'use client';

import { Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

/** Cinta de datos con los barrios mas criticos. Boton de pausa (WCAG 2.2.2) en su propia fila. */
export function CintaBarrios({ barrios }: { barrios: { nombre: string; total: number; fatales: number }[] }) {
  const [pausada, setPausada] = useState(false);
  const elementos = (oculta: boolean) => barrios.map((b) => (
    <li key={`${b.nombre}-${oculta}`} aria-hidden={oculta || undefined} className="flex shrink-0 items-center gap-6 pr-6">
      <Link href={`/mapa?barrio=${encodeURIComponent(b.nombre)}`} tabIndex={oculta ? -1 : undefined}
        className="flex items-baseline gap-3 text-white/90 hover:text-white">
        <span className="serif text-3xl md:text-5xl">{b.nombre}</span>
        <span className="cifra text-2xl text-senal md:text-4xl">{b.total.toLocaleString('es-CO')}</span>
        <span className="anotacion text-white/60">{b.fatales ? `${b.fatales} fatales` : 'siniestros'}</span>
      </Link>
      <span aria-hidden="true" className="size-3 rotate-45 bg-senal" />
    </li>
  ));
  return (
    <section aria-labelledby="cinta-titulo" className="cinta sobre-oscuro bg-noche pb-4 pt-8" data-pausada={pausada}>
      <h2 id="cinta-titulo" className="sr-only">Barrios con más siniestros en los últimos 12 meses</h2>
      <div className="overflow-hidden">
        <ul className="cinta-pista">{elementos(false)}{elementos(true)}</ul>
      </div>
      <div className="contenedor mt-4 flex items-center justify-between gap-4">
        <p className="anotacion text-white/60">Barrios con más siniestros · últimos 12 meses</p>
        <button type="button" onClick={() => setPausada((v) => !v)} aria-pressed={pausada}
          className="boton size-11 shrink-0 bg-white/10 p-0 text-white hover:bg-white/20"
          aria-label={pausada ? 'Reanudar movimiento de la cinta de barrios' : 'Pausar movimiento de la cinta de barrios'}>
          {pausada ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}
