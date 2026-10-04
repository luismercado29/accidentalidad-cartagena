import { redirect } from 'next/navigation';

import { esEquipo, usuarioActual } from '@/lib/sesion';

import { FormularioIngreso } from './FormularioIngreso';

export const metadata = { title: 'Ingreso del equipo' };

export default async function Ingresar({ searchParams }: { searchParams: Promise<{ siguiente?: string }> }) {
  const [u, sp] = await Promise.all([usuarioActual(), searchParams]);
  if (esEquipo(u)) redirect('/consola');
  return (
    <div className="contenedor grid gap-10 py-14 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:py-20">
      <div>
        <p className="anotacion text-tinta-3">Acceso restringido · Centro de gestión</p>
        <h1 className="titular mt-3">Ingreso del <span className="serif text-marca">equipo</span>.</h1>
        <p className="mt-5 max-w-lg text-lg text-tinta-2">
          Operación, supervisión y análisis de la siniestralidad vial. Si eres ciudadano y quieres reportar un siniestro,
          no necesitas cuenta: <a href="/reportar" className="font-semibold text-marca underline underline-offset-4">repórtalo aquí</a>.
        </p>
      </div>
      <div className="tarjeta p-6 sm:p-8">
        <FormularioIngreso siguiente={sp.siguiente} />
      </div>
    </div>
  );
}
