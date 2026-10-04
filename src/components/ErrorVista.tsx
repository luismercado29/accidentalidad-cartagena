'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Vista de error de un modulo. Next la usa como error boundary: si un modulo
 * falla, el resto de la aplicacion sigue funcionando (nunca pantalla en negro).
 */
export function ErrorVista({ error, reset, volver = '/' }: { error: Error & { digest?: string }; reset: () => void; volver?: string }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-xl py-16 text-center">
      <TriangleAlert className="mx-auto size-10 text-aviso" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-bold">Este módulo tuvo un problema</h1>
      <p className="mt-2 text-tinta-2">El resto del sistema sigue funcionando. Puedes reintentar o volver al inicio.</p>
      {error.digest && <p className="anotacion mt-3 text-tinta-3">Referencia: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button type="button" onClick={reset} className="boton boton-primario"><RotateCcw className="size-4" aria-hidden="true" />Reintentar</button>
        <Link href={volver} className="boton boton-secundario">Volver</Link>
      </div>
    </div>
  );
}
