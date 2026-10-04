'use client';

import { MapPin } from 'lucide-react';
import { startTransition, useActionState, useMemo, useState } from 'react';

import type { EstadoFormulario } from '@/app/acciones/cuenta';
import { guardarSiniestro } from '@/app/acciones/siniestros';
import { FocoEnError } from '@/components/formulario';
import { Mapa, type Capa } from '@/components/mapa/Mapa';
import { Aviso } from '@/components/ui';
import { CLASES, GRAVEDADES, VEHICULOS } from '@/db/esquema';
import { CLASE, COLOR_MAPA, GRAVEDAD, VEHICULO } from '@/lib/etiquetas';
import { BARRIOS, barrioMasCercano, CENTRO, coordenadas, dentroDeCartagena } from '@/lib/geo';

export type ValoresSiniestro = {
  id?: number; fecha: string; hora: string; lat: string; lng: string; direccion: string; barrio: string;
  gravedad: string; clase: string; vehiculos: string[]; heridos: string; fallecidos: string; clima: string;
  estadoVia: string; iluminacion: string; diaFestivo: boolean; causaProbable: string; descripcion: string; estado: string;
};

const CLIMAS = [['soleado', 'Soleado'], ['nublado', 'Nublado'], ['lluvia', 'Lluvia'], ['lluvia_fuerte', 'Lluvia fuerte']];
const VIAS = [['bueno', 'Buena'], ['regular', 'Regular'], ['malo', 'Mala'], ['mojada', 'Mojada'], ['obra', 'En obra']];
const LUCES = [['dia', 'De día'], ['amanecer_atardecer', 'Amanecer o atardecer'], ['noche_con_alumbrado', 'De noche, con alumbrado'], ['noche_sin_alumbrado', 'De noche, sin alumbrado']];
const CAUSAS = ['Exceso de velocidad', 'No respetar la señal de pare', 'Adelantar invadiendo carril', 'Distancia de seguimiento insuficiente', 'Giro indebido', 'Conducir en estado de embriaguez', 'Desobedecer el semáforo', 'Falta de precaución del peatón', 'Vía en mal estado', 'Maniobra imprudente de motociclista'];

function Error({ id, texto }: { id: string; texto?: string }) {
  return texto ? <p id={id} className="mt-1 text-sm font-semibold text-error">{texto}</p> : null;
}

export function FormularioSiniestro({ inicial, noticiaId, reporteId }: { inicial: ValoresSiniestro; noticiaId?: number; reporteId?: number }) {
  const [estado, accion, pendiente] = useActionState<EstadoFormulario, FormData>(guardarSiniestro, {});
  const v = estado.valores;
  const [lat, setLat] = useState(v?.lat ?? inicial.lat);
  const [lng, setLng] = useState(v?.lng ?? inicial.lng);
  const [barrio, setBarrio] = useState(v?.barrio ?? inicial.barrio);
  const [barrioEditado, setBarrioEditado] = useState(!!inicial.barrio);
  const [gravedad, setGravedad] = useState(v?.gravedad ?? inicial.gravedad);
  const [aviso, setAviso] = useState('');
  const err = estado.errores ?? {};
  const val = (k: keyof ValoresSiniestro) => (v?.[k] ?? String(inicial[k] ?? ''));
  const vehiculos = v ? (v.vehiculos ? v.vehiculos.split(',') : []) : inicial.vehiculos;

  const nLat = Number(lat), nLng = Number(lng);
  const ubicado = lat !== '' && lng !== '' && Number.isFinite(nLat) && Number.isFinite(nLng);
  const capas = useMemo<Capa[]>(() => (ubicado ? [{ tipo: 'puntos', items: [{ lat: nLat, lng: nLng, color: COLOR_MAPA[(gravedad || 'leve') as keyof typeof COLOR_MAPA] ?? '#2437C7', radio: 9 }] }] : []), [ubicado, nLat, nLng, gravedad]);

  function ubicar(la: number, ln: number) {
    setLat(la.toFixed(6));
    setLng(ln.toFixed(6));
    const b = barrioMasCercano(la, ln).nombre;
    if (!barrioEditado) setBarrio(b);
    setAviso(`Ubicación marcada: ${coordenadas(la, ln)}${barrioEditado ? '' : `, barrio sugerido ${b}`}.`);
  }

  const etiqueta = 'block font-semibold';
  const desc = (k: string) => (err[k] ? `e-${k}` : undefined);

  return (
    // Envio manual (sin action={...}): React no reinicia el formulario tras un error de validacion
    // y la persona no pierde lo que ya escribio.
    <form className="space-y-6" noValidate aria-busy={pendiente}
      onSubmit={(ev) => { ev.preventDefault(); const datos = new FormData(ev.currentTarget); startTransition(() => accion(datos)); }}>
      {estado.error && <div tabIndex={-1}><Aviso tono="error">{estado.error}</Aviso></div>}
      <FocoEnError errores={estado.errores ?? estado.error} />
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      {noticiaId && <input type="hidden" name="noticiaId" value={noticiaId} />}
      {reporteId && <input type="hidden" name="reporteId" value={reporteId} />}

      <fieldset className="tarjeta space-y-4 p-5">
        <legend className="sr-only">Cuándo</legend>
        <h2 className="text-lg font-bold">1. Cuándo ocurrió</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="s-fecha" className={etiqueta}>Fecha <span aria-hidden="true" className="text-error">*</span></label>
            <input id="s-fecha" name="fecha" type="date" required defaultValue={val('fecha')} className="campo mt-1" aria-invalid={err.fecha ? true : undefined} aria-describedby={desc('fecha')} min="1990-01-01" />
            <Error id="e-fecha" texto={err.fecha} />
          </div>
          <div>
            <label htmlFor="s-hora" className={etiqueta}>Hora (Cartagena) <span aria-hidden="true" className="text-error">*</span></label>
            <input id="s-hora" name="hora" type="time" required defaultValue={val('hora')} className="campo mt-1" aria-invalid={err.hora ? true : undefined} aria-describedby={desc('hora')} />
            <Error id="e-hora" texto={err.hora} />
          </div>
          <label className="flex items-center gap-3 self-end pb-3">
            <input type="checkbox" name="diaFestivo" defaultChecked={v ? v.diaFestivo === 'on' : inicial.diaFestivo} className="size-5 accent-marca" />
            <span className="font-semibold">Fue día festivo</span>
          </label>
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-4 p-5">
        <legend className="sr-only">Dónde</legend>
        <h2 className="text-lg font-bold">2. Dónde</h2>
        <p className="text-sm text-tinta-2">Haz clic en el mapa para marcar el punto exacto, o escribe las coordenadas.</p>
        <Mapa etiqueta="Mapa para marcar la ubicación del siniestro. Haz clic para ubicar el punto." alto="20rem" capas={capas}
          centro={ubicado ? [nLat, nLng] : CENTRO} zoom={ubicado ? 16 : 13} alClic={ubicar} />
        <p className="anotacion text-tinta-3" role="status" aria-live="polite">
          <MapPin className="mr-1 inline size-3.5" aria-hidden="true" />{ubicado ? coordenadas(nLat, nLng) : 'Sin ubicación'}{aviso && <span className="sr-only"> {aviso}</span>}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="s-lat" className={etiqueta}>Latitud <span aria-hidden="true" className="text-error">*</span></label>
            <input id="s-lat" name="lat" inputMode="decimal" required value={lat} onChange={(ev) => setLat(ev.target.value)}
              onBlur={() => { if (ubicado && dentroDeCartagena(nLat, nLng) && !barrioEditado) setBarrio(barrioMasCercano(nLat, nLng).nombre); }}
              className="campo mt-1 font-mono" aria-invalid={err.lat ? true : undefined} aria-describedby={desc('lat')} />
            <Error id="e-lat" texto={err.lat} />
          </div>
          <div>
            <label htmlFor="s-lng" className={etiqueta}>Longitud <span aria-hidden="true" className="text-error">*</span></label>
            <input id="s-lng" name="lng" inputMode="decimal" required value={lng} onChange={(ev) => setLng(ev.target.value)}
              onBlur={() => { if (ubicado && dentroDeCartagena(nLat, nLng) && !barrioEditado) setBarrio(barrioMasCercano(nLat, nLng).nombre); }}
              className="campo mt-1 font-mono" aria-invalid={err.lng ? true : undefined} aria-describedby={desc('lng')} />
            <Error id="e-lng" texto={err.lng} />
          </div>
          <div>
            <label htmlFor="s-barrio" className={etiqueta}>Barrio</label>
            <input id="s-barrio" name="barrio" list="lista-barrios" value={barrio} maxLength={120}
              onChange={(ev) => { setBarrio(ev.target.value); setBarrioEditado(ev.target.value !== ''); }} className="campo mt-1" aria-describedby="a-barrio" />
            <p id="a-barrio" className="mt-1 text-xs text-tinta-2">Se sugiere el más cercano al punto.</p>
            <datalist id="lista-barrios">{BARRIOS.map((b) => <option key={b.nombre} value={b.nombre} />)}</datalist>
          </div>
          <div>
            <label htmlFor="s-direccion" className={etiqueta}>Dirección o vía</label>
            <input id="s-direccion" name="direccion" defaultValue={val('direccion')} maxLength={200} className="campo mt-1" placeholder="Av. Pedro de Heredia con calle 49" />
          </div>
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-4 p-5">
        <legend className="sr-only">Qué pasó</legend>
        <h2 className="text-lg font-bold">3. Qué pasó</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="s-gravedad" className={etiqueta}>Gravedad <span aria-hidden="true" className="text-error">*</span></label>
            <select id="s-gravedad" name="gravedad" required defaultValue={val('gravedad')} onChange={(ev) => setGravedad(ev.target.value)} className="campo mt-1" aria-invalid={err.gravedad ? true : undefined} aria-describedby={desc('gravedad')}>
              <option value="" disabled>Elige…</option>
              {GRAVEDADES.map((g) => <option key={g} value={g}>{GRAVEDAD[g].texto}</option>)}
            </select>
            <Error id="e-gravedad" texto={err.gravedad} />
          </div>
          <div>
            <label htmlFor="s-clase" className={etiqueta}>Clase <span aria-hidden="true" className="text-error">*</span></label>
            <select id="s-clase" name="clase" required defaultValue={val('clase')} className="campo mt-1" aria-invalid={err.clase ? true : undefined} aria-describedby={desc('clase')}>
              {CLASES.map((c) => <option key={c} value={c}>{CLASE[c]}</option>)}
            </select>
            <Error id="e-clase" texto={err.clase} />
          </div>
          <div>
            <label htmlFor="s-heridos" className={etiqueta}>Personas heridas</label>
            <input id="s-heridos" name="heridos" type="number" min={0} max={99} defaultValue={val('heridos')} className="campo mt-1" aria-invalid={err.heridos ? true : undefined} aria-describedby={desc('heridos')} />
            <Error id="e-heridos" texto={err.heridos} />
          </div>
          <div>
            <label htmlFor="s-fallecidos" className={etiqueta}>Víctimas fatales</label>
            <input id="s-fallecidos" name="fallecidos" type="number" min={0} max={99} defaultValue={val('fallecidos')} className="campo mt-1" aria-invalid={err.fallecidos ? true : undefined} aria-describedby={desc('fallecidos')} />
            <Error id="e-fallecidos" texto={err.fallecidos} />
          </div>
        </div>
        <fieldset aria-describedby={desc('vehiculos')}>
          <legend className={etiqueta}>Vehículos y actores involucrados</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {VEHICULOS.map((x) => (
              <label key={x} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-borde-fuerte bg-superficie px-4 has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                <input type="checkbox" name="vehiculos" value={x} defaultChecked={vehiculos.includes(x)} className="size-4 accent-marca" />{VEHICULO[x]}
              </label>
            ))}
          </div>
          <Error id="e-vehiculos" texto={err.vehiculos} />
        </fieldset>
      </fieldset>

      <fieldset className="tarjeta space-y-4 p-5">
        <legend className="sr-only">Condiciones y causa</legend>
        <h2 className="text-lg font-bold">4. Condiciones y causa</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {([['clima', 'Clima', CLIMAS], ['estadoVia', 'Estado de la vía', VIAS], ['iluminacion', 'Iluminación', LUCES]] as const).map(([k, t, ops]) => (
            <div key={k}>
              <label htmlFor={`s-${k}`} className={etiqueta}>{t}</label>
              <select id={`s-${k}`} name={k} defaultValue={val(k)} className="campo mt-1">
                <option value="">Sin dato</option>
                {ops.map(([c, x]) => <option key={c} value={c}>{x}</option>)}
              </select>
            </div>
          ))}
          <div>
            <label htmlFor="s-causa" className={etiqueta}>Causa probable</label>
            <input id="s-causa" name="causaProbable" list="lista-causas" defaultValue={val('causaProbable')} maxLength={200} className="campo mt-1" />
            <datalist id="lista-causas">{CAUSAS.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        </div>
        <div>
          <label htmlFor="s-descripcion" className={etiqueta}>Descripción de los hechos</label>
          <textarea id="s-descripcion" name="descripcion" rows={4} maxLength={2000} defaultValue={val('descripcion')} className="campo mt-1" />
        </div>
      </fieldset>

      <fieldset className="tarjeta flex flex-wrap items-end justify-between gap-4 p-5">
        <legend className="sr-only">Estado del registro</legend>
        <div>
          <label htmlFor="s-estado" className={etiqueta}>Estado del registro</label>
          <select id="s-estado" name="estado" defaultValue={val('estado') || 'verificado'} className="campo mt-1 min-w-60">
            <option value="verificado">Verificado (cuenta en estadísticas)</option>
            <option value="pendiente">Pendiente de verificar</option>
            <option value="descartado">Descartado</option>
          </select>
        </div>
        <button type="submit" className="boton boton-primario" disabled={pendiente} aria-disabled={pendiente}>
          {pendiente ? 'Guardando…' : inicial.id ? 'Guardar cambios' : 'Registrar siniestro'}
        </button>
      </fieldset>
    </form>
  );
}
