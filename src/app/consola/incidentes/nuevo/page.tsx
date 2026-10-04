import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Encabezado } from '@/components/ui';
import { PERMISOS, requerirRol } from '@/lib/sesion';

import { FormNuevoIncidente } from './FormNuevoIncidente';

export const metadata = { title: 'Nuevo incidente' };

export default async function NuevoIncidente() {
  await requerirRol(PERMISOS.operar);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/consola/incidentes" className="inline-flex items-center gap-1.5 text-sm font-semibold text-marca hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" />Volver a incidentes
      </Link>
      <Encabezado anotacion="Operación" titulo="Nuevo" destacado="incidente"
        descripcion="Abre un incidente cuando llega un aviso por radio, línea de emergencias o una cámara. La prioridad define el tiempo máximo de llegada." />
      <FormNuevoIncidente />
    </div>
  );
}
