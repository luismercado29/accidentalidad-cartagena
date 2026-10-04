/**
 * Puntuacion de riesgo de una ruta.
 *
 * Se recorre la ruta por tramos de ~100 m y, en cada tramo, se suman los siniestros
 * del historico que ocurrieron a menos de RADIO_M metros, ponderados por:
 * - gravedad (EPDO),
 * - antiguedad (un siniestro de hace 2 años pesa la mitad que uno reciente),
 * - hora: los que ocurrieron cerca de la hora del viaje pesan el doble.
 * El indice final es riesgo por kilometro, para comparar rutas de distinto largo.
 *
 * Los niveles son relativos a la linea base de la ciudad: el riesgo que tendria
 * un tramo si los siniestros estuvieran repartidos por igual en el area urbana.
 * Medio = 3 veces la base; alto = 10 veces (tramo) u 8 veces (ruta completa).
 */
import type { Gravedad } from '@/db/esquema';
import { distanciaASegmentoM, distanciaM } from '@/lib/geo';
import { partesLocales } from '@/lib/tiempo';

import { PESO_EPDO } from './puntos-negros';

export const RADIO_M = 120;
const TRAMO_M = 100;
/** Area urbana aproximada de Cartagena (incluye Mamonal), para la linea base. */
const AREA_URBANA_M2 = 90_000_000;

export type SiniestroRuta = { lat: number; lng: number; gravedad: Gravedad; ocurridoEn: Date; barrio?: string | null };
export type Tramo = { desde: [number, number]; hasta: [number, number]; riesgo: number; nivel: 'bajo' | 'medio' | 'alto' };
export type Evaluacion = {
  distanciaM: number;
  indice: number; // riesgo por km
  nivel: 'bajo' | 'medio' | 'alto';
  siniestrosCerca: number;
  fatalesCerca: number;
  tramos: Tramo[];
  focos: { lat: number; lng: number; riesgo: number; barrio?: string | null }[];
};

/** Inserta puntos intermedios para que ningun segmento supere TRAMO_M (rutas con vertices escasos). */
function densificar(coords: [number, number][]) {
  const res: [number, number][] = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [coords[i - 1], coords[i]];
    const n = Math.ceil(distanciaM(a[0], a[1], b[0], b[1]) / TRAMO_M);
    for (let k = 1; k <= n; k++) res.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return res;
}

/** Divide la polilinea [lat,lng] en tramos de ~TRAMO_M metros. */
function tramos(entrada: [number, number][]) {
  const coords = densificar(entrada);
  const res: [[number, number], [number, number]][] = [];
  let inicio = coords[0];
  let acumulado = 0;
  for (let i = 1; i < coords.length; i++) {
    acumulado += distanciaM(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
    if (acumulado >= TRAMO_M || i === coords.length - 1) {
      res.push([inicio, coords[i]]);
      inicio = coords[i];
      acumulado = 0;
    }
  }
  return res;
}

export type LineaBase = { baseTramo: number; baseKm: number };

function pesoSiniestro(s: Pick<SiniestroRuta, 'gravedad' | 'ocurridoEn'>, salida: Date, horaViaje: number) {
  const edadAnios = (salida.getTime() - s.ocurridoEn.getTime()) / (365 * 86_400_000);
  const h = partesLocales(s.ocurridoEn).hora;
  const difHora = Math.min(Math.abs(h - horaViaje), 24 - Math.abs(h - horaViaje));
  return PESO_EPDO[s.gravedad] * Math.pow(0.5, Math.max(0, edadAnios) / 2) * (difHora <= 1 ? 2 : 1);
}

/** Linea base de la ciudad: riesgo de un tramo si los siniestros se repartieran por igual. Usa TODO el historico urbano. */
export function lineaBase(historicoCiudad: Pick<SiniestroRuta, 'gravedad' | 'ocurridoEn'>[], salida = new Date()): LineaBase {
  const horaViaje = partesLocales(salida).hora;
  const total = historicoCiudad.reduce((acc, s) => acc + pesoSiniestro(s, salida, horaViaje), 0);
  const baseTramo = Math.max(0.5, (total * 2 * RADIO_M * TRAMO_M) / AREA_URBANA_M2);
  return { baseTramo, baseKm: baseTramo * (1000 / TRAMO_M) };
}

export const nivelIndice = (indice: number, base: LineaBase) => (indice >= base.baseKm * 8 ? 'alto' : indice >= base.baseKm * 3 ? 'medio' : 'bajo') as 'alto' | 'medio' | 'bajo';

/** `base` deberia calcularse con todo el historico de la ciudad (lineaBase); si falta, se usa `historico`. */
export function evaluarRuta(coords: [number, number][], historico: SiniestroRuta[], salida = new Date(), base?: LineaBase): Evaluacion {
  if (coords.length < 2) return { distanciaM: 0, indice: 0, nivel: 'bajo', siniestrosCerca: 0, fatalesCerca: 0, tramos: [], focos: [] };
  const lats = coords.map((c) => c[0]), lngs = coords.map((c) => c[1]);
  const margen = 0.002;
  const caja = { s: Math.min(...lats) - margen, n: Math.max(...lats) + margen, o: Math.min(...lngs) - margen, e: Math.max(...lngs) + margen };
  const candidatos = historico.filter((s) => s.lat >= caja.s && s.lat <= caja.n && s.lng >= caja.o && s.lng <= caja.e);
  const horaViaje = partesLocales(salida).hora;

  const peso = (s: SiniestroRuta) => pesoSiniestro(s, salida, horaViaje);

  const { baseTramo } = base ?? lineaBase(historico, salida);

  const contados = new Set<SiniestroRuta>();
  let total = 0;
  const lista: Tramo[] = tramos(coords).map(([a, b]) => {
    let riesgo = 0;
    for (const s of candidatos) {
      if (distanciaASegmentoM(s.lat, s.lng, a, b) <= RADIO_M) {
        riesgo += peso(s);
        contados.add(s);
      }
    }
    total += riesgo;
    return { desde: a, hasta: b, riesgo, nivel: 'bajo' as const };
  });

  for (const t of lista) t.nivel = t.riesgo >= baseTramo * 10 ? 'alto' : t.riesgo >= baseTramo * 3 ? 'medio' : 'bajo';

  let distancia = 0;
  for (let i = 1; i < coords.length; i++) distancia += distanciaM(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
  const indice = total / Math.max(0.3, distancia / 1000);
  const cerca = [...contados];
  const focos = [...lista]
    .filter((t) => t.nivel === 'alto')
    .sort((a, b) => b.riesgo - a.riesgo)
    .slice(0, 3)
    .map((t) => {
      const lat = (t.desde[0] + t.hasta[0]) / 2, lng = (t.desde[1] + t.hasta[1]) / 2;
      const cercano = cerca.reduce<SiniestroRuta | null>((m, s) => (!m || distanciaM(lat, lng, s.lat, s.lng) < distanciaM(lat, lng, m.lat, m.lng) ? s : m), null);
      return { lat, lng, riesgo: Math.round(t.riesgo), barrio: cercano?.barrio };
    });

  return {
    distanciaM: Math.round(distancia),
    indice: Math.round(indice * 10) / 10,
    nivel: nivelIndice(indice, base ?? lineaBase(historico, salida)),
    siniestrosCerca: cerca.length,
    fatalesCerca: cerca.filter((s) => s.gravedad === 'fatal').length,
    tramos: lista,
    focos,
  };
}
