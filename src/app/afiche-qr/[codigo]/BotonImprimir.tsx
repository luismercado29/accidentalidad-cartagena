'use client';

import { Printer } from 'lucide-react';

export function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="boton boton-primario">
      <Printer className="size-4" aria-hidden="true" />Imprimir afiche
    </button>
  );
}
