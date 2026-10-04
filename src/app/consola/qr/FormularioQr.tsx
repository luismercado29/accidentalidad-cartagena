'use client';

import Link from 'next/link';
import { useActionState, useId, useMemo, useState } from 'react';

import { guardarPuntoQr, type EstadoQr } from '@/app/acciones/qr';
import { BotonEnviar, FocoEnError } from '@/components/formulario';
import { Mapa, type Capa } from '@/components/mapa/Mapa';
import { Aviso } from '@/components/ui';

type Punto = { id: number; codigo: string; nombre: string; lat: number; lng: number } | null;

export function FormularioQr({ punto }: { punto: Punto }) {
  const [estado, accion] = useActionState<EstadoQr, FormData>(guardarPuntoQr, {});
  const v = estado.valores ?? {};
  const err = estado.errores ?? {};
  const id = useId();
  const [lat, setLat] = useState(v.lat ?? (punto ? String(punto.lat) : ''));
  const [lng, setLng] = useState(v.lng ?? (punto ? String(punto.lng) : ''));
  const capas = useMemo<Capa[]>(() => {
    const a = Number(lat), b = Number(lng);
    return lat && lng && Number.isFinite(a) && Number.isFinite(b) ? [{ tipo: 'marcadores', items: [{ lat: a, lng: b, icono: 'qr', etiqueta: 'Ubicación del punto QR', color: '#2437C7' }] }] : [];
  }, [lat, lng]);

  const campo = (nombre: 'codigo' | 'nombre', etiqueta: string, ayuda: string, defecto: string, extra: object = {}) => (
    <div className="space-y-1">
      <label htmlFor={`${id}-${nombre}`} className="block font-semibold">{etiqueta} <span aria-hidden="true" className="text-error">*</span></label>
      <input id={`${id}-${nombre}`} name={nombre} className="campo" defaultValue={v[nombre] ?? defecto} required
        aria-invalid={err[nombre] ? true : undefined} aria-describedby={`${id}-${nombre}-a${err[nombre] ? ` ${id}-${nombre}-e` : ''}`} {...extra} />
      {err[nombre] && <p id={`${id}-${nombre}-e`} className="text-sm font-semibold text-error">{err[nombre]}</p>}
      <p id={`${id}-${nombre}-a`} className="text-sm text-tinta-2">{ayuda}</p>
    </div>
  );

  return (
    <form action={accion} className="space-y-4" noValidate key={punto?.id ?? 'nuevo'}>
      <FocoEnError errores={estado.errores} />
      {estado.ok && <Aviso tono="exito">{estado.ok} {punto && <Link href="/consola/qr" className="font-semibold underline">Crear otro</Link>}</Aviso>}
      <input type="hidden" name="id" value={punto?.id ?? ''} />
      {campo('codigo', 'Código', 'Formato QR-XXX. Va impreso en el afiche.', punto?.codigo ?? 'QR-', { maxLength: 15, className: 'campo font-mono uppercase' })}
      {campo('nombre', 'Nombre del lugar', 'Ej.: Paradero de la Av. Pedro de Heredia con calle 31.', punto?.nombre ?? '', { maxLength: 120 })}
      <div className="grid grid-cols-2 gap-3">
        {(['lat', 'lng'] as const).map((k) => (
          <div key={k} className="space-y-1">
            <label htmlFor={`${id}-${k}`} className="block font-semibold">{k === 'lat' ? 'Latitud' : 'Longitud'}</label>
            <input id={`${id}-${k}`} name={k} inputMode="decimal" className="campo font-mono text-sm" value={k === 'lat' ? lat : lng}
              onChange={(ev) => (k === 'lat' ? setLat : setLng)(ev.target.value)}
              aria-invalid={err[k] ? true : undefined} aria-describedby={err[k] ? `${id}-${k}-e` : undefined} />
            {err[k] && <p id={`${id}-${k}-e`} className="text-sm font-semibold text-error">{err[k]}</p>}
          </div>
        ))}
      </div>
      <p className="text-sm text-tinta-2">Haz clic en el mapa para tomar las coordenadas, o escríbelas.</p>
      <Mapa etiqueta="Mapa para ubicar el punto QR" alto="14rem" capas={capas} zoom={punto ? 16 : 12}
        centro={punto ? [punto.lat, punto.lng] : undefined}
        alClic={(a, b) => { setLat(a.toFixed(6)); setLng(b.toFixed(6)); }} />
      <BotonEnviar className="boton boton-primario" pendiente="Guardando…">{punto ? 'Guardar cambios' : 'Crear punto QR'}</BotonEnviar>
    </form>
  );
}
