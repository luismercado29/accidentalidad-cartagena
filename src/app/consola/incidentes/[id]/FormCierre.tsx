'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { cerrarIncidente, type EstadoAccion } from '@/app/acciones/operacion';
import { BotonEnviar } from '@/components/formulario';
import { Aviso } from '@/components/ui';
import type { Gravedad } from '@/db/esquema';
import { CLASE, GRAVEDAD, VEHICULO } from '@/lib/etiquetas';

/** Cierre del incidente: registra el siniestro definitivo o lo vincula a uno ya registrado. */
export function FormCierre({ id, titulo, gravedadSugerida, vehiculosSugeridos }: {
  id: number; titulo: string; gravedadSugerida: Gravedad; vehiculosSugeridos: string[];
}) {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(cerrarIncidente, {});
  const [modo, setModo] = useState<'nuevo' | 'existente'>('nuevo');
  const [gravedad, setGravedad] = useState<Gravedad>(gravedadSugerida);
  const aviso = useRef<HTMLDivElement>(null);
  useEffect(() => { if (estado.error || estado.ok) aviso.current?.focus(); }, [estado]);

  if (estado.ok) return <div ref={aviso} tabIndex={-1}><Aviso tono="exito">{estado.ok}</Aviso></div>;

  return (
    <form action={accion} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      {estado.error && <div ref={aviso} tabIndex={-1}><Aviso tono="error">{estado.error}</Aviso></div>}
      <fieldset>
        <legend className="font-semibold">Siniestro asociado</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-2"><input type="radio" name="modo" value="nuevo" checked={modo === 'nuevo'} onChange={() => setModo('nuevo')} className="accent-marca" />Registrar siniestro nuevo</label>
          <label className="flex items-center gap-2"><input type="radio" name="modo" value="existente" checked={modo === 'existente'} onChange={() => setModo('existente')} className="accent-marca" />Vincular a uno existente</label>
        </div>
      </fieldset>

      {modo === 'existente' ? (
        <label className="block font-semibold">Código del siniestro
          <input name="codigo" className="campo mt-1 font-mono font-normal" placeholder="SV-2026-000123" maxLength={40} />
        </label>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block font-semibold">Gravedad
            <select name="gravedad" value={gravedad} onChange={(ev) => setGravedad(ev.target.value as Gravedad)} className="campo mt-1 font-normal">
              {(Object.keys(GRAVEDAD) as Gravedad[]).map((g) => <option key={g} value={g}>{GRAVEDAD[g].texto}</option>)}
            </select>
          </label>
          <label className="block font-semibold">Clase
            <select name="clase" defaultValue={titulo.toLowerCase().startsWith('atropello') ? 'atropello' : 'choque'} className="campo mt-1 font-normal">
              {Object.entries(CLASE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block font-semibold">Personas heridas
            <input name="heridos" type="number" min={0} max={99} defaultValue={gravedad === 'leve' || gravedad === 'grave' ? 1 : 0} key={`h-${gravedad}`} className="campo mt-1 font-normal" />
          </label>
          <label className="block font-semibold">Víctimas fatales
            <input name="fallecidos" type="number" min={0} max={99} defaultValue={gravedad === 'fatal' ? 1 : 0} key={`f-${gravedad}`} className="campo mt-1 font-normal" />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="font-semibold">Vehículos y actores involucrados</legend>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {Object.entries(VEHICULO).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" name="vehiculos" value={k} defaultChecked={vehiculosSugeridos.includes(k)} className="size-4 accent-marca" />{v}</label>
              ))}
            </div>
          </fieldset>
          <label className="block font-semibold sm:col-span-2">Causa probable
            <input name="causaProbable" maxLength={200} className="campo mt-1 font-normal" placeholder="Exceso de velocidad, no respetar el pare…" />
          </label>
          <label className="block font-semibold sm:col-span-2">Descripción del siniestro
            <textarea name="descripcion" rows={2} maxLength={1000} defaultValue={titulo} className="campo mt-1 font-normal" />
          </label>
        </div>
      )}
      <label className="block font-semibold">Resumen del cierre <span aria-hidden="true" className="text-error">*</span>
        <textarea name="resumen" rows={2} maxLength={1000} required className="campo mt-1 font-normal" defaultValue="Vía despejada. Se levantó el informe del siniestro." />
      </label>
      <BotonEnviar pendiente="Cerrando…">Cerrar incidente</BotonEnviar>
    </form>
  );
}
