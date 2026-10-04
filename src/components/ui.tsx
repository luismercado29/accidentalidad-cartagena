import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import type { Gravedad } from '@/db/esquema';
import { GRAVEDAD, type Tono } from '@/lib/etiquetas';

const TONOS: Record<Tono, string> = {
  ok: 'bg-exito-suave text-exito',
  info: 'bg-marca-suave text-marca-oscura',
  aviso: 'bg-aviso-suave text-aviso-texto',
  peligro: 'bg-error-suave text-error',
  neutro: 'bg-hundido text-tinta-2',
};

/** Insignia de estado: el texto lleva el significado; el color solo lo refuerza. */
export function Insignia({ tono = 'neutro', children, punto = true }: { tono?: Tono; children: React.ReactNode; punto?: boolean }) {
  return (
    <span className={`insignia ${TONOS[tono]}`}>
      {punto && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function InsigniaGravedad({ gravedad, corta = true }: { gravedad: Gravedad; corta?: boolean }) {
  const g = GRAVEDAD[gravedad];
  return (
    <span className="insignia" style={{ background: g.fondo, color: g.color }}>
      <svg aria-hidden="true" viewBox="0 0 10 10" className="size-2.5">
        {gravedad === 'fatal' ? <rect x="1" y="1" width="8" height="8" fill="currentColor" transform="rotate(45 5 5)" />
          : gravedad === 'grave' ? <path d="M5 0.5 9.5 9H0.5Z" fill="currentColor" />
            : <circle cx="5" cy="5" r="4" fill="currentColor" />}
      </svg>
      {corta ? g.corto : g.texto}
    </span>
  );
}

export function Aviso({ tono = 'info', children }: { tono?: 'info' | 'exito' | 'error' | 'aviso'; children: React.ReactNode }) {
  const estilos = {
    info: 'border-marca/30 bg-marca-suave', exito: 'border-exito/30 bg-exito-suave',
    error: 'border-error/30 bg-error-suave', aviso: 'border-aviso/30 bg-aviso-suave',
  }[tono];
  return <div role={tono === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 ${estilos}`}>{children}</div>;
}

/** Encabezado de pagina de la consola. */
export function Encabezado({ titulo, destacado, descripcion, acciones, anotacion }: {
  titulo: string; destacado?: string; descripcion?: React.ReactNode; acciones?: React.ReactNode; anotacion?: string;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {anotacion && <p className="anotacion text-tinta-3">{anotacion}</p>}
        <h1 className="mt-1 text-3xl font-bold sm:text-4xl">
          {titulo}{destacado && <> <span className="serif text-marca">{destacado}</span></>}
        </h1>
        {descripcion && <p className="mt-2 max-w-3xl text-tinta-2">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
    </header>
  );
}

/** Indicador con cifra grande y variacion frente a un periodo de comparacion. */
export function Kpi({ etiqueta, valor, unidad, variacion, mejorSiBaja = true, detalle, icono: Icono, tono }: {
  etiqueta: string; valor: string | number; unidad?: string; variacion?: number | null; mejorSiBaja?: boolean;
  detalle?: React.ReactNode; icono?: LucideIcon; tono?: 'fatal' | 'grave' | 'normal';
}) {
  const bueno = variacion == null ? null : variacion === 0 ? null : mejorSiBaja ? variacion < 0 : variacion > 0;
  const Flecha = variacion == null || variacion === 0 ? Minus : variacion > 0 ? ArrowUpRight : ArrowDownRight;
  const color = tono === 'fatal' ? 'text-fatal' : tono === 'grave' ? 'text-error' : 'text-tinta';
  return (
    <div className="tarjeta flex flex-col gap-2 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-tinta-2">
        {Icono && <Icono className="size-4" aria-hidden="true" />}{etiqueta}
      </p>
      <p className={`cifra text-5xl ${color}`}>
        {typeof valor === 'number' ? valor.toLocaleString('es-CO') : valor}
        {unidad && <span className="ml-1 font-sans text-base font-semibold text-tinta-2">{unidad}</span>}
      </p>
      {variacion !== undefined && (
        <p className={`flex items-center gap-1 text-sm font-semibold ${bueno == null ? 'text-tinta-2' : bueno ? 'text-exito' : 'text-error'}`}>
          <Flecha className="size-4" aria-hidden="true" />
          {variacion == null ? 'Sin base de comparación' : `${variacion > 0 ? '+' : ''}${variacion} % vs. periodo anterior`}
        </p>
      )}
      {detalle && <div className="text-sm text-tinta-2">{detalle}</div>}
    </div>
  );
}

export function Vacio({ titulo, children, icono: Icono }: { titulo: string; children?: React.ReactNode; icono?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-borde-fuerte px-6 py-12 text-center">
      {Icono && <Icono className="mx-auto size-8 text-tinta-3" aria-hidden="true" />}
      <p className="mt-3 font-semibold">{titulo}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-tinta-2">{children}</div>}
    </div>
  );
}

/** Seccion con titulo dentro de una tarjeta. */
export function Panel({ titulo, descripcion, acciones, children, className = '' }: {
  titulo: string; descripcion?: React.ReactNode; acciones?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`tarjeta p-5 ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{titulo}</h2>
          {descripcion && <p className="text-sm text-tinta-2">{descripcion}</p>}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}

export const numero = (n: number, decimales = 0) => n.toLocaleString('es-CO', { maximumFractionDigits: decimales, minimumFractionDigits: decimales });
export const porcentaje = (parte: number, total: number) => (total ? `${numero((parte / total) * 100, 1)} %` : '—');
