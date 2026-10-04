'use client';

import { useActionState } from 'react';

import { ingresarAccion, type EstadoFormulario } from '@/app/acciones/cuenta';
import { BotonEnviar, Campo, FocoEnError } from '@/components/formulario';
import { Aviso } from '@/components/ui';

export function FormularioIngreso({ siguiente }: { siguiente?: string }) {
  const [estado, accion] = useActionState<EstadoFormulario, FormData>(ingresarAccion, {});
  return (
    <form action={accion} className="space-y-5" noValidate>
      <h2 className="text-2xl font-bold">Iniciar sesión</h2>
      {estado.error && <div tabIndex={-1}><Aviso tono="error">{estado.error}</Aviso></div>}
      <FocoEnError errores={estado.error} />
      <input type="hidden" name="siguiente" value={siguiente ?? ''} />
      <Campo nombre="usuario" etiqueta="Usuario o correo" requerido autoComplete="username" valor={estado.valores?.usuario} />
      <Campo nombre="clave" etiqueta="Contraseña" tipo="password" requerido autoComplete="current-password" />
      <BotonEnviar className="boton boton-primario w-full" pendiente="Verificando…">Ingresar</BotonEnviar>
      <p className="text-sm text-tinta-2">Las cuentas las crea la administración. Tras 5 intentos fallidos el acceso se bloquea 15 minutos.</p>
    </form>
  );
}
