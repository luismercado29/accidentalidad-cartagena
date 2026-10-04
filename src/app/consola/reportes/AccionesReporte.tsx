'use client';

import { CheckCheck, CopyX, Siren, Trash2 } from 'lucide-react';
import { useActionState, useId } from 'react';

import {
  abrirIncidenteDesdeReporte, descartarReporte, marcarDuplicado, verificarComoSiniestro, type EstadoAccion,
} from '@/app/acciones/reportes';
import { BotonEnviar } from '@/components/formulario';
import { Aviso } from '@/components/ui';

type Opcion = { valor: string; texto: string };

function Resultado({ estado }: { estado: EstadoAccion }) {
  if (estado.error) return <Aviso tono="error">{estado.error}</Aviso>;
  if (estado.ok) return <Aviso tono="exito">{estado.ok}</Aviso>;
  return null;
}

export function AccionesReporte({ id, gravedad, cerrado, tieneIncidente, tieneSiniestro, candidatos }: {
  id: number; gravedad: string; cerrado: boolean; tieneIncidente: boolean; tieneSiniestro: boolean; candidatos: Opcion[];
}) {
  const [eVer, aVer] = useActionState<EstadoAccion, FormData>(verificarComoSiniestro, {});
  const [eInc, aInc] = useActionState<EstadoAccion, FormData>(abrirIncidenteDesdeReporte, {});
  const [eDup, aDup] = useActionState<EstadoAccion, FormData>(marcarDuplicado, {});
  const [eDes, aDes] = useActionState<EstadoAccion, FormData>(descartarReporte, {});
  const uid = useId();

  return (
    <div className="space-y-4">
      {[eVer, eInc, eDup, eDes].map((s, i) => <Resultado key={i} estado={s} />)}

      {!tieneSiniestro && (
        <form action={aVer} className="space-y-3 rounded-xl border border-borde p-4">
          <input type="hidden" name="id" value={id} />
          <h3 className="flex items-center gap-2 font-semibold"><CheckCheck className="size-4 text-exito" aria-hidden="true" />Verificar y registrar siniestro</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${uid}-g`} className="text-sm font-semibold">Gravedad confirmada</label>
              <select id={`${uid}-g`} name="gravedad" defaultValue={gravedad} className="campo mt-1">
                <option value="solo_danos">Solo daños</option><option value="leve">Heridos leves</option>
                <option value="grave">Heridos graves</option><option value="fatal">Víctimas fatales</option>
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-c`} className="text-sm font-semibold">Clase</label>
              <select id={`${uid}-c`} name="clase" className="campo mt-1">
                <option value="choque">Choque</option><option value="atropello">Atropello</option><option value="volcamiento">Volcamiento</option>
                <option value="caida_ocupante">Caída de ocupante</option><option value="incendio">Incendio</option><option value="otro">Otro</option>
              </select>
            </div>
          </div>
          <BotonEnviar className="boton boton-primario boton-chico" pendiente="Registrando…">Verificar y registrar</BotonEnviar>
        </form>
      )}

      {!tieneIncidente && !cerrado && (
        <form action={aInc} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde p-4">
          <input type="hidden" name="id" value={id} />
          <span>
            <span className="flex items-center gap-2 font-semibold"><Siren className="size-4 text-error" aria-hidden="true" />Abrir incidente</span>
            <span className="text-sm text-tinta-2">Para despachar una unidad al sitio.</span>
          </span>
          <BotonEnviar className="boton boton-secundario boton-chico" pendiente="Abriendo…">Abrir incidente</BotonEnviar>
        </form>
      )}

      {!cerrado && candidatos.length > 0 && (
        <form action={aDup} className="space-y-3 rounded-xl border border-borde p-4">
          <input type="hidden" name="id" value={id} />
          <h3 className="flex items-center gap-2 font-semibold"><CopyX className="size-4 text-aviso" aria-hidden="true" />Marcar como duplicado</h3>
          <div>
            <label htmlFor={`${uid}-d`} className="text-sm font-semibold">Coincide con</label>
            <select id={`${uid}-d`} name="destino" className="campo mt-1" required>
              {candidatos.map((c) => <option key={c.valor} value={c.valor}>{c.texto}</option>)}
            </select>
          </div>
          <BotonEnviar className="boton boton-secundario boton-chico" pendiente="Vinculando…">Vincular como duplicado</BotonEnviar>
        </form>
      )}

      {!cerrado && (
        <form action={aDes} className="space-y-3 rounded-xl border border-borde p-4">
          <input type="hidden" name="id" value={id} />
          <h3 className="flex items-center gap-2 font-semibold"><Trash2 className="size-4 text-tinta-2" aria-hidden="true" />Descartar</h3>
          <div>
            <label htmlFor={`${uid}-m`} className="text-sm font-semibold">Motivo <span aria-hidden="true" className="text-error">*</span></label>
            <input id={`${uid}-m`} name="motivo" className="campo mt-1" maxLength={300} required minLength={5}
              placeholder="Ej.: No se encontró evidencia en el sitio" aria-invalid={eDes.error ? true : undefined} />
          </div>
          <BotonEnviar className="boton boton-peligro boton-chico" pendiente="Descartando…">Descartar reporte</BotonEnviar>
        </form>
      )}
    </div>
  );
}
