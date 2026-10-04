'use client';

import { Layers, SlidersHorizontal } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useMemo, useState, useTransition } from 'react';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Mapa, type Capa } from '@/components/mapa/Mapa';
import { CLASES, GRAVEDADES, VEHICULOS, type Gravedad } from '@/db/esquema';
import { CLASE, COLOR_MAPA, ESTADO_INCIDENTE, GRAVEDAD, NIVEL_ALERTA, NOVEDAD, PRIORIDAD, VEHICULO } from '@/lib/etiquetas';
import type { DatosMapa } from '@/lib/mapa-datos';

const FRANJAS = [
  ['madrugada', 'Madrugada (0–5 h)'], ['manana', 'Mañana (6–11 h)'], ['tarde', 'Tarde (12–17 h)'], ['noche', 'Noche (18–23 h)'],
] as const;

type ClaveCapa = 'calor' | 'puntos' | 'negros' | 'novedades' | 'camaras' | 'incidentes' | 'geocercas';

const fmtFecha = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const LIMITE_PUNTOS = 5000;
const PESO: Record<Gravedad, number> = { solo_danos: 0.25, leve: 0.45, grave: 0.75, fatal: 1 };

export type FiltrosActuales = { gravedad: string | null; clase: string | null; vehiculo: string | null; franja: string | null };

export function MapaExplorador({ datos, equipo, filtros, tiempo }: {
  datos: Omit<DatosMapa, 'periodo'>;
  equipo: boolean;
  filtros: FiltrosActuales;
  tiempo: { actual: string; etiqueta: string; anios: number[]; desde?: string; hasta?: string };
}) {
  const router = useRouter();
  const ruta = usePathname();
  const params = useSearchParams();
  const id = useId();
  const [pendiente, iniciar] = useTransition();
  const [capas, setCapas] = useState<Record<ClaveCapa, boolean>>({
    calor: true, puntos: false, negros: true, novedades: true, camaras: false, incidentes: equipo, geocercas: false,
  });

  function filtrar(clave: string, valor: string) {
    const u = new URLSearchParams(params.toString());
    if (valor) u.set(clave, valor); else u.delete(clave);
    iniciar(() => router.push(`${ruta}?${u.toString()}`, { scroll: false }));
  }

  const conteo = useMemo(() => {
    const c = [0, 0, 0, 0];
    for (const p of datos.puntos) c[p[2]]++;
    return c;
  }, [datos.puntos]);

  const listaCapas = useMemo<Capa[]>(() => {
    const res: Capa[] = [];
    if (capas.geocercas && datos.geocercas) {
      res.push({ tipo: 'poligonos', items: datos.geocercas.map((g) => ({ coords: g.coords, color: g.color, ventana: { titulo: g.nombre, lineas: [`Nivel ${NIVEL_ALERTA[g.nivel]?.texto.toLowerCase() ?? g.nivel}`], enlace: { href: '/consola/geocercas', texto: 'Ver geocercas' } } })) });
    }
    if (capas.calor) res.push({ tipo: 'calor', puntos: datos.puntos.map((p) => [p[0], p[1], PESO[GRAVEDADES[p[2]]]]) });
    if (capas.puntos) {
      res.push({
        tipo: 'puntos',
        // Los puntos individuales se limitan a los 5.000 mas recientes para que el mapa siga fluido.
        items: datos.puntos.slice(0, LIMITE_PUNTOS).map((p) => {
          const g = GRAVEDADES[p[2]];
          return {
            lat: p[0], lng: p[1], color: COLOR_MAPA[g], radio: g === 'fatal' ? 7 : g === 'grave' ? 6 : 4.5,
            ventana: {
              titulo: GRAVEDAD[g].texto,
              lineas: [fmtFecha.format(new Date(p[3] * 60_000)), CLASE[CLASES[p[4]]], datos.barrios[p[5]]],
              enlace: equipo && p[6] ? { href: `/consola/siniestros/${p[6]}`, texto: 'Ver registro' } : undefined,
            },
          };
        }),
      });
    }
    if (capas.negros) {
      res.push({
        tipo: 'circulos',
        items: datos.puntosNegros.map((n) => ({
          lat: n.lat, lng: n.lng, radioM: Math.max(80, n.radioM), color: '#121019', relleno: 0.08,
          ventana: { titulo: `Punto negro n.º ${n.ranking}: ${n.nombre}`, lineas: [`${n.total} siniestros · ${n.graves} graves · ${n.fatales} fatales`, `Índice de severidad: ${Math.round(n.indice)}`], enlace: equipo ? { href: '/consola/puntos-negros', texto: 'Ver puntos negros' } : undefined },
        })),
      });
    }
    if (capas.novedades) {
      res.push({ tipo: 'marcadores', items: datos.novedades.map((n) => ({ lat: n.lat, lng: n.lng, icono: 'novedad' as const, color: '#B45309', etiqueta: `${NOVEDAD[n.tipo] ?? 'Novedad'}: ${n.titulo}`, ventana: { titulo: n.titulo, lineas: [NOVEDAD[n.tipo] ?? 'Novedad en la vía', n.hasta ? `Hasta el ${fmtFecha.format(new Date(n.hasta))}` : 'Sin fecha de fin'] } })) });
    }
    if (capas.camaras && datos.camaras) {
      res.push({ tipo: 'marcadores', items: datos.camaras.map((c) => ({ lat: c.lat, lng: c.lng, icono: 'camara' as const, color: c.conectada ? '#2437C7' : '#6B6880', etiqueta: `Cámara: ${c.nombre}`, ventana: { titulo: c.nombre, lineas: [c.conectada ? 'Señal configurada' : 'Conexión pendiente'], enlace: { href: '/consola/camaras', texto: 'Abrir cámaras' } } })) });
    }
    if (capas.incidentes && datos.incidentes) {
      res.push({ tipo: 'marcadores', items: datos.incidentes.map((i) => ({ lat: i.lat, lng: i.lng, icono: 'incidente' as const, color: i.prioridad === 'critica' || i.prioridad === 'alta' ? '#B42318' : '#2437C7', pulso: i.estado === 'abierto', etiqueta: `Incidente ${i.codigo}`, ventana: { titulo: `${i.codigo} · ${i.titulo}`, lineas: [`Prioridad ${PRIORIDAD[i.prioridad as keyof typeof PRIORIDAD]?.texto.toLowerCase() ?? i.prioridad}`, ESTADO_INCIDENTE[i.estado as keyof typeof ESTADO_INCIDENTE]?.texto ?? i.estado], enlace: { href: `/consola/incidentes/${i.id}`, texto: 'Abrir incidente' } } })) });
    }
    return res;
  }, [capas, datos, equipo]);

  const opcionesCapa: { clave: ClaveCapa; texto: string; solo?: boolean }[] = [
    { clave: 'calor', texto: 'Mapa de calor' },
    { clave: 'puntos', texto: 'Siniestros por gravedad' },
    { clave: 'negros', texto: `Puntos negros (${datos.puntosNegros.length})` },
    { clave: 'novedades', texto: `Novedades en la vía (${datos.novedades.length})` },
    ...(equipo ? [
      { clave: 'incidentes' as const, texto: `Incidentes en curso (${datos.incidentes?.length ?? 0})` },
      { clave: 'camaras' as const, texto: `Cámaras (${datos.camaras?.length ?? 0})` },
      { clave: 'geocercas' as const, texto: `Geocercas (${datos.geocercas?.length ?? 0})` },
    ] : []),
  ];

  const select = (clave: keyof FiltrosActuales, etiqueta: string, opciones: readonly (readonly [string, string])[]) => (
    <div>
      <label htmlFor={`${id}-${clave}`} className="text-sm font-semibold text-tinta-2">{etiqueta}</label>
      <select id={`${id}-${clave}`} className="campo mt-1 min-h-10 py-1.5" value={filtros[clave] ?? ''} onChange={(ev) => filtrar(clave, ev.target.value)}>
        <option value="">Todos</option>
        {opciones.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </div>
  );

  const total = datos.puntos.length;
  return (
    <div className="grid gap-6 xl:grid-cols-[19rem_1fr]">
      <aside className="space-y-5" aria-label="Filtros y capas del mapa">
        <section className="tarjeta space-y-4 p-4">
          <h2 className="flex items-center gap-2 font-bold"><SlidersHorizontal className="size-4" aria-hidden="true" />Filtros</h2>
          <FiltroTiempo {...tiempo} />
          {select('gravedad', 'Gravedad', GRAVEDADES.map((g) => [g, GRAVEDAD[g].texto] as const))}
          {select('clase', 'Clase de siniestro', CLASES.map((c) => [c, CLASE[c]] as const))}
          {select('vehiculo', 'Vehículo o actor', VEHICULOS.map((v) => [v, VEHICULO[v]] as const))}
          {select('franja', 'Franja horaria', FRANJAS)}
        </section>

        <fieldset className="tarjeta p-4">
          <legend className="sr-only">Capas</legend>
          <p aria-hidden="true" className="flex items-center gap-2 font-bold"><Layers className="size-4" />Capas</p>
          <ul className="mt-3 space-y-1">
            {opcionesCapa.map((o) => (
              <li key={o.clave}>
                <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-1 hover:bg-hundido">
                  <input type="checkbox" className="size-5 accent-marca" checked={capas[o.clave]} onChange={(ev) => setCapas((c) => ({ ...c, [o.clave]: ev.target.checked }))} />
                  {o.texto}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <section className="tarjeta p-4" aria-labelledby={`${id}-leyenda`}>
          <h2 id={`${id}-leyenda`} className="font-bold">Leyenda</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="h-2.5 w-20 rounded-full" style={{ background: 'linear-gradient(90deg,#FFE08A,#FFC21A,#E5531A,#7A1010)' }} />
              Calor: de baja a alta concentración (pesa más lo grave)
            </li>
            {(['fatal', 'grave', 'leve', 'solo_danos'] as const).map((g) => (
              <li key={g} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full border border-white" style={{ background: COLOR_MAPA[g] }} />{GRAVEDAD[g].texto}</span>
                <span className="tabular font-semibold">{conteo[GRAVEDADES.indexOf(g)].toLocaleString('es-CO')}<span className="sr-only"> siniestros</span></span>
              </li>
            ))}
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 rounded-full border-2 border-noche" />Punto negro (agrupación de siniestros)</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="grid size-4 place-items-center rounded-full bg-aviso text-[9px] font-bold text-white">!</span>Novedad en la vía</li>
          </ul>
        </section>
      </aside>

      <div className="min-w-0 space-y-5">
        <p className="flex flex-wrap items-baseline gap-x-3 text-tinta-2" role="status" aria-live="polite">
          <span className="cifra text-4xl text-tinta">{total.toLocaleString('es-CO')}</span>
          siniestros en «{tiempo.etiqueta}»{pendiente && ' · actualizando…'}
          {datos.truncado && <span className="text-aviso-texto">(se muestran los 20.000 más recientes)</span>}
          {capas.puntos && total > LIMITE_PUNTOS && <span>· la capa de puntos muestra los {LIMITE_PUNTOS.toLocaleString('es-CO')} más recientes</span>}
        </p>
        <Mapa capas={listaCapas} etiqueta={`Mapa de siniestros: ${tiempo.etiqueta}. La tabla de zonas debajo resume la misma información.`} alto="min(70vh, 40rem)" />

        <section className="tarjeta p-5" aria-labelledby={`${id}-zonas`}>
          <h2 id={`${id}-zonas`} className="text-lg font-bold">Zonas con más siniestros en el periodo</h2>
          <p className="text-sm text-tinta-2">Alternativa en texto al mapa, con los mismos filtros.</p>
          {datos.zonas.length === 0 ? <p className="mt-4 text-tinta-2">No hay siniestros con estos filtros.</p> : (
            <div className="mt-4 overflow-x-auto" tabIndex={0}>
              <table className="tabla">
                <caption className="sr-only">Zonas con más siniestros</caption>
                <thead><tr><th scope="col">#</th><th scope="col">Barrio o sector</th><th scope="col" className="num">Siniestros</th><th scope="col" className="num">Graves</th><th scope="col" className="num">Fatales</th><th scope="col" className="num">% del total</th></tr></thead>
                <tbody>
                  {datos.zonas.map((z, i) => (
                    <tr key={z.barrio}>
                      <td className="anotacion text-tinta-3">{String(i + 1).padStart(2, '0')}</td>
                      <th scope="row" className="font-semibold">{z.barrio}</th>
                      <td className="num">{z.total.toLocaleString('es-CO')}</td>
                      <td className="num">{z.graves}</td>
                      <td className="num">{z.fatales}</td>
                      <td className="num">{total ? ((z.total / total) * 100).toLocaleString('es-CO', { maximumFractionDigits: 1 }) : 0} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {datos.puntosNegros.length > 0 && (
          <section className="tarjeta p-5" aria-labelledby={`${id}-negros`}>
            <h2 id={`${id}-negros`} className="text-lg font-bold">Puntos negros de la ciudad</h2>
            <p className="text-sm text-tinta-2">Sitios donde los siniestros se agrupan en los últimos dos años, ordenados por índice de severidad.</p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {datos.puntosNegros.slice(0, 10).map((n) => (
                <li key={n.id} className="flex items-baseline gap-3 rounded-xl bg-hundido px-3 py-2">
                  <span className="cifra text-2xl text-tinta-3">{String(n.ranking).padStart(2, '0')}</span>
                  <span><span className="font-semibold">{n.nombre}</span><span className="block text-sm text-tinta-2">{n.total} siniestros · {n.fatales} fatales</span></span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
