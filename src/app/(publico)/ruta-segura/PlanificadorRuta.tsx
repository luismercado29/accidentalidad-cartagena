'use client';

import { Bike, Car, Crosshair, LocateFixed, MapPin, Navigation, Route, Search, ShieldCheck, TriangleAlert, Zap } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { Mapa, type Capa } from '@/components/mapa/Mapa';
import { dentroDeCartagena } from '@/lib/geo';

type Lugar = { nombre: string; detalle: string; lat: number; lng: number };
type Nivel = 'bajo' | 'medio' | 'alto';
type Ruta = {
  id: number; distanciaM: number; duracionS: number; indice: number; nivel: Nivel; siniestrosCerca: number; fatalesCerca: number;
  motosCerca: number | null; tramos: { nivel: Nivel; coords: [number, number][] }[]; focos: { lat: number; lng: number; riesgo: number; barrio?: string | null }[]; coords: [number, number][];
};
type Respuesta = { proveedor: string; salida: string; modo: 'auto' | 'moto'; recomendada: number | null; masRapida: number | null; historico: number; rutas: Ruta[] };

const NIVEL: Record<Nivel, { texto: string; color: string; clase: string; trazo: { grosor: number; discontinua: boolean } }> = {
  bajo: { texto: 'Riesgo bajo', color: '#15803D', clase: 'bg-exito-suave text-exito', trazo: { grosor: 5, discontinua: false } },
  medio: { texto: 'Riesgo medio', color: '#C98A00', clase: 'bg-aviso-suave text-aviso-texto', trazo: { grosor: 6, discontinua: true } },
  alto: { texto: 'Riesgo alto', color: '#B42318', clase: 'bg-error-suave text-error', trazo: { grosor: 9, discontinua: false } },
};

const km = (m: number) => `${(m / 1000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} km`;
const min = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

function ahoraLocal() {
  const d = new Date(Date.now() - 5 * 3_600_000);
  return d.toISOString().slice(0, 16);
}

function Buscador({ etiqueta, valor, alElegir, conUbicacion }: { etiqueta: string; valor: Lugar | null; alElegir: (l: Lugar | null) => void; conUbicacion?: boolean }) {
  const id = useId();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<Lugar[] | null>(null);
  const [estado, setEstado] = useState('');
  const [cargando, setCargando] = useState(false);
  const lista = useRef<HTMLUListElement>(null);

  async function buscar() {
    if (texto.trim().length < 3) { setEstado('Escribe al menos 3 letras.'); return; }
    setCargando(true);
    setEstado('Buscando…');
    try {
      const r = await fetch(`/api/geocodificar?q=${encodeURIComponent(texto.trim())}`);
      const d = await r.json() as { lugares: Lugar[]; aviso?: string; error?: string };
      setResultados(d.lugares ?? []);
      setEstado(d.error ?? d.aviso ?? (d.lugares?.length ? `${d.lugares.length} resultados. Elige uno.` : 'Sin resultados en Cartagena. Prueba con otro nombre o marca el punto en el mapa.'));
      setTimeout(() => lista.current?.querySelector('button')?.focus(), 0);
    } catch {
      setEstado('No se pudo buscar. Revisa tu conexión o marca el punto en el mapa.');
    } finally {
      setCargando(false);
    }
  }

  function ubicarme() {
    if (!navigator.geolocation) { setEstado('Tu navegador no permite obtener la ubicación.'); return; }
    setEstado('Obteniendo tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (!dentroDeCartagena(lat, lng)) { setEstado('Tu ubicación está fuera de Cartagena. Busca una dirección o marca el punto en el mapa.'); return; }
        alElegir({ nombre: 'Mi ubicación', detalle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng });
        setEstado('Ubicación fijada como origen.');
      },
      () => setEstado('No se pudo obtener tu ubicación (permiso denegado o sin señal).'),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="font-semibold">{etiqueta}</label>
      {valor ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-borde-fuerte bg-superficie px-3 py-2">
          <span className="min-w-0"><span className="block truncate font-semibold">{valor.nombre}</span><span className="block truncate text-sm text-tinta-2">{valor.detalle}</span></span>
          <button type="button" className="boton boton-fantasma boton-chico" onClick={() => { alElegir(null); setResultados(null); }}>Cambiar<span className="sr-only"> {etiqueta.toLowerCase()}</span></button>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input id={id} className="campo" value={texto} placeholder="Barrio, dirección o lugar" autoComplete="off"
              onChange={(ev) => setTexto(ev.target.value)} onKeyDown={(ev) => { if (ev.key === 'Enter') { ev.preventDefault(); void buscar(); } }} />
            <button type="button" className="boton boton-secundario px-3" onClick={() => void buscar()} disabled={cargando} aria-label={`Buscar ${etiqueta.toLowerCase()}`}>
              <Search className="size-5" aria-hidden="true" />
            </button>
          </div>
          {conUbicacion && (
            <button type="button" className="flex min-h-10 items-center gap-2 text-sm font-semibold text-marca hover:underline" onClick={ubicarme}>
              <LocateFixed className="size-4" aria-hidden="true" />Usar mi ubicación
            </button>
          )}
          {resultados && resultados.length > 0 && (
            <ul ref={lista} className="max-h-60 divide-y divide-borde overflow-y-auto rounded-xl border border-borde bg-superficie" aria-label={`Resultados para ${etiqueta.toLowerCase()}`}>
              {resultados.map((l, i) => (
                <li key={`${l.lat},${l.lng},${i}`}>
                  <button type="button" className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-marca-suave" onClick={() => { alElegir(l); setResultados(null); setTexto(''); setEstado(`${etiqueta}: ${l.nombre}`); }}>
                    <MapPin className="mt-0.5 size-4 shrink-0 text-tinta-3" aria-hidden="true" />
                    <span><span className="block font-medium">{l.nombre}</span><span className="block text-sm text-tinta-2">{l.detalle}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <p className="text-sm text-tinta-2" role="status" aria-live="polite">{estado}</p>
    </div>
  );
}

export function PlanificadorRuta() {
  const [origen, setOrigen] = useState<Lugar | null>(null);
  const [destino, setDestino] = useState<Lugar | null>(null);
  const [fijar, setFijar] = useState<'origen' | 'destino'>('origen');
  const [salida, setSalida] = useState(ahoraLocal);
  const [modo, setModo] = useState<'auto' | 'moto'>('auto');
  const [resp, setResp] = useState<Respuesta | null>(null);
  const [elegida, setElegida] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const resultadosRef = useRef<HTMLHeadingElement>(null);
  const idModo = useId();

  function clicMapa(lat: number, lng: number) {
    if (!dentroDeCartagena(lat, lng)) return;
    const l = { nombre: fijar === 'origen' ? 'Punto de origen en el mapa' : 'Punto de destino en el mapa', detalle: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, lat, lng };
    if (fijar === 'origen') { setOrigen(l); setFijar('destino'); } else setDestino(l);
  }

  async function calcular() {
    if (!origen || !destino) { setError('Elige el origen y el destino (búscalos o márcalos en el mapa).'); return; }
    setCargando(true);
    setError('');
    try {
      const r = await fetch('/api/ruta', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origen: [origen.lat, origen.lng], destino: [destino.lat, destino.lng], salida: `${salida}:00-05:00`, modo }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error ?? 'No se pudo calcular la ruta.'); setResp(null); return; }
      setResp(d);
      setElegida(d.recomendada);
      setTimeout(() => resultadosRef.current?.focus(), 50);
    } catch {
      setError('No hay conexión con el servicio de rutas. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  const capas = useMemo<Capa[]>(() => {
    const res: Capa[] = [];
    if (resp) {
      const otras = resp.rutas.filter((r) => r.id !== elegida);
      if (otras.length) res.push({ tipo: 'lineas', items: otras.map((r) => ({ coords: r.coords, color: '#8E8AA3', grosor: 5, discontinua: true, opacidad: 0.7, ventana: { titulo: 'Ruta alternativa', lineas: [`${km(r.distanciaM)} · ${min(r.duracionS)}`, `Índice de riesgo ${r.indice}`] } })) });
      const sel = resp.rutas.find((r) => r.id === elegida);
      if (sel) {
        res.push({ tipo: 'lineas', items: [{ coords: sel.coords, color: '#121019', grosor: 11, opacidad: 0.85 }] });
        res.push({ tipo: 'lineas', items: sel.tramos.map((t) => ({ coords: t.coords, color: NIVEL[t.nivel].color, grosor: NIVEL[t.nivel].trazo.grosor, discontinua: NIVEL[t.nivel].trazo.discontinua, opacidad: 1, ventana: { titulo: NIVEL[t.nivel].texto } })) });
        if (sel.focos.length) res.push({ tipo: 'marcadores', items: sel.focos.map((f, i) => ({ lat: f.lat, lng: f.lng, icono: 'alerta' as const, color: '#B42318', etiqueta: `Foco de riesgo ${i + 1}`, ventana: { titulo: `Foco de riesgo ${i + 1}`, lineas: [f.barrio ? `Cerca de ${f.barrio}` : 'Tramo con siniestros frecuentes', 'Reduce la velocidad y extrema la precaución.'] } })) });
      }
    }
    const marcas: Extract<Capa, { tipo: 'marcadores' }>['items'] = [];
    if (origen) marcas.push({ lat: origen.lat, lng: origen.lng, icono: 'origen', color: '#2437C7', etiqueta: `Origen: ${origen.nombre}` });
    if (destino) marcas.push({ lat: destino.lat, lng: destino.lng, icono: 'destino', color: '#121019', etiqueta: `Destino: ${destino.nombre}` });
    if (marcas.length) res.push({ tipo: 'marcadores', items: marcas });
    return res;
  }, [resp, elegida, origen, destino]);

  const recomendada = resp?.rutas.find((r) => r.id === resp.recomendada);
  const rapida = resp?.rutas.find((r) => r.id === resp.masRapida);
  const seleccionada = resp?.rutas.find((r) => r.id === elegida);

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <form className="tarjeta h-fit space-y-5 p-5" onSubmit={(ev) => { ev.preventDefault(); void calcular(); }} aria-label="Planificar ruta">
        <Buscador etiqueta="Origen" valor={origen} alElegir={setOrigen} conUbicacion />
        <Buscador etiqueta="Destino" valor={destino} alElegir={setDestino} />

        <fieldset>
          <legend className="flex items-center gap-2 font-semibold"><Crosshair className="size-4" aria-hidden="true" />Al hacer clic en el mapa se fija el…</legend>
          <div className="mt-2 flex gap-2">
            {(['origen', 'destino'] as const).map((v) => (
              <label key={v} className={`boton boton-chico cursor-pointer ${fijar === v ? 'boton-primario' : 'boton-secundario'}`}>
                <input type="radio" name="fijar" className="sr-only" checked={fijar === v} onChange={() => setFijar(v)} />{v === 'origen' ? 'Origen' : 'Destino'}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${idModo}-salida`} className="font-semibold">Hora de salida</label>
          <input id={`${idModo}-salida`} type="datetime-local" className="campo mt-1" value={salida} onChange={(ev) => setSalida(ev.target.value)} required />
          <p className="mt-1 text-sm text-tinta-2">Los siniestros ocurridos cerca de esa hora pesan el doble.</p>
        </div>

        <fieldset>
          <legend className="font-semibold">Viajo en</legend>
          <div className="mt-2 flex gap-2">
            {([['auto', 'Carro', Car], ['moto', 'Moto', Bike]] as const).map(([v, t, I]) => (
              <label key={v} className={`boton boton-chico cursor-pointer ${modo === v ? 'boton-primario' : 'boton-secundario'}`}>
                <input type="radio" name="modo" className="sr-only" checked={modo === v} onChange={() => setModo(v)} />
                <I className="size-4" aria-hidden="true" />{t}
              </label>
            ))}
          </div>
        </fieldset>

        {error && <p role="alert" className="rounded-xl border border-error/30 bg-error-suave px-3 py-2 text-sm font-semibold text-error">{error}</p>}
        <button type="submit" className="boton boton-primario w-full" disabled={cargando} aria-disabled={cargando}>
          <Navigation className="size-4" aria-hidden="true" />{cargando ? 'Calculando rutas…' : 'Buscar la ruta más segura'}
        </button>
      </form>

      <div className="min-w-0 space-y-5">
        <Mapa capas={capas} etiqueta="Mapa de la ruta. Haz clic para fijar origen o destino; las rutas y focos de riesgo también se describen en las tarjetas de resultados." alto="min(60vh, 34rem)" alClic={clicMapa} ajustar={!!resp} />

        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-tinta-2" aria-label="Leyenda de la ruta">
          {(['bajo', 'medio', 'alto'] as const).map((n) => (
            <li key={n} className="flex items-center gap-2">
              <svg aria-hidden="true" width="36" height="10"><line x1="2" y1="5" x2="34" y2="5" stroke={NIVEL[n].color} strokeWidth={n === 'alto' ? 8 : n === 'medio' ? 5 : 4} strokeDasharray={NIVEL[n].trazo.discontinua ? '6 5' : undefined} strokeLinecap="round" /></svg>
              {NIVEL[n].texto}{n === 'alto' ? ' (trazo grueso)' : n === 'medio' ? ' (trazo discontinuo)' : ' (trazo fino)'}
            </li>
          ))}
          <li className="flex items-center gap-2"><svg aria-hidden="true" width="36" height="10"><line x1="2" y1="5" x2="34" y2="5" stroke="#8E8AA3" strokeWidth="4" strokeDasharray="6 5" /></svg>Alternativa no elegida</li>
        </ul>

        {resp && (
          <section aria-labelledby="titulo-resultados" className="space-y-4">
            <h2 id="titulo-resultados" ref={resultadosRef} tabIndex={-1} className="text-2xl font-bold outline-none">
              {resp.rutas.length === 1 ? 'Una ruta encontrada' : `${resp.rutas.length} rutas comparadas`}
            </h2>
            {recomendada && (
              <div className="rounded-2xl bg-noche p-5 text-white sobre-oscuro">
                <p className="flex items-center gap-2 font-semibold text-senal"><ShieldCheck className="size-5" aria-hidden="true" />Recomendación</p>
                <p className="mt-2 text-lg">
                  Toma la ruta {resp.rutas.indexOf(recomendada) + 1}: {km(recomendada.distanciaM)}, unos {min(recomendada.duracionS)}, con un índice de riesgo de {recomendada.indice}
                  {' '}({recomendada.siniestrosCerca} siniestros registrados a menos de 120 m en los últimos 3 años{recomendada.fatalesCerca ? `, ${recomendada.fatalesCerca} con víctimas fatales` : ''}).
                </p>
                {rapida && rapida.id !== recomendada.id && (
                  <p className="mt-2 text-white/80">
                    <Zap className="mr-1 inline size-4" aria-hidden="true" />La más rápida ahorra {min(recomendada.duracionS - rapida.duracionS)}, pero su riesgo es {Math.round((rapida.indice / Math.max(0.1, recomendada.indice)) * 10) / 10} veces mayor.
                  </p>
                )}
              </div>
            )}
            <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {resp.rutas.map((r, i) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setElegida(r.id)} aria-pressed={elegida === r.id}
                    className={`tarjeta block w-full p-4 text-left transition-shadow ${elegida === r.id ? 'outline outline-3 outline-marca' : 'hover:shadow-elevada'}`}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2 font-bold"><Route className="size-4" aria-hidden="true" />Ruta {i + 1}</span>
                      <span className={`insignia ${NIVEL[r.nivel].clase}`}>{NIVEL[r.nivel].texto}</span>
                    </span>
                    {r.id === resp.recomendada && <span className="mt-1 block text-sm font-semibold text-exito">La más segura</span>}
                    {r.id === resp.masRapida && <span className="mt-1 block text-sm font-semibold text-marca">La más rápida</span>}
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                      <dt className="text-tinta-2">Distancia</dt><dd className="tabular font-semibold">{km(r.distanciaM)}</dd>
                      <dt className="text-tinta-2">Tiempo</dt><dd className="tabular font-semibold">{min(r.duracionS)}</dd>
                      <dt className="text-tinta-2">Índice de riesgo</dt><dd className="tabular font-semibold">{r.indice} / km</dd>
                      <dt className="text-tinta-2">Siniestros cerca</dt><dd className="tabular font-semibold">{r.siniestrosCerca}</dd>
                      <dt className="text-tinta-2">Con fatales</dt><dd className="tabular font-semibold">{r.fatalesCerca}</dd>
                      {r.motosCerca != null && <><dt className="text-tinta-2">Con motos</dt><dd className="tabular font-semibold">{r.motosCerca}</dd></>}
                    </dl>
                    <span className="mt-3 block text-sm font-semibold text-marca">{elegida === r.id ? 'Mostrando en el mapa' : 'Ver en el mapa'}</span>
                  </button>
                </li>
              ))}
            </ol>

            {seleccionada && (
              <div className="grid gap-4 md:grid-cols-2">
                <section className="tarjeta p-5" aria-labelledby="titulo-focos">
                  <h3 id="titulo-focos" className="flex items-center gap-2 font-bold"><TriangleAlert className="size-5 text-error" aria-hidden="true" />Focos de riesgo en esta ruta</h3>
                  {seleccionada.focos.length === 0 ? <p className="mt-2 text-tinta-2">No hay tramos de riesgo alto en esta ruta.</p> : (
                    <ol className="mt-3 space-y-2">
                      {seleccionada.focos.map((f, i) => (
                        <li key={i} className="flex gap-3"><span className="cifra text-2xl text-error">{i + 1}</span><span>{f.barrio ? `Tramo cerca de ${f.barrio}` : 'Tramo con siniestros frecuentes'}<span className="block text-sm text-tinta-2">Peso de riesgo acumulado: {f.riesgo}</span></span></li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className="tarjeta p-5" aria-labelledby="titulo-consejos">
                  <h3 id="titulo-consejos" className="font-bold">Consejos para este viaje</h3>
                  <ul className="mt-3 list-disc space-y-1.5 pl-5 text-tinta-2">
                    {resp.modo === 'moto' ? (
                      <>
                        <li>Casco abrochado y chaleco o prendas reflectivas, también de día.</li>
                        <li>No circules entre carriles cerca de buses y camiones.</li>
                      </>
                    ) : (
                      <>
                        <li>Revisa los espejos antes de cada giro: la mayoría de siniestros involucra motos.</li>
                        <li>Cede el paso al peatón en cruces y glorietas.</li>
                      </>
                    )}
                    <li>En los focos marcados, reduce la velocidad y aumenta la distancia de seguimiento.</li>
                    <li>Si llueve, el riesgo sube: frena antes y evita charcos profundos.</li>
                    <li>Nunca uses el celular mientras conduces.</li>
                  </ul>
                </section>
              </div>
            )}
            <p className="text-sm text-tinta-3">
              Rutas: {resp.proveedor}. Riesgo calculado con {resp.historico.toLocaleString('es-CO')} siniestros verificados de los últimos 3 años, ponderados por gravedad, antigüedad y hora. Es una orientación, no una garantía.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
