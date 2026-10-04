'use client';

import { Crosshair, MapPin } from 'lucide-react';
import { useActionState, useId, useMemo, useState } from 'react';

import { enviarReporte, type EstadoReporte } from '@/app/acciones/reportes';
import { BotonEnviar, FocoEnError } from '@/components/formulario';
import { Mapa, type Capa } from '@/components/mapa/Mapa';
import { Aviso } from '@/components/ui';
import { BARRIOS, coordenadas, dentroDeCartagena } from '@/lib/geo';

const GRAVEDADES = [
  { valor: 'solo_danos', titulo: 'Solo daños', ayuda: 'Golpes en los vehículos, nadie lastimado.' },
  { valor: 'leve', titulo: 'Heridos leves', ayuda: 'Raspones o golpes; las personas se mueven por sí mismas.' },
  { valor: 'grave', titulo: 'Heridos graves', ayuda: 'Alguien no se puede mover, sangra mucho o está inconsciente.' },
  { valor: 'fatal', titulo: 'Posible víctima fatal', ayuda: 'Parece que alguien perdió la vida.' },
];
const VEHICULOS = [
  ['motocicleta', 'Moto'], ['automovil', 'Carro'], ['taxi', 'Taxi'], ['bus', 'Bus o buseta'], ['camion', 'Camión'],
  ['bicicleta', 'Bicicleta'], ['peaton', 'Peatón'], ['otro', 'Otro'],
] as const;

type Punto = { codigo: string; nombre: string; lat: number; lng: number } | null;

function Error({ id, texto }: { id: string; texto?: string }) {
  return texto ? <p id={id} className="text-sm font-semibold text-error">{texto}</p> : null;
}

export function FormularioReporte({ punto }: { punto: Punto }) {
  const [estado, accion] = useActionState<EstadoReporte, FormData>(enviarReporte, {});
  const v = estado.valores ?? {};
  const err = estado.errores ?? {};
  const id = useId();
  const inicial = v.lat && v.lng ? { lat: Number(v.lat), lng: Number(v.lng) } : punto ? { lat: punto.lat, lng: punto.lng } : null;
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(inicial);
  const [msgUbicacion, setMsgUbicacion] = useState('');
  const [barrio, setBarrio] = useState('');

  const capas = useMemo<Capa[]>(() => (pos ? [{ tipo: 'marcadores', items: [{ lat: pos.lat, lng: pos.lng, icono: 'reporte', etiqueta: 'Lugar del siniestro', color: '#B42318' }] }] : []), [pos]);

  function fijar(lat: number, lng: number, aviso: string) {
    if (!dentroDeCartagena(lat, lng)) { setMsgUbicacion('Ese punto está fuera de Cartagena. Marca el lugar dentro de la ciudad.'); return; }
    setPos({ lat, lng });
    setMsgUbicacion(aviso);
  }

  function usarMiUbicacion() {
    if (!navigator.geolocation) { setMsgUbicacion('Tu navegador no permite compartir la ubicación. Marca el lugar en el mapa o elige el barrio.'); return; }
    setMsgUbicacion('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (p) => fijar(p.coords.latitude, p.coords.longitude, 'Ubicación tomada de tu dispositivo.'),
      () => setMsgUbicacion('No pudimos obtener tu ubicación. Marca el lugar en el mapa o elige el barrio.'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  const marcados = new Set(Array.isArray(v.vehiculos) ? v.vehiculos : []);
  const leyenda = 'text-lg font-bold';

  return (
    <form action={accion} className="space-y-8" noValidate>
      <FocoEnError errores={estado.errores ?? estado.error} />
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
      {Object.keys(err).length > 0 && <Aviso tono="error">Revisa los campos marcados para poder enviar el reporte.</Aviso>}

      {/* Campo trampa para robots: oculto para personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
        <label>Sitio web <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label>
      </div>
      {punto && <input type="hidden" name="punto" value={punto.codigo} />}
      <input type="hidden" name="lat" value={pos?.lat ?? ''} />
      <input type="hidden" name="lng" value={pos?.lng ?? ''} />

      <fieldset className="tarjeta space-y-4 p-5 sm:p-6">
        <legend className="sr-only">1. ¿Dónde ocurrió?</legend>
        <p className={leyenda} aria-hidden="true"><span className="anotacion mr-2 text-tinta-3">01</span>¿Dónde ocurrió?</p>
        {punto && <Aviso tono="info">Reporte desde el código QR de <strong>{punto.nombre}</strong>. Ajusta el punto si el siniestro fue en otro lugar.</Aviso>}
        <p className="text-tinta-2">Toca el mapa en el lugar exacto, usa tu ubicación o elige el barrio.</p>
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" onClick={usarMiUbicacion} className="boton boton-secundario"><Crosshair className="size-4" aria-hidden="true" />Usar mi ubicación</button>
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={`${id}-barrio`} className="block text-sm font-semibold">O elige el barrio o sector</label>
            <select id={`${id}-barrio`} className="campo mt-1" value={barrio}
              onChange={(ev) => { setBarrio(ev.target.value); const b = BARRIOS.find((x) => x.nombre === ev.target.value); if (b) fijar(b.lat, b.lng, `Ubicación aproximada: ${b.nombre}. Si puedes, ajústala en el mapa.`); }}>
              <option value="">Selecciona…</option>
              {[...BARRIOS].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((b) => <option key={b.nombre} value={b.nombre}>{b.nombre}</option>)}
            </select>
          </div>
        </div>
        <Mapa etiqueta="Mapa para marcar el lugar del siniestro. Haz clic en el lugar exacto." alto="20rem" capas={capas}
          centro={inicial ? [inicial.lat, inicial.lng] : undefined} zoom={inicial ? 16 : 13}
          alClic={(lat, lng) => fijar(lat, lng, 'Lugar marcado en el mapa.')} />
        <div className="space-y-1">
          <label htmlFor={`${id}-coord`} className="flex items-center gap-1.5 text-sm font-semibold"><MapPin className="size-4" aria-hidden="true" />Lugar marcado</label>
          <input id={`${id}-coord`} readOnly className="campo bg-hundido font-mono text-sm" value={pos ? coordenadas(pos.lat, pos.lng) : 'Aún no has marcado el lugar'}
            aria-invalid={err.lat ? true : undefined} aria-describedby={err.lat ? `${id}-coord-error` : undefined} />
          <Error id={`${id}-coord-error`} texto={err.lat} />
          <p role="status" aria-live="polite" className="text-sm text-tinta-2">{msgUbicacion}</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${id}-dir`} className="block font-semibold">Dirección o punto de referencia <span className="font-normal text-tinta-2">(opcional)</span></label>
          <input id={`${id}-dir`} name="direccion" className="campo" maxLength={200} defaultValue={String(v.direccion ?? '')}
            placeholder="Ej.: Av. Pedro de Heredia frente a la estación" aria-invalid={err.direccion ? true : undefined} aria-describedby={err.direccion ? `${id}-dir-e` : undefined} />
          <Error id={`${id}-dir-e`} texto={err.direccion} />
        </div>
      </fieldset>

      <fieldset className="tarjeta space-y-5 p-5 sm:p-6">
        <legend className="sr-only">2. ¿Qué pasó?</legend>
        <p className={leyenda} aria-hidden="true"><span className="anotacion mr-2 text-tinta-3">02</span>¿Qué pasó?</p>

        <div className="space-y-1.5">
          <label htmlFor={`${id}-desc`} className="block font-semibold">Describe lo que viste <span aria-hidden="true" className="text-error">*</span></label>
          <textarea id={`${id}-desc`} name="descripcion" rows={4} maxLength={1000} required className="campo" defaultValue={String(v.descripcion ?? '')}
            placeholder="Ej.: Una moto chocó con un taxi en el semáforo; el motociclista está en el piso."
            aria-invalid={err.descripcion ? true : undefined} aria-describedby={`${id}-desc-a${err.descripcion ? ` ${id}-desc-e` : ''}`} />
          <Error id={`${id}-desc-e`} texto={err.descripcion} />
          <p id={`${id}-desc-a`} className="text-sm text-tinta-2">No escribas placas ni nombres de las personas involucradas.</p>
        </div>

        <fieldset aria-describedby={err.gravedad ? `${id}-g-e` : undefined}>
          <legend className="font-semibold">¿Qué tan grave parece? <span aria-hidden="true" className="text-error">*</span></legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {GRAVEDADES.map((g) => (
              <label key={g.valor} className="flex cursor-pointer gap-3 rounded-xl border-[1.5px] border-borde-fuerte p-3 has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
                <input type="radio" name="gravedad" value={g.valor} defaultChecked={v.gravedad === g.valor} className="mt-1 size-5 accent-marca"
                  aria-invalid={err.gravedad ? true : undefined} />
                <span><span className="block font-semibold">{g.titulo}</span><span className="block text-sm text-tinta-2">{g.ayuda}</span></span>
              </label>
            ))}
          </div>
          <Error id={`${id}-g-e`} texto={err.gravedad} />
        </fieldset>

        <fieldset aria-describedby={err.heridos ? `${id}-h-e` : undefined}>
          <legend className="font-semibold">¿Hay personas heridas? <span aria-hidden="true" className="text-error">*</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {[['si', 'Sí'], ['no', 'No'], ['no_se', 'No sé']].map(([valor, texto]) => (
              <label key={valor} className="boton boton-secundario cursor-pointer has-[:checked]:bg-marca has-[:checked]:text-white">
                <input type="radio" name="heridos" value={valor} defaultChecked={v.heridos === valor} className="sr-only" aria-invalid={err.heridos ? true : undefined} />
                {texto}
              </label>
            ))}
          </div>
          <Error id={`${id}-h-e`} texto={err.heridos} />
        </fieldset>

        <fieldset>
          <legend className="font-semibold">¿Quiénes estuvieron involucrados? <span className="font-normal text-tinta-2">(marca todos los que apliquen)</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {VEHICULOS.map(([valor, texto]) => (
              <label key={valor} className="boton boton-secundario boton-chico min-h-11 cursor-pointer has-[:checked]:bg-noche has-[:checked]:text-white">
                <input type="checkbox" name="vehiculos" value={valor} defaultChecked={marcados.has(valor)} className="size-4 accent-senal" />
                {texto}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="tarjeta space-y-4 p-5 sm:p-6">
        <legend className="sr-only">3. Contacto (opcional)</legend>
        <p className={leyenda} aria-hidden="true"><span className="anotacion mr-2 text-tinta-3">03</span>Contacto <span className="font-normal text-tinta-2">(opcional)</span></p>
        <p className="text-tinta-2">Solo si quieres que te llamemos para ampliar la información. Puedes reportar de forma anónima.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${id}-nom`} className="block font-semibold">Nombre</label>
            <input id={`${id}-nom`} name="contactoNombre" className="campo" maxLength={80} autoComplete="name" defaultValue={String(v.contactoNombre ?? '')}
              aria-invalid={err.contactoNombre ? true : undefined} aria-describedby={err.contactoNombre ? `${id}-nom-e` : undefined} />
            <Error id={`${id}-nom-e`} texto={err.contactoNombre} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-tel`} className="block font-semibold">Teléfono</label>
            <input id={`${id}-tel`} name="contactoTelefono" type="tel" className="campo" maxLength={20} autoComplete="tel" inputMode="tel" defaultValue={String(v.contactoTelefono ?? '')}
              aria-invalid={err.contactoTelefono ? true : undefined} aria-describedby={err.contactoTelefono ? `${id}-tel-e` : undefined} />
            <Error id={`${id}-tel-e`} texto={err.contactoTelefono} />
          </div>
        </div>
        <div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="autoriza" defaultChecked={v.autoriza === 'si'} className="mt-1 size-5 accent-marca"
              aria-invalid={err.autoriza ? true : undefined} aria-describedby={err.autoriza ? `${id}-aut-e` : undefined} />
            <span className="text-sm">Autorizo el uso de mis datos de contacto solo para gestionar este reporte, según la <a href="/privacidad" className="font-semibold text-marca underline underline-offset-2">política de tratamiento de datos</a> (Ley 1581 de 2012).</span>
          </label>
          <Error id={`${id}-aut-e`} texto={err.autoriza} />
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <BotonEnviar className="boton boton-senal min-h-[52px] px-8 text-lg" pendiente="Enviando reporte…">Enviar reporte</BotonEnviar>
        <p className="text-sm text-tinta-2">Recibirás un código para seguir tu reporte.</p>
      </div>
    </form>
  );
}
