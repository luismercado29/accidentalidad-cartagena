'use client';

import { Copy, KeyRound } from 'lucide-react';
import { useActionState, useState } from 'react';

import { crearUsuario, restablecerClave, type EstadoClave } from '@/app/acciones/administracion';
import { BotonEnviar, Campo, FocoEnError } from '@/components/formulario';
import { Aviso } from '@/components/ui';
import { ROL } from '@/lib/etiquetas';

/** Muestra la contrasena temporal una sola vez (no se guarda en ningun lado legible). */
function ClaveUnaVez({ usuario, clave }: { usuario: string; clave: string }) {
  const [copiada, setCopiada] = useState(false);
  return (
    <div role="status" className="rounded-xl border border-exito/30 bg-exito-suave p-4">
      <p className="font-semibold">Contraseña temporal de <span className="font-mono">{usuario}</span></p>
      <p className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-white px-3 py-1.5 font-mono text-lg tracking-wide">{clave}</code>
        <button type="button" className="boton boton-secundario boton-chico"
          onClick={async () => { try { await navigator.clipboard.writeText(clave); setCopiada(true); } catch { setCopiada(false); } }}>
          <Copy className="size-4" aria-hidden="true" />{copiada ? 'Copiada' : 'Copiar'}
        </button>
      </p>
      <p className="mt-2 text-sm text-tinta-2">Entrégala por un canal seguro. No se volverá a mostrar: si se pierde, restablécela de nuevo.</p>
    </div>
  );
}

export function FormularioNuevoUsuario() {
  const [estado, accion] = useActionState<EstadoClave, FormData>(crearUsuario, {});
  return (
    <form action={accion} className="space-y-4" noValidate>
      <FocoEnError errores={estado.errores} />
      {estado.clave && estado.usuario && <ClaveUnaVez usuario={estado.usuario} clave={estado.clave} />}
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo nombre="nombre" etiqueta="Nombre completo" requerido error={estado.errores?.nombre} valor={estado.valores?.nombre} autoComplete="off" />
        <Campo nombre="usuario" etiqueta="Usuario" requerido error={estado.errores?.usuario} valor={estado.valores?.usuario} ayuda="Para ingresar. Ej.: ana.perez" autoComplete="off" />
        <Campo nombre="email" etiqueta="Correo" tipo="email" requerido error={estado.errores?.email} valor={estado.valores?.email} autoComplete="off" />
        <div className="space-y-1.5">
          <label htmlFor="nu-rol" className="block font-semibold">Rol</label>
          <select id="nu-rol" name="rol" className="campo" defaultValue={estado.valores?.rol ?? 'operador'}>
            {Object.entries(ROL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <BotonEnviar pendiente="Creando…">Crear cuenta</BotonEnviar>
    </form>
  );
}

export function BotonRestablecer({ id, usuario }: { id: number; usuario: string }) {
  const [estado, accion] = useActionState<EstadoClave, FormData>(restablecerClave, {});
  return (
    <div>
      <form action={accion}>
        <input type="hidden" name="id" value={id} />
        <BotonEnviar className="boton boton-fantasma boton-chico" pendiente="Generando…">
          <KeyRound className="size-4" aria-hidden="true" />Restablecer<span className="sr-only"> la contraseña de {usuario}</span>
        </BotonEnviar>
      </form>
      {estado.clave && estado.usuario && <div className="mt-2 max-w-sm"><ClaveUnaVez usuario={estado.usuario} clave={estado.clave} /></div>}
      {estado.error && <p className="text-sm text-error">{estado.error}</p>}
    </div>
  );
}
