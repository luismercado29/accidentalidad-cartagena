'use client';

import { useActionState, useEffect, useRef } from 'react';

import type { EstadoAccion } from '@/app/acciones/operacion';
import { Aviso } from '@/components/ui';

/**
 * Formulario que llama una Server Action y muestra el resultado junto al
 * formulario. Si `limpiar` es true, se vacia tras un envio exitoso.
 */
export function FormAccion({ accion, children, className = '', limpiar = false, etiqueta }: {
  accion: (prev: EstadoAccion, fd: FormData) => Promise<EstadoAccion>;
  children: React.ReactNode; className?: string; limpiar?: boolean; etiqueta?: string;
}) {
  const [estado, enviar] = useActionState(accion, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => { if (estado.ok && limpiar) form.current?.reset(); }, [estado, limpiar]);
  return (
    <form ref={form} action={enviar} className={className} aria-label={etiqueta}>
      {children}
      {(estado.error || estado.ok) && (
        <div className="mt-3 basis-full">
          <Aviso tono={estado.error ? 'error' : 'exito'}>{estado.error ?? estado.ok}</Aviso>
        </div>
      )}
    </form>
  );
}
