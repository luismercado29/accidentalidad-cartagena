import { LayoutDashboard, Menu, Siren } from 'lucide-react';
import Link from 'next/link';

import type { PreferenciasAccesibilidad } from '@/db/esquema';
import { ENLACES_PUBLICOS } from '@/lib/navegacion';
import { esEquipo, type UsuarioSesion } from '@/lib/sesion';

import { Logo } from './Logo';
import { PanelAccesibilidad } from './PanelAccesibilidad';

/** Cabecera publica. En movil el menu es un <details> nativo: funciona sin JavaScript. */
export function Cabecera({ usuario, preferencias }: { usuario: UsuarioSesion | null; preferencias: PreferenciasAccesibilidad }) {
  return (
    <header className="sticky top-0 z-[500] border-b border-borde bg-papel/90 backdrop-blur-md">
      <div className="contenedor flex h-[4.25rem] items-center gap-2">
        <Link href="/" className="shrink-0 rounded-lg" aria-label="Pulso Vial, inicio"><Logo /></Link>

        <nav aria-label="Principal" className="ml-6 hidden lg:block">
          <ul className="flex items-center gap-1">
            {ENLACES_PUBLICOS.map((e) => (
              <li key={e.href}><Link href={e.href} className="boton boton-fantasma px-3 text-[0.95rem]">{e.texto}</Link></li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <PanelAccesibilidad inicial={preferencias} />
          {esEquipo(usuario) ? (
            <Link href="/consola" className="boton boton-secundario max-sm:hidden"><LayoutDashboard className="size-4" aria-hidden="true" />Consola</Link>
          ) : !usuario ? (
            <Link href="/ingresar" className="boton boton-fantasma max-sm:hidden">Ingresar</Link>
          ) : null}
          <Link href="/reportar" className="boton boton-senal max-sm:px-3.5">
            <Siren className="size-4" aria-hidden="true" />Reportar<span className="max-sm:sr-only"> siniestro</span>
          </Link>
          <details className="relative lg:hidden">
            <summary className="boton boton-fantasma list-none px-2 [&::-webkit-details-marker]:hidden" aria-label="Menú">
              <Menu className="size-6" aria-hidden="true" />
            </summary>
            <nav aria-label="Principal (móvil)" className="tarjeta absolute right-0 top-full mt-2 w-64 p-2 shadow-elevada">
              <ul>
                {[...ENLACES_PUBLICOS, ...(esEquipo(usuario) ? [{ href: '/consola', texto: 'Consola del equipo' }] : usuario ? [] : [{ href: '/ingresar', texto: 'Ingresar' }]), { href: '/seguimiento', texto: 'Seguir mi reporte' }].map((e) => (
                  <li key={e.href}><Link href={e.href} className="flex min-h-11 items-center rounded-lg px-3 hover:bg-marca-suave">{e.texto}</Link></li>
                ))}
              </ul>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
