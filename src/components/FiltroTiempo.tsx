'use client';

import { CalendarRange } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, useTransition } from 'react';

import { PERIODOS } from '@/lib/tiempo';

/**
 * Filtro de tiempo comun. Escribe ?periodo= (y ?desde=&hasta= para un rango)
 * en la URL, conserva los demas filtros y reinicia la paginacion.
 */
export function FiltroTiempo({ actual, etiqueta, anios, desde, hasta, compacto = false, oscuro = false }: {
  actual: string; etiqueta: string; anios: number[]; desde?: string; hasta?: string; compacto?: boolean; oscuro?: boolean;
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const id = useId();
  const [clave, setClave] = useState(actual);
  const [pendiente, iniciar] = useTransition();

  function aplicar(nueva: string, d?: string, h?: string) {
    const u = new URLSearchParams(params.toString());
    u.set('periodo', nueva);
    u.delete('pagina');
    if (nueva === 'rango') {
      if (d) u.set('desde', d); else u.delete('desde');
      if (h) u.set('hasta', h); else u.delete('hasta');
    } else {
      u.delete('desde');
      u.delete('hasta');
    }
    iniciar(() => router.push(`${ruta}?${u.toString()}`, { scroll: false }));
  }

  const estiloCampo = oscuro ? 'campo min-h-10 border-noche-borde bg-noche-2 text-white' : 'campo min-h-10';
  return (
    <form
      className={`flex flex-wrap items-end gap-2 ${pendiente ? 'opacity-70' : ''}`}
      aria-label="Filtro de tiempo"
      onSubmit={(ev) => {
        ev.preventDefault();
        const f = new FormData(ev.currentTarget);
        aplicar('rango', String(f.get('desde') || ''), String(f.get('hasta') || ''));
      }}
    >
      <div className="min-w-[13rem]">
        <label htmlFor={`${id}-p`} className={`flex items-center gap-1.5 text-sm font-semibold ${oscuro ? 'text-white/80' : 'text-tinta-2'} ${compacto ? 'sr-only' : ''}`}>
          <CalendarRange className="size-4" aria-hidden="true" /> Periodo
        </label>
        <select
          id={`${id}-p`} className={`${estiloCampo} mt-1 py-1.5`} value={clave}
          onChange={(ev) => { setClave(ev.target.value); if (ev.target.value !== 'rango') aplicar(ev.target.value); }}
        >
          <optgroup label="Recientes">
            {PERIODOS.filter((p) => !['anio-anterior', 'hace-1-anio', 'todo'].includes(p.clave)).map((p) => <option key={p.clave} value={p.clave}>{p.etiqueta}</option>)}
          </optgroup>
          <optgroup label="Historial">
            {PERIODOS.filter((p) => ['anio-anterior', 'hace-1-anio', 'todo'].includes(p.clave)).map((p) => <option key={p.clave} value={p.clave}>{p.etiqueta}</option>)}
            {anios.map((a) => <option key={a} value={`a${a}`}>Año {a}</option>)}
          </optgroup>
          <option value="rango">Rango de fechas…</option>
        </select>
      </div>
      {clave === 'rango' && (
        <>
          <div>
            <label htmlFor={`${id}-d`} className={`text-sm font-semibold ${oscuro ? 'text-white/80' : 'text-tinta-2'}`}>Desde</label>
            <input id={`${id}-d`} name="desde" type="date" defaultValue={desde} className={`${estiloCampo} mt-1 py-1.5`} min="2015-01-01" />
          </div>
          <div>
            <label htmlFor={`${id}-h`} className={`text-sm font-semibold ${oscuro ? 'text-white/80' : 'text-tinta-2'}`}>Hasta</label>
            <input id={`${id}-h`} name="hasta" type="date" defaultValue={hasta} className={`${estiloCampo} mt-1 py-1.5`} min="2015-01-01" />
          </div>
          <button type="submit" className="boton boton-primario boton-chico min-h-10">Aplicar</button>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">{pendiente ? 'Cargando…' : `Mostrando: ${etiqueta}`}</p>
    </form>
  );
}
