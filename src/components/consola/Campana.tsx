'use client';

import { Bell, BellRing, CircleAlert, FileWarning, Info, Siren } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

type Notificacion = { id: number; tipo: string; titulo: string; mensaje: string; enlace: string | null; leida: boolean; creado: string };

const ICONO = { alerta: CircleAlert, incidente: Siren, reporte: FileWarning, info: Info, sistema: Info } as const;

function hace(fecha: string) {
  const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} d`;
}

/** Campana de avisos: consulta cada 30 s y anuncia los nuevos a los lectores de pantalla. */
export function Campana() {
  const [datos, setDatos] = useState<{ noLeidas: number; lista: Notificacion[] }>({ noLeidas: 0, lista: [] });
  const [abierto, setAbierto] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  const ultimo = useRef<number | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const id = useId();

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/notificaciones', { cache: 'no-store' });
      if (!r.ok) return;
      const d = await r.json();
      const masNueva = d.lista[0]?.id ?? null;
      if (ultimo.current != null && masNueva != null && masNueva > ultimo.current) {
        setAnuncio(`Nuevo aviso: ${d.lista[0].titulo}`);
        router.refresh(); // las paginas abiertas muestran lo nuevo sin recargar
      }
      ultimo.current = masNueva;
      setDatos(d);
    } catch { /* sin conexion: se reintenta en el siguiente ciclo */ }
  }, [router]);

  useEffect(() => {
    void cargar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void cargar(); }, 30_000);
    return () => clearInterval(t);
  }, [cargar]);

  useEffect(() => {
    if (!abierto) return;
    const tecla = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setAbierto(false); boton.current?.focus(); } };
    const fuera = (ev: MouseEvent) => { if (!caja.current?.contains(ev.target as Node) && !boton.current?.contains(ev.target as Node)) setAbierto(false); };
    document.addEventListener('keydown', tecla);
    document.addEventListener('mousedown', fuera);
    return () => { document.removeEventListener('keydown', tecla); document.removeEventListener('mousedown', fuera); };
  }, [abierto]);

  async function marcarLeidas() {
    await fetch('/api/notificaciones', { method: 'POST' });
    setDatos((d) => ({ noLeidas: 0, lista: d.lista.map((n) => ({ ...n, leida: true })) }));
  }

  const Icono = datos.noLeidas ? BellRing : Bell;
  return (
    <div className="relative">
      <button ref={boton} type="button" className="boton boton-fantasma relative px-2.5" aria-expanded={abierto} aria-controls={id}
        onClick={() => setAbierto((v) => !v)}>
        <Icono className="size-5" aria-hidden="true" />
        <span className="sr-only">Avisos{datos.noLeidas ? `: ${datos.noLeidas} sin leer` : ''}</span>
        {datos.noLeidas > 0 && (
          <span aria-hidden="true" className="absolute right-0.5 top-0.5 grid min-w-5 place-items-center rounded-full bg-error px-1 text-[11px] font-bold text-white">
            {datos.noLeidas > 99 ? '99+' : datos.noLeidas}
          </span>
        )}
      </button>
      <div ref={caja} id={id} hidden={!abierto} className="tarjeta absolute right-0 top-full z-[600] mt-2 w-[min(24rem,calc(100vw-1.5rem))] shadow-elevada">
        <div className="flex items-center justify-between border-b border-borde px-4 py-3">
          <h2 className="font-bold">Avisos</h2>
          {datos.noLeidas > 0 && <button type="button" className="text-sm font-semibold text-marca hover:underline" onClick={marcarLeidas}>Marcar como leídos</button>}
        </div>
        <ul className="max-h-[60dvh] divide-y divide-borde overflow-y-auto">
          {datos.lista.length === 0 && <li className="px-4 py-6 text-center text-tinta-2">Sin avisos por ahora.</li>}
          {datos.lista.map((n) => {
            const I = ICONO[n.tipo as keyof typeof ICONO] ?? Info;
            const cuerpo = (
              <>
                <I className={`mt-0.5 size-5 shrink-0 ${n.tipo === 'alerta' || n.tipo === 'incidente' ? 'text-error' : 'text-marca'}`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className={`block ${n.leida ? 'font-medium' : 'font-bold'}`}>{n.titulo}{!n.leida && <span className="sr-only"> (sin leer)</span>}</span>
                  <span className="block truncate text-sm text-tinta-2">{n.mensaje}</span>
                  <span className="anotacion text-tinta-3">{hace(n.creado)}</span>
                </span>
              </>
            );
            return (
              <li key={n.id}>
                {n.enlace ? <Link href={n.enlace} onClick={() => setAbierto(false)} className="flex gap-3 px-4 py-3 hover:bg-hundido">{cuerpo}</Link>
                  : <div className="flex gap-3 px-4 py-3">{cuerpo}</div>}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{anuncio}</p>
    </div>
  );
}
