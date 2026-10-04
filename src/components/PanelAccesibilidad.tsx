'use client';

import { Accessibility, RotateCcw, X } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';

import { guardarAccesibilidad } from '@/app/acciones/accesibilidad';
import type { PreferenciasAccesibilidad } from '@/db/esquema';
import { atributosHtml, PREFERENCIAS_BASE } from '@/lib/accesibilidad';

const TAMANOS = [100, 125, 150, 175, 200] as const;

/** Aplica al instante en <html> (el servidor lo persiste en paralelo). */
function aplicar(p: PreferenciasAccesibilidad) {
  const html = document.documentElement;
  const { className, 'data-texto': texto } = atributosHtml(p);
  for (const c of ['alto-contraste', 'fuente-legible', 'subrayar-enlaces', 'reducir-movimiento', 'interlineado-amplio']) html.classList.remove(c);
  for (const c of className.split(' ').filter(Boolean)) html.classList.add(c);
  html.dataset.texto = texto;
}

export function PanelAccesibilidad({ inicial, compacto = false }: { inicial: PreferenciasAccesibilidad; compacto?: boolean }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [p, setP] = useState(inicial);
  const [anuncio, setAnuncio] = useState('');
  const [, startTransition] = useTransition();

  function cambiar<K extends keyof PreferenciasAccesibilidad>(clave: K, valor: PreferenciasAccesibilidad[K], texto: string) {
    const nuevo = { ...p, [clave]: valor };
    setP(nuevo);
    aplicar(nuevo);
    setAnuncio(texto);
    startTransition(() => { void guardarAccesibilidad(nuevo); });
  }

  const interruptor = (clave: 'altoContraste' | 'fuenteLegible' | 'subrayarEnlaces' | 'reducirMovimiento', titulo: string, ayuda: string) => (
    <li className="flex items-start justify-between gap-4 py-3">
      <span>
        <span className="block font-semibold" id={`lbl-${clave}`}>{titulo}</span>
        <span className="block text-sm text-tinta-2" id={`ayuda-${clave}`}>{ayuda}</span>
      </span>
      <button
        type="button" role="switch" aria-checked={p[clave]} aria-labelledby={`lbl-${clave}`} aria-describedby={`ayuda-${clave}`}
        onClick={() => cambiar(clave, !p[clave], `${titulo}: ${!p[clave] ? 'activado' : 'desactivado'}`)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${p[clave] ? 'bg-marca' : 'bg-borde-fuerte'}`}
      >
        <span aria-hidden="true" className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${p[clave] ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </li>
  );

  return (
    <>
      <button
        type="button" onClick={() => dialogo.current?.showModal()}
        className="boton boton-fantasma px-2.5 sm:px-3" aria-haspopup="dialog"
      >
        <Accessibility className="size-5" aria-hidden="true" />
        <span className={compacto ? 'sr-only' : 'max-lg:sr-only'}>Accesibilidad</span>
      </button>

      <dialog
        ref={dialogo} aria-labelledby="titulo-accesibilidad"
        className="m-auto w-[min(34rem,calc(100vw-2rem))] max-h-[90dvh] rounded-2xl bg-superficie p-0 text-tinta shadow-elevada backdrop:bg-noche/60"
        onClick={(ev) => { if (ev.target === dialogo.current) dialogo.current?.close(); }}
      >
        <div className="flex items-center justify-between border-b border-borde px-6 py-4">
          <h2 id="titulo-accesibilidad" className="text-xl font-bold">Ajustes de accesibilidad</h2>
          <button type="button" className="boton boton-fantasma px-2" onClick={() => dialogo.current?.close()} aria-label="Cerrar ajustes de accesibilidad">
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-6 py-4">
          <p className="text-tinta-2">Se guardan en este navegador y, si iniciaste sesión, en tu cuenta.</p>

          <fieldset className="mt-5">
            <legend className="font-semibold">Tamaño del texto</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {TAMANOS.map((t) => (
                <label key={t} className={`boton min-h-11 cursor-pointer px-4 ${p.tamanoTexto === t ? 'boton-primario' : 'boton-secundario'}`}>
                  <input type="radio" name="tamano" className="sr-only" checked={p.tamanoTexto === t}
                    onChange={() => cambiar('tamanoTexto', t, `Tamaño del texto: ${t} por ciento`)} />
                  {t}%
                </label>
              ))}
            </div>
          </fieldset>

          <ul className="mt-3 divide-y divide-borde">
            {interruptor('altoContraste', 'Alto contraste', 'Negro sobre blanco con bordes marcados.')}
            {interruptor('fuenteLegible', 'Fuente de alta legibilidad', 'Atkinson Hyperlegible, pensada para baja visión.')}
            {interruptor('subrayarEnlaces', 'Subrayar enlaces', 'Distingue los enlaces sin depender del color.')}
            {interruptor('reducirMovimiento', 'Reducir movimiento', 'Desactiva animaciones y desplazamientos suaves.')}
            <li className="flex items-start justify-between gap-4 py-3">
              <span>
                <span className="block font-semibold" id="lbl-interlineado">Espaciado amplio</span>
                <span className="block text-sm text-tinta-2">Más espacio entre líneas y letras; ayuda con la dislexia.</span>
              </span>
              <button type="button" role="switch" aria-checked={p.interlineado === 'amplio'} aria-labelledby="lbl-interlineado"
                onClick={() => cambiar('interlineado', p.interlineado === 'amplio' ? 'normal' : 'amplio', `Espaciado amplio: ${p.interlineado === 'amplio' ? 'desactivado' : 'activado'}`)}
                className={`relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors ${p.interlineado === 'amplio' ? 'bg-marca' : 'bg-borde-fuerte'}`}>
                <span aria-hidden="true" className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${p.interlineado === 'amplio' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </li>
          </ul>

          <label className="mt-3 block">
            <span className="font-semibold">Velocidad de lectura en voz alta: {p.velocidadVoz.toFixed(2).replace('.', ',')}×</span>
            <input type="range" min={0.5} max={2} step={0.25} value={p.velocidadVoz} className="mt-2 w-full accent-marca"
              onChange={(ev) => cambiar('velocidadVoz', Number(ev.target.value), `Velocidad de voz ${ev.target.value}`)} />
          </label>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-borde px-6 py-4">
          <button type="button" className="boton boton-fantasma" onClick={() => { setP(PREFERENCIAS_BASE); aplicar(PREFERENCIAS_BASE); setAnuncio('Ajustes restablecidos'); startTransition(() => { void guardarAccesibilidad(PREFERENCIAS_BASE); }); }}>
            <RotateCcw className="size-4" aria-hidden="true" /> Restablecer
          </button>
          <button type="button" className="boton boton-primario" onClick={() => dialogo.current?.close()}>Listo</button>
        </div>
        <p role="status" aria-live="polite" className="sr-only">{anuncio}</p>
      </dialog>
    </>
  );
}
