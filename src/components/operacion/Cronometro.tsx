'use client';

import { useEffect, useState } from 'react';

/**
 * Cronometro de un incidente frente a su tiempo maximo de llegada (SLA).
 * Si `hasta` existe, el tiempo queda detenido (la unidad ya llego).
 * Se actualiza cada segundo pero no se anuncia, para no saturar al lector de pantalla.
 */
export function Cronometro({ desde, hasta, slaMin, grande = false, oscuro = false }: {
  desde: string; hasta?: string | null; slaMin: number; grande?: boolean; oscuro?: boolean;
}) {
  const [ahora, setAhora] = useState<number | null>(null);
  useEffect(() => {
    setAhora(Date.now());
    if (hasta) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hasta]);
  const inicio = new Date(desde).getTime();
  const fin = hasta ? new Date(hasta).getTime() : ahora ?? inicio;
  const seg = Math.max(0, Math.floor((fin - inicio) / 1000));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  const texto = `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
  const fraccion = seg / 60 / slaMin;
  const nivel = fraccion > 1 ? 'fuera' : fraccion > 0.75 ? 'riesgo' : 'ok';
  const color = oscuro
    ? { ok: 'text-[#7EE2A8]', riesgo: 'text-senal', fuera: 'text-[#FF8A80]' }[nivel]
    : { ok: 'text-exito', riesgo: 'text-aviso-texto', fuera: 'text-error' }[nivel];
  const estado = hasta
    ? (fraccion > 1 ? 'llegó fuera de tiempo' : 'llegó a tiempo')
    : { ok: 'dentro del tiempo', riesgo: 'cerca del límite', fuera: 'fuera de tiempo' }[nivel];
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-2 ${color}`}>
      <span className={`font-mono tabular ${grande ? 'text-3xl font-semibold' : 'text-sm font-semibold'}`} aria-hidden="true" suppressHydrationWarning>{ahora == null && !hasta ? '–:––' : texto}</span>
      <span className={grande ? 'text-sm font-semibold' : 'text-xs font-semibold'}>{estado} · máx. {slaMin} min</span>
      <span className="sr-only" suppressHydrationWarning>{`Tiempo transcurrido: ${h * 60 + m} minutos`}</span>
    </span>
  );
}
