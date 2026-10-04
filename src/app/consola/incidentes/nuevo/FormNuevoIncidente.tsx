'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { crearIncidente, type EstadoAccion } from '@/app/acciones/operacion';
import { BotonEnviar, Campo } from '@/components/formulario';
import { SelectorUbicacion } from '@/components/operacion/SelectorUbicacion';
import { Aviso } from '@/components/ui';
import type { Prioridad } from '@/db/esquema';
import { PRIORIDAD } from '@/lib/etiquetas';

const PRIORIDADES = Object.keys(PRIORIDAD) as Prioridad[];

export function FormNuevoIncidente() {
  const [estado, accion] = useActionState<EstadoAccion, FormData>(crearIncidente, {});
  const [prioridad, setPrioridad] = useState<Prioridad>('media');
  const [sla, setSla] = useState(PRIORIDAD.media.sla);
  const error = useRef<HTMLDivElement>(null);
  useEffect(() => { if (estado.error) error.current?.focus(); }, [estado]);

  return (
    <form action={accion} className="tarjeta space-y-6 p-6" noValidate>
      {estado.error && <div ref={error} tabIndex={-1}><Aviso tono="error">{estado.error}</Aviso></div>}
      <Campo nombre="titulo" etiqueta="Qué está pasando" requerido max={160} placeholder="Choque entre moto y taxi; un herido" />
      <SelectorUbicacion etiqueta="Ubicación del incidente" />
      <Campo nombre="direccion" etiqueta="Dirección o referencia" max={200} placeholder="Av. Pedro de Heredia frente al CAI" />

      <fieldset>
        <legend className="font-semibold">Prioridad <span aria-hidden="true" className="text-error">*</span></legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-4">
          {PRIORIDADES.map((p) => (
            <label key={p} className={`flex cursor-pointer flex-col rounded-xl border-2 px-3 py-2 ${prioridad === p ? 'border-marca bg-marca-suave' : 'border-borde'}`}>
              <span className="flex items-center gap-2 font-semibold">
                <input type="radio" name="prioridad" value={p} checked={prioridad === p} className="accent-marca"
                  onChange={() => { setPrioridad(p); setSla(PRIORIDAD[p].sla); }} />
                {PRIORIDAD[p].texto}
              </span>
              <span className="text-sm text-tinta-2">Llegada en {PRIORIDAD[p].sla} min</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block max-w-xs font-semibold">Tiempo máximo de llegada (minutos)
        <input name="slaMin" type="number" min={2} max={240} value={sla} onChange={(ev) => setSla(Number(ev.target.value))} className="campo mt-1 font-normal" />
        <span className="mt-1 block text-sm font-normal text-tinta-2">Se ajusta solo con la prioridad; cámbialo si el caso lo requiere.</span>
      </label>

      <Campo nombre="notas" etiqueta="Notas iniciales" multilinea filas={3} max={1000} ayuda="Quién avisó, número de personas involucradas, riesgos en el sitio." />
      <div className="flex justify-end">
        <BotonEnviar pendiente="Abriendo…">Abrir incidente</BotonEnviar>
      </div>
    </form>
  );
}
