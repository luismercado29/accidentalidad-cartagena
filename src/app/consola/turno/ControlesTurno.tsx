'use client';

import { Maximize, Minimize, Pause, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

const INTERVALO_S = 20;

/**
 * Controles del panel de turno: reloj, auto-actualizacion cada 20 s (pausable)
 * y pantalla completa. Cada ciclo consulta /api/notificaciones (que avanza la
 * simulacion y revisa alertas) y luego refresca los datos del servidor.
 */
export function ControlesTurno({ objetivo }: { objetivo: string }) {
  const router = useRouter();
  const [hora, setHora] = useState<Date | null>(null);
  const [pausado, setPausado] = useState(false);
  const [restante, setRestante] = useState(INTERVALO_S);
  const [completa, setCompleta] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const [, iniciar] = useTransition();

  useEffect(() => {
    setHora(new Date());
    const t = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (pausado) return;
    const t = setInterval(() => setRestante((r) => (r > 0 ? r - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [pausado]);

  useEffect(() => {
    if (restante > 0 || pausado) return;
    setRestante(INTERVALO_S);
    void (async () => {
      try { await fetch('/api/notificaciones', { cache: 'no-store' }); } catch { /* se reintenta en el siguiente ciclo */ }
      iniciar(() => router.refresh());
      setAnuncio(`Panel actualizado a las ${new Date().toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' })}`);
    })();
  }, [restante, pausado, router]);

  useEffect(() => {
    const cambio = () => setCompleta(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', cambio);
    return () => document.removeEventListener('fullscreenchange', cambio);
  }, []);

  function pantallaCompleta() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.getElementById(objetivo)?.requestFullscreen();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-right">
        <span className="cifra block text-5xl text-white" suppressHydrationWarning>
          {hora ? hora.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Bogota' }) : '––:––:––'}
        </span>
        <span className="anotacion text-white/70" suppressHydrationWarning>
          {hora ? hora.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Bogota' }) : ''}
        </span>
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => { setPausado((p) => !p); setRestante(INTERVALO_S); }} aria-pressed={pausado}
          className="boton boton-chico border border-noche-borde bg-noche-2 text-white hover:bg-white/10">
          {pausado ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
          {pausado ? 'Reanudar' : <span>Pausar <span className="font-mono text-white/70" aria-hidden="true">{restante}s</span></span>}
          <span className="sr-only">actualización automática</span>
        </button>
        <button type="button" onClick={pantallaCompleta} className="boton boton-chico border border-noche-borde bg-noche-2 text-white hover:bg-white/10">
          {completa ? <Minimize className="size-4" aria-hidden="true" /> : <Maximize className="size-4" aria-hidden="true" />}
          {completa ? 'Salir de pantalla completa' : 'Pantalla completa'}
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{anuncio}</p>
    </div>
  );
}
