/**
 * Deteccion de puntos negros con DBSCAN.
 *
 * Un punto negro es un lugar donde los siniestros se agrupan: al menos `minPuntos`
 * siniestros que quedan a menos de `radioM` metros entre si (densidad). Se ordenan
 * por el indice EPDO (danos equivalentes): cada siniestro pesa segun su gravedad,
 * de modo que un sitio con muertos pesa mas que uno con muchos choques simples.
 */
import type { Gravedad } from '@/db/esquema';
import { barrioMasCercano, distanciaM } from '@/lib/geo';

export const PESO_EPDO: Record<Gravedad, number> = { solo_danos: 1, leve: 3, grave: 6, fatal: 12 };

export type PuntoSiniestro = { id: number; lat: number; lng: number; gravedad: Gravedad };

export type Grupo = {
  lat: number;
  lng: number;
  barrio: string;
  radioM: number;
  total: number;
  fatales: number;
  graves: number;
  indice: number;
  ids: number[];
};

/** DBSCAN con una rejilla espacial para no comparar todos contra todos. */
export function dbscan(puntos: PuntoSiniestro[], radioM = 150, minPuntos = 5): number[][] {
  const celdaGrados = radioM / 111_000;
  const clave = (lat: number, lng: number) => `${Math.floor(lat / celdaGrados)}:${Math.floor(lng / celdaGrados)}`;
  const rejilla = new Map<string, number[]>();
  puntos.forEach((p, i) => {
    const k = clave(p.lat, p.lng);
    const lista = rejilla.get(k);
    if (lista) lista.push(i); else rejilla.set(k, [i]);
  });

  const vecinos = (i: number) => {
    const p = puntos[i];
    const cy = Math.floor(p.lat / celdaGrados);
    const cx = Math.floor(p.lng / celdaGrados);
    const res: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of rejilla.get(`${cy + dy}:${cx + dx}`) ?? []) {
          if (distanciaM(p.lat, p.lng, puntos[j].lat, puntos[j].lng) <= radioM) res.push(j);
        }
      }
    }
    return res;
  };

  const SIN_VISITAR = -2, RUIDO = -1;
  const etiqueta = new Array<number>(puntos.length).fill(SIN_VISITAR);
  const grupos: number[][] = [];

  for (let i = 0; i < puntos.length; i++) {
    if (etiqueta[i] !== SIN_VISITAR) continue;
    const vi = vecinos(i);
    if (vi.length < minPuntos) { etiqueta[i] = RUIDO; continue; }
    const g = grupos.length;
    const miembros = [i];
    etiqueta[i] = g;
    const cola = vi.filter((j) => j !== i);
    while (cola.length) {
      const j = cola.pop()!;
      if (etiqueta[j] === RUIDO) { etiqueta[j] = g; miembros.push(j); }
      if (etiqueta[j] !== SIN_VISITAR) continue;
      etiqueta[j] = g;
      miembros.push(j);
      const vj = vecinos(j);
      if (vj.length >= minPuntos) cola.push(...vj);
    }
    grupos.push(miembros);
  }
  return grupos;
}

export function detectarPuntosNegros(puntos: PuntoSiniestro[], radioM = 150, minPuntos = 5): Grupo[] {
  return dbscan(puntos, radioM, minPuntos)
    .map((indices) => {
      const ms = indices.map((i) => puntos[i]);
      const lat = ms.reduce((s, p) => s + p.lat, 0) / ms.length;
      const lng = ms.reduce((s, p) => s + p.lng, 0) / ms.length;
      const radio = Math.max(60, ...ms.map((p) => distanciaM(lat, lng, p.lat, p.lng)));
      return {
        lat, lng,
        barrio: barrioMasCercano(lat, lng).nombre,
        radioM: Math.round(radio),
        total: ms.length,
        fatales: ms.filter((p) => p.gravedad === 'fatal').length,
        graves: ms.filter((p) => p.gravedad === 'grave').length,
        indice: ms.reduce((s, p) => s + PESO_EPDO[p.gravedad], 0),
        ids: ms.map((p) => p.id),
      };
    })
    .sort((a, b) => b.indice - a.indice);
}
