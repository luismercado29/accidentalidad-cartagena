/** Utilidades de territorio (sin dependencias de servidor: se pueden probar). */
import { dentroDeCartagena } from '@/lib/geo';

/**
 * Acepta el poligono como JSON de [lat,lng][] (lo que manda el editor) o como
 * GeoJSON (Polygon, Feature o FeatureCollection, en [lng,lat]), o una lista de
 * lineas "lat, lng". Devuelve el anillo en [lng,lat] cerrado.
 */
export function interpretarPoligono(entrada: string): [number, number][] | string {
  const t = entrada.trim();
  if (!t) return 'Dibuja el polígono en el mapa o pega sus coordenadas.';
  let anillo: [number, number][] | null = null;
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v) && Array.isArray(v[0]) && typeof v[0][0] === 'number') {
      // Formato del editor: [lat, lng]
      anillo = (v as number[][]).map((p) => [Number(p[1]), Number(p[0])]);
    } else {
      const geom = v?.type === 'FeatureCollection' ? v.features?.[0]?.geometry : v?.type === 'Feature' ? v.geometry : v;
      if (geom?.type === 'Polygon' && Array.isArray(geom.coordinates?.[0])) anillo = geom.coordinates[0].map((p: number[]) => [Number(p[0]), Number(p[1])]);
      else return 'El GeoJSON debe ser un Polygon (o un Feature con un Polygon).';
    }
  } catch {
    const lineas = t.split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean);
    const pares = lineas.map((l) => l.split(/[,\s]+/).map(Number));
    if (pares.some((p) => p.length < 2 || p.some((n) => !Number.isFinite(n)))) return 'No se reconoció el formato. Usa una línea «lat, lng» por vértice o GeoJSON.';
    anillo = pares.map((p) => [p[1], p[0]]);
  }
  if (!anillo) return 'Polígono inválido.';
  const limpio = anillo.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const abierto = limpio.length > 1 && limpio[0][0] === limpio.at(-1)![0] && limpio[0][1] === limpio.at(-1)![1] ? limpio.slice(0, -1) : limpio;
  if (abierto.length < 3) return 'El polígono necesita al menos 3 vértices.';
  if (abierto.length > 200) return 'El polígono tiene demasiados vértices (máximo 200).';
  if (abierto.some(([lng, lat]) => !dentroDeCartagena(lat, lng))) return 'Todos los vértices deben estar dentro de Cartagena.';
  return [...abierto, abierto[0]];
}

