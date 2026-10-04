'use client';

import { ArrowUp, Bot, RotateCcw, User } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

type Mensaje = { rol: 'usuario' | 'asistente'; texto: string; modo?: 'ia' | 'respaldo'; error?: boolean };

const SUGERENCIAS = [
  '¿Cuántos siniestros hubo este mes?',
  '¿En qué horas ocurren más siniestros?',
  '¿Cuáles son los puntos negros?',
  'Compara el año pasado con este año',
  '¿Qué riesgo hay hoy a las 6 pm con lluvia?',
  '¿Hay obras o cierres en la vía?',
];

/**
 * Chat accesible: el historial es un role="log" (los lectores de pantalla leen
 * cada respuesta nueva), el foco vuelve al campo tras responder y Enter envia.
 */
export function Chat({ oscuro = false, iaConfigurada }: { oscuro?: boolean; iaConfigurada: boolean }) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const [modo, setModo] = useState<'ia' | 'respaldo' | null>(null);
  const [demo, setDemo] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);
  const fin = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => { fin.current?.scrollIntoView({ block: 'nearest' }); }, [mensajes, cargando]);

  async function enviar(pregunta: string) {
    const t = pregunta.trim().slice(0, 1000);
    if (!t || cargando) return;
    const historial: Mensaje[] = [...mensajes.filter((m) => !m.error), { rol: 'usuario', texto: t }];
    setMensajes((m) => [...m, { rol: 'usuario', texto: t }]);
    setTexto('');
    setCargando(true);
    try {
      const r = await fetch('/api/asistente', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: historial.slice(-10).map(({ rol, texto: x }) => ({ rol, texto: x })) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Error');
      setModo(d.modo);
      setDemo(d.demo);
      setMensajes((m) => [...m, { rol: 'asistente', texto: d.respuesta, modo: d.modo }]);
    } catch (err) {
      setMensajes((m) => [...m, { rol: 'asistente', texto: err instanceof Error && err.message !== 'Error' ? err.message : 'No pude responder ahora. Inténtalo de nuevo.', error: true }]);
    } finally {
      setCargando(false);
      campo.current?.focus();
    }
  }

  const modoActual = modo ?? (iaConfigurada ? 'ia' : 'respaldo');
  const burbujaAsistente = oscuro ? 'bg-noche-2 text-white border border-noche-borde' : 'bg-superficie border border-borde';
  return (
    <div className={`flex flex-col ${oscuro ? 'sobre-oscuro text-white' : ''}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className={`insignia ${modoActual === 'ia' ? 'bg-senal text-tinta' : oscuro ? 'bg-white/10 text-white' : 'bg-hundido text-tinta-2'}`}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
          {modoActual === 'ia' ? 'Modo IA con datos en vivo' : 'Modo de respaldo por reglas'}
        </span>
        {demo && <span className={oscuro ? 'text-white/70' : 'text-tinta-2'}>Incluye datos de demostración.</span>}
        {mensajes.length > 0 && (
          <button type="button" className={`ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 font-semibold ${oscuro ? 'hover:bg-white/10' : 'hover:bg-hundido'}`}
            onClick={() => { setMensajes([]); setModo(null); campo.current?.focus(); }}>
            <RotateCcw className="size-4" aria-hidden="true" />Nueva conversación
          </button>
        )}
      </div>

      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversación con el asistente" aria-busy={cargando}
        className={`min-h-64 flex-1 space-y-4 overflow-y-auto rounded-2xl p-4 ${oscuro ? 'bg-black/20' : 'bg-hundido'}`} style={{ maxHeight: '32rem' }}>
        {mensajes.length === 0 && (
          <div>
            <p className={oscuro ? 'text-white/80' : 'text-tinta-2'}>Pregúntame por cifras, zonas, horarios, riesgo o novedades en la vía. Algunas ideas:</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {SUGERENCIAS.map((s) => (
                <li key={s}>
                  <button type="button" onClick={() => enviar(s)}
                    className={`min-h-10 rounded-full px-4 text-left text-sm font-medium ${oscuro ? 'border border-white/20 hover:bg-white/10' : 'border border-borde-fuerte bg-superficie hover:border-tinta'}`}>{s}</button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.rol === 'usuario' ? 'flex-row-reverse' : ''}`}>
            <span aria-hidden="true" className={`grid size-8 shrink-0 place-items-center rounded-full ${m.rol === 'usuario' ? 'bg-marca text-white' : 'bg-senal text-tinta'}`}>
              {m.rol === 'usuario' ? <User className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className={`max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-3 ${m.rol === 'usuario' ? 'bg-marca text-white' : m.error ? 'border border-error/30 bg-error-suave text-error' : burbujaAsistente}`}>
              <span className="sr-only">{m.rol === 'usuario' ? 'Tú dijiste: ' : 'El asistente responde: '}</span>
              {m.texto}
            </div>
          </div>
        ))}
        {cargando && <p className={`anotacion ${oscuro ? 'text-white/70' : 'text-tinta-3'}`}><span className="latido">Consultando los datos…</span></p>}
        <div ref={fin} />
      </div>

      <form className="mt-3 flex items-end gap-2" onSubmit={(ev) => { ev.preventDefault(); void enviar(texto); }}>
        <div className="flex-1">
          <label htmlFor={id} className="sr-only">Escribe tu pregunta</label>
          <textarea id={id} ref={campo} rows={2} maxLength={1000} value={texto} onChange={(ev) => setTexto(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); void enviar(texto); } }}
            placeholder="Escribe tu pregunta… (Enter envía, Mayús+Enter salto de línea)"
            className={`campo resize-none ${oscuro ? 'border-noche-borde bg-noche-2 text-white placeholder:text-white/50' : ''}`} />
        </div>
        <button type="submit" disabled={cargando || !texto.trim()} className="boton boton-senal size-12 shrink-0 px-0" aria-label="Enviar pregunta">
          <ArrowUp className="size-5" aria-hidden="true" />
        </button>
      </form>
      <p className={`mt-2 text-xs ${oscuro ? 'text-white/60' : 'text-tinta-3'}`}>No guardamos tus conversaciones. Ante una emergencia, llama al 123.</p>
    </div>
  );
}
