'use client';

import { RefreshCw } from 'lucide-react';
import { useActionState } from 'react';

import { actualizarPuntoNegro, recalcularPuntosNegros, type EstadoAnalisis } from '@/app/acciones/analisis';
import { BotonEnviar } from '@/components/formulario';
import { Aviso } from '@/components/ui';
import { INTERVENCION } from '@/lib/etiquetas';

/** Recalcula con el periodo que ya esta en la URL (FiltroTiempo) y los parametros elegidos. */
export function FormRecalculo({ periodo, desde, hasta }: { periodo: string; desde?: string; hasta?: string }) {
  const [estado, accion] = useActionState<EstadoAnalisis, FormData>(recalcularPuntosNegros, {});
  return (
    <form action={accion} className="space-y-3">
      <input type="hidden" name="periodo" value={periodo} />
      {desde && <input type="hidden" name="desde" value={desde} />}
      {hasta && <input type="hidden" name="hasta" value={hasta} />}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-sm font-semibold text-tinta-2">Radio de agrupación</span>
          <select name="radio" defaultValue="150" className="campo mt-1 min-h-10 py-1.5">
            {[100, 150, 200, 250, 300].map((r) => <option key={r} value={r}>{r} m</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-tinta-2">Mínimo de siniestros</span>
          <input name="minimo" type="number" min={3} max={50} defaultValue={8} className="campo mt-1 min-h-10 w-28 py-1.5" />
        </label>
        <BotonEnviar className="boton boton-primario boton-chico min-h-10" pendiente="Calculando…">
          <RefreshCw className="size-4" aria-hidden="true" />Recalcular
        </BotonEnviar>
      </div>
      {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
    </form>
  );
}

export function FormPunto({ id, nombre, estadoIntervencion, notas }: { id: number; nombre: string; estadoIntervencion: string; notas: string | null }) {
  const [estado, accion] = useActionState<EstadoAnalisis, FormData>(actualizarPuntoNegro, {});
  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <label className="block">
        <span className="font-semibold">Nombre del sitio</span>
        <input name="nombre" defaultValue={nombre} maxLength={120} required className="campo mt-1.5" />
      </label>
      <label className="block">
        <span className="font-semibold">Estado de intervención</span>
        <select name="estadoIntervencion" defaultValue={estadoIntervencion} className="campo mt-1.5">
          {Object.entries(INTERVENCION).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="font-semibold">Notas y medidas</span>
        <textarea name="notas" defaultValue={notas ?? ''} rows={4} maxLength={2000} className="campo mt-1.5"
          placeholder="Ej.: reductores de velocidad instalados, cambio de fase semafórica, demarcación…" />
      </label>
      <BotonEnviar pendiente="Guardando…">Guardar cambios</BotonEnviar>
      {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
    </form>
  );
}
