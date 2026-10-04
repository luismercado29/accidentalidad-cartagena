'use client';

import {
  BellRing, Cctv, ChartColumn, Circle, CircleDot, ClipboardList, Construction, ExternalLink, FileText, Flame, Hexagon, Inbox, LayoutDashboard, Menu, MonitorPlay, Newspaper, QrCode, Radar, ScrollText, Settings, Siren, Sparkles, Truck, Upload, Users, X, type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { Logo } from '@/components/Logo';
import type { EnlaceConsola } from '@/lib/navegacion';

const ICONOS: Record<string, LucideIcon> = { BellRing, Cctv, ChartColumn, CircleDot, ClipboardList, Construction, FileText, Flame, Hexagon, Inbox, LayoutDashboard, MonitorPlay, Newspaper, QrCode, Radar, ScrollText, Settings, Siren, Sparkles, Truck, Upload, Users };

function IconoNav({ nombre }: { nombre: string }) {
  const I = ICONOS[nombre] ?? Circle;
  return <I className="size-[1.1rem] shrink-0" aria-hidden="true" />;
}

function Lista({ secciones, alNavegar }: { secciones: { titulo: string; enlaces: EnlaceConsola[] }[]; alNavegar?: () => void }) {
  const ruta = usePathname();
  const activo = (href: string) => (href === '/consola' ? ruta === href : ruta === href || ruta.startsWith(`${href}/`));
  return (
    <nav aria-label="Consola">
      {secciones.map((s) => (
        <div key={s.titulo} className="mt-5 first:mt-0">
          <h2 className="anotacion px-3 text-white/60">{s.titulo}</h2>
          <ul className="mt-1.5 space-y-0.5">
            {s.enlaces.map((e) => (
              <li key={e.href}>
                <Link href={e.href} onClick={alNavegar} aria-current={activo(e.href) ? 'page' : undefined}
                  className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.94rem] transition-colors ${activo(e.href) ? 'bg-senal font-semibold text-tinta' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}>
                  <IconoNav nombre={e.icono} />{e.texto}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

type Secciones = { titulo: string; enlaces: EnlaceConsola[] }[];

export function BarraLateral({ secciones }: { secciones: Secciones }) {
  return (
      <aside className="no-imprimir sobre-oscuro sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto bg-noche px-3 py-4 lg:flex">
        <Link href="/consola" className="mb-6 rounded-lg px-2" aria-label="Pulso Vial, consola"><Logo claro /></Link>
        <Lista secciones={secciones} />
        <Link href="/" className="mt-auto flex min-h-10 items-center gap-2 rounded-lg px-3 pt-6 text-sm text-white/70 hover:text-white">
          <ExternalLink className="size-4" aria-hidden="true" />Ver sitio público
        </Link>
      </aside>
  );
}

export function MenuMovil({ secciones }: { secciones: Secciones }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const ruta = usePathname();
  useEffect(() => { dialogo.current?.close(); }, [ruta]);
  return (
    <>
      <button type="button" className="boton boton-fantasma px-2 lg:hidden" aria-label="Abrir menú de la consola" aria-haspopup="dialog"
        onClick={() => dialogo.current?.showModal()}>
        <Menu className="size-6" aria-hidden="true" />
      </button>
      <dialog ref={dialogo} aria-label="Menú de la consola"
        className="sobre-oscuro m-0 h-dvh max-h-none w-[min(19rem,100vw)] bg-noche p-3 text-white backdrop:bg-noche/60"
        onClick={(ev) => { if (ev.target === dialogo.current) dialogo.current?.close(); }}>
        <div className="mb-4 flex items-center justify-between">
          <Logo claro />
          <button type="button" className="boton px-2 text-white hover:bg-white/10" onClick={() => dialogo.current?.close()} aria-label="Cerrar menú">
            <X className="size-6" aria-hidden="true" />
          </button>
        </div>
        <Lista secciones={secciones} alNavegar={() => dialogo.current?.close()} />
      </dialog>
    </>
  );
}
