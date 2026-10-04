'use client';

import { Link2, Plus, RefreshCw } from 'lucide-react';
import { useActionState, useId } from 'react';

import type { EstadoFormulario } from '@/app/acciones/cuenta';
import { agregarPublicacion, guardarFuente, leerFuentesAhora, vincularNoticia, type EstadoLectura } from '@/app/acciones/fuentes';
import { BotonEnviar, Campo, FocoEnError } from '@/components/formulario';
import { Aviso } from '@/components/ui';

export function BotonLeer() {
  const [estado, accion] = useActionState<EstadoLectura, FormData>(leerFuentesAhora, {});
  const nuevos = estado.resultados?.reduce((s, r) => s + r.nuevos, 0) ?? 0;
  const conError = estado.resultados?.filter((r) => r.error) ?? [];
  return (
    <form action={accion} className="flex flex-col items-end gap-2">
      <BotonEnviar className="boton boton-primario" pendiente="Leyendo fuentes…"><RefreshCw className="size-4" aria-hidden="true" />Leer fuentes ahora</BotonEnviar>
      <div role="status" aria-live="polite" className="max-w-sm text-right text-sm">
        {estado.error && <span className="text-error">{estado.error}</span>}
        {estado.resultados && (
          <span>
            {nuevos ? `${nuevos} noticias nuevas.` : 'Sin noticias nuevas.'}
            {conError.length > 0 && <span className="block text-error">Con error: {conError.map((r) => r.fuente).join(', ')}.</span>}
          </span>
        )}
      </div>
    </form>
  );
}

export function FormularioPublicacion() {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(agregarPublicacion, {});
  const id = useId();
  const err = estado.errores ?? {};
  return (
    <form action={accion} className="space-y-4" noValidate key={estado.ok}>
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
      <FocoEnError errores={estado.errores} />
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr_11rem]">
        <div>
          <label htmlFor={`${id}-red`} className="block font-semibold">Red o medio</label>
          <select id={`${id}-red`} name="red" defaultValue={estado.valores?.red ?? 'facebook'} className="campo mt-1" aria-invalid={err.red ? true : undefined}>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="x">X (Twitter)</option>
            <option value="tiktok">TikTok</option>
            <option value="prensa">Medio de prensa</option>
            <option value="otra">Otra</option>
          </select>
        </div>
        <Campo nombre="url" etiqueta="Enlace de la publicación" tipo="url" requerido error={err.url} valor={estado.valores?.url} placeholder="https://www.facebook.com/…" />
        <Campo nombre="fecha" etiqueta="Fecha" tipo="date" error={err.fecha} valor={estado.valores?.fecha} />
      </div>
      <Campo nombre="texto" etiqueta="Texto de la publicación" multilinea filas={4} requerido error={err.texto} valor={estado.valores?.texto} max={3000}
        ayuda="Pega el texto tal como aparece. Detectamos el barrio, la gravedad probable y la relevancia." />
      <BotonEnviar pendiente="Agregando…"><Plus className="size-4" aria-hidden="true" />Agregar publicación</BotonEnviar>
    </form>
  );
}

export function FormularioFuente() {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(guardarFuente, {});
  const err = estado.errores ?? {};
  return (
    <form action={accion} className="space-y-3" noValidate key={estado.ok}>
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
      {estado.ok && <Aviso tono="exito">{estado.ok}</Aviso>}
      <FocoEnError errores={estado.errores} />
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <Campo nombre="nombre" etiqueta="Nombre" requerido error={err.nombre} valor={estado.valores?.nombre} max={120} />
        <Campo nombre="url" etiqueta="URL del canal RSS o Atom" tipo="url" requerido error={err.url} valor={estado.valores?.url} placeholder="https://…/rss" />
        <BotonEnviar className="boton boton-secundario" pendiente="Guardando…"><Plus className="size-4" aria-hidden="true" />Agregar</BotonEnviar>
      </div>
    </form>
  );
}

export function VincularNoticia({ id }: { id: number }) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(vincularNoticia, {});
  const uid = useId();
  return (
    <form action={accion} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div>
        <label htmlFor={`${uid}-c`} className="block text-xs font-semibold text-tinta-2">Código del siniestro</label>
        <input id={`${uid}-c`} name="codigo" className="campo mt-0.5 min-h-9 w-44 py-1 font-mono text-sm" placeholder="SV-2026-000123" defaultValue={estado.valores?.codigo}
          aria-invalid={estado.errores?.codigo ? true : undefined} aria-describedby={`${uid}-m`} maxLength={30} />
      </div>
      <BotonEnviar className="boton boton-secundario boton-chico" pendiente="Vinculando…"><Link2 className="size-4" aria-hidden="true" />Vincular</BotonEnviar>
      <p id={`${uid}-m`} role="status" aria-live="polite" className={`w-full text-xs ${estado.error ? 'font-semibold text-error' : 'text-exito'}`}>{estado.error ?? estado.ok ?? ''}</p>
    </form>
  );
}
