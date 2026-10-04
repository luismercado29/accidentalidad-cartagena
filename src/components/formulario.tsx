'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

type CampoProps = {
  nombre: string; etiqueta: string; tipo?: string; ayuda?: string; error?: string; valor?: string;
  requerido?: boolean; autoComplete?: string; multilinea?: boolean; filas?: number; placeholder?: string; max?: number;
};

/** Campo accesible: etiqueta visible, ayuda persistente y error asociado (aria-describedby). */
export function Campo({ nombre, etiqueta, tipo = 'text', ayuda, error, valor, requerido, autoComplete, multilinea, filas = 4, placeholder, max }: CampoProps) {
  const id = useId();
  const [ver, setVer] = useState(false);
  const descripcion = [error && `${id}-error`, ayuda && `${id}-ayuda`].filter(Boolean).join(' ') || undefined;
  const comunes = {
    id, name: nombre, defaultValue: valor, required: requerido, placeholder, maxLength: max,
    'aria-invalid': error ? true : undefined, 'aria-describedby': descripcion, className: 'campo',
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block font-semibold">
        {etiqueta}{requerido && <span aria-hidden="true" className="text-error"> *</span>}
      </label>
      {multilinea ? (
        <textarea {...comunes} rows={filas} />
      ) : tipo === 'password' ? (
        <div className="relative">
          <input {...comunes} type={ver ? 'text' : 'password'} autoComplete={autoComplete} className="campo pr-14" />
          <button type="button" onClick={() => setVer((v) => !v)} aria-pressed={ver}
            aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-tinta-2 hover:text-tinta">
            {ver ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
          </button>
        </div>
      ) : (
        <input {...comunes} type={tipo} autoComplete={autoComplete} />
      )}
      {error && <p id={`${id}-error`} className="text-sm font-semibold text-error">{error}</p>}
      {ayuda && <p id={`${id}-ayuda`} className="text-sm text-tinta-2">{ayuda}</p>}
    </div>
  );
}

export function BotonEnviar({ children, pendiente = 'Enviando…', className = 'boton boton-primario' }: { children: React.ReactNode; pendiente?: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} aria-disabled={pending} disabled={pending}>
      {pending ? pendiente : children}
    </button>
  );
}

/** Tras un envio con errores, lleva el foco al primer campo invalido (WCAG 3.3.1). */
export function FocoEnError({ errores }: { errores?: Record<string, string> | string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!errores) return;
    const form = ref.current?.closest('form');
    const invalido = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
    (invalido ?? form?.querySelector<HTMLElement>('[role="alert"]'))?.focus();
  }, [errores]);
  return <span ref={ref} hidden />;
}
