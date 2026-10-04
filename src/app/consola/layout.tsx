import { LogOut } from 'lucide-react';
import { cookies } from 'next/headers';
import Link from 'next/link';

import { cerrarSesionAccion } from '@/app/acciones/cuenta';
import { BarraLateral, MenuMovil } from '@/components/consola/BarraLateral';
import { Campana } from '@/components/consola/Campana';
import { PanelAccesibilidad } from '@/components/PanelAccesibilidad';
import { COOKIE_ACCESIBILIDAD, leerCookie, normalizarPreferencias } from '@/lib/accesibilidad';
import { ROL } from '@/lib/etiquetas';
import { SECCIONES_CONSOLA } from '@/lib/navegacion';
import { puede, requerirRol } from '@/lib/sesion';

export const metadata = { title: { default: 'Consola', template: '%s · Consola · Pulso Vial' }, robots: { index: false } };

export default async function LayoutConsola({ children }: { children: React.ReactNode }) {
  const usuario = await requerirRol();
  const almacen = await cookies();
  const preferencias = Object.keys(usuario.accesibilidad).length
    ? normalizarPreferencias(usuario.accesibilidad)
    : leerCookie(almacen.get(COOKIE_ACCESIBILIDAD)?.value);
  // Solo se muestran las secciones que el rol puede usar.
  const secciones = SECCIONES_CONSOLA
    .map((s) => ({ ...s, enlaces: s.enlaces.filter((e) => e.permiso === 'equipo' || puede(usuario, e.permiso)) }))
    .filter((s) => s.enlaces.length);
  const iniciales = usuario.nombre.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex min-h-dvh bg-papel">
      <BarraLateral secciones={secciones} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-imprimir sticky top-0 z-[500] flex h-16 items-center gap-2 border-b border-borde bg-papel/90 px-3 backdrop-blur-md sm:px-6">
          <div className="lg:hidden"><MenuMovil secciones={secciones} /></div>
          <p className="anotacion hidden text-tinta-3 sm:block"><span className="latido mr-2 inline-block size-2 rounded-full bg-exito align-middle" aria-hidden="true" />Centro de gestión · Cartagena</p>
          <div className="ml-auto flex items-center gap-1">
            <Campana />
            <PanelAccesibilidad inicial={preferencias} compacto />
            <div className="ml-1 flex items-center gap-2 border-l border-borde pl-3">
              <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-noche text-sm font-bold text-senal">{iniciales}</span>
              <span className="hidden text-sm leading-tight md:block">
                <span className="block font-semibold">{usuario.nombre}</span>
                <span className="block text-tinta-2">{ROL[usuario.rol]}</span>
              </span>
              <form action={cerrarSesionAccion}>
                <button type="submit" className="boton boton-fantasma px-2.5" aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut className="size-5" aria-hidden="true" />
                </button>
              </form>
            </div>
          </div>
        </header>
        <main id="contenido" tabIndex={-1} className="flex-1 px-3 py-6 outline-none sm:px-6 lg:px-8">{children}</main>
        <footer className="no-imprimir border-t border-borde px-6 py-4 text-xs text-tinta-3">
          Pulso Vial · <Link href="/privacidad" className="underline">Tratamiento de datos</Link> · Iniciativa independiente; no representa a ninguna entidad oficial.
        </footer>
      </div>
    </div>
  );
}
