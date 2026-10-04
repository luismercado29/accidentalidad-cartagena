/**
 * Geografia de Cartagena: barrios, corredores viales y utilidades de distancia.
 * Las coordenadas son centroides aproximados; sirven para ubicar textos
 * ("en el Pie de la Popa") y para nombrar zonas, no para catastro.
 */

export const CENTRO: [number, number] = [10.4105, -75.5155];
/** Rectangulo que cubre el area urbana y Mamonal. */
export const LIMITES = { sur: 10.30, norte: 10.52, oeste: -75.60, este: -75.40 } as const;

export function dentroDeCartagena(lat: number, lng: number) {
  return lat >= LIMITES.sur && lat <= LIMITES.norte && lng >= LIMITES.oeste && lng <= LIMITES.este;
}

export type Barrio = { nombre: string; lat: number; lng: number; alias?: string[] };

export const BARRIOS: Barrio[] = [
  { nombre: 'Centro Histórico', lat: 10.4236, lng: -75.5506, alias: ['centro historico', 'el centro', 'ciudad amurallada', 'torre del reloj'] },
  { nombre: 'Getsemaní', lat: 10.4195, lng: -75.5468, alias: ['getsemani'] },
  { nombre: 'San Diego', lat: 10.4275, lng: -75.5475 },
  { nombre: 'Bocagrande', lat: 10.3990, lng: -75.5560 },
  { nombre: 'Castillogrande', lat: 10.3925, lng: -75.5530 },
  { nombre: 'El Laguito', lat: 10.3960, lng: -75.5600, alias: ['laguito'] },
  { nombre: 'Manga', lat: 10.4120, lng: -75.5330 },
  { nombre: 'Pie de la Popa', lat: 10.4205, lng: -75.5300 },
  { nombre: 'El Cabrero', lat: 10.4300, lng: -75.5440, alias: ['cabrero'] },
  { nombre: 'Marbella', lat: 10.4360, lng: -75.5390 },
  { nombre: 'Crespo', lat: 10.4450, lng: -75.5160, alias: ['aeropuerto'] },
  { nombre: 'Torices', lat: 10.4290, lng: -75.5310 },
  { nombre: 'Lo Amador', lat: 10.4215, lng: -75.5380 },
  { nombre: 'Espinal', lat: 10.4240, lng: -75.5350, alias: ['el espinal'] },
  { nombre: 'Bazurto', lat: 10.4100, lng: -75.5230, alias: ['mercado de bazurto'] },
  { nombre: 'Martínez Martelo', lat: 10.4180, lng: -75.5230, alias: ['martinez martelo'] },
  { nombre: 'Daniel Lemaitre', lat: 10.4280, lng: -75.5200 },
  { nombre: 'Canapote', lat: 10.4330, lng: -75.5150 },
  { nombre: 'San Francisco', lat: 10.4400, lng: -75.5100 },
  { nombre: 'La Boquilla', lat: 10.4740, lng: -75.4960, alias: ['boquilla'] },
  { nombre: 'El Bosque', lat: 10.4000, lng: -75.5150, alias: ['bosque'] },
  { nombre: 'Alto Bosque', lat: 10.3980, lng: -75.5070 },
  { nombre: 'Zaragocilla', lat: 10.4060, lng: -75.5040 },
  { nombre: 'Los Alpes', lat: 10.4080, lng: -75.5100 },
  { nombre: 'Amberes', lat: 10.4130, lng: -75.5130 },
  { nombre: 'España', lat: 10.4140, lng: -75.5060, alias: ['barrio espana'] },
  { nombre: 'Escallón Villa', lat: 10.4000, lng: -75.4990, alias: ['escallon villa'] },
  { nombre: 'La Castellana', lat: 10.3980, lng: -75.4950, alias: ['castellana'] },
  { nombre: 'Los Ejecutivos', lat: 10.3990, lng: -75.4920 },
  { nombre: 'Boston', lat: 10.4110, lng: -75.4930 },
  { nombre: 'Olaya Herrera', lat: 10.4200, lng: -75.4880, alias: ['olaya'] },
  { nombre: 'El Pozón', lat: 10.4060, lng: -75.4590, alias: ['pozon'] },
  { nombre: 'Las Gaviotas', lat: 10.4010, lng: -75.4880, alias: ['gaviotas'] },
  { nombre: 'Los Caracoles', lat: 10.3930, lng: -75.4930, alias: ['caracoles'] },
  { nombre: 'Blas de Lezo', lat: 10.3880, lng: -75.4970 },
  { nombre: 'Ternera', lat: 10.3900, lng: -75.4780 },
  { nombre: 'San Fernando', lat: 10.3780, lng: -75.4880 },
  { nombre: 'El Socorro', lat: 10.3810, lng: -75.4790, alias: ['socorro'] },
  { nombre: 'El Recreo', lat: 10.3840, lng: -75.4690, alias: ['recreo'] },
  { nombre: 'Campestre', lat: 10.3780, lng: -75.4740, alias: ['el campestre'] },
  { nombre: 'Nelson Mandela', lat: 10.3640, lng: -75.4800 },
  { nombre: 'Albornoz', lat: 10.3700, lng: -75.5150 },
  { nombre: 'Ceballos', lat: 10.3750, lng: -75.5050 },
  { nombre: 'Mamonal', lat: 10.3300, lng: -75.5060, alias: ['zona industrial'] },
  { nombre: 'Terminal de Transportes', lat: 10.4040, lng: -75.4460, alias: ['terminal'] },
];

/** Corredores viales principales (polilineas lat,lng) donde se concentra la siniestralidad. */
export const CORREDORES: { nombre: string; peso: number; puntos: [number, number][] }[] = [
  { nombre: 'Av. Pedro de Heredia', peso: 10, puntos: [[10.4155, -75.5265], [10.4120, -75.5180], [10.4105, -75.5090], [10.4110, -75.4990], [10.4120, -75.4880], [10.4080, -75.4720], [10.4040, -75.4560]] },
  { nombre: 'Av. Santander', peso: 6, puntos: [[10.4290, -75.5480], [10.4380, -75.5380], [10.4460, -75.5250], [10.4520, -75.5150]] },
  { nombre: 'Av. San Martín', peso: 4, puntos: [[10.4120, -75.5490], [10.4040, -75.5530], [10.3960, -75.5560]] },
  { nombre: 'Av. Pedro Romero', peso: 5, puntos: [[10.3990, -75.5150], [10.3920, -75.5000], [10.3860, -75.4890]] },
  { nombre: 'Av. del Consulado', peso: 5, puntos: [[10.4060, -75.5180], [10.3990, -75.5050], [10.3920, -75.4900]] },
  { nombre: 'Troncal de Occidente', peso: 6, puntos: [[10.3870, -75.4880], [10.3800, -75.4700], [10.3760, -75.4550]] },
  { nombre: 'Vía Mamonal', peso: 5, puntos: [[10.3880, -75.5150], [10.3650, -75.5150], [10.3300, -75.5060]] },
  { nombre: 'Vía al Mar', peso: 3, puntos: [[10.4520, -75.5150], [10.4700, -75.5000], [10.4900, -75.4900]] },
  { nombre: 'Av. Crisanto Luque', peso: 4, puntos: [[10.4120, -75.4990], [10.4000, -75.4960], [10.3900, -75.4930]] },
];

const R = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en metros entre dos puntos (haversine). */
export function distanciaM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Distancia en metros de un punto al segmento AB (aproximacion plana, valida a escala urbana). */
export function distanciaASegmentoM(lat: number, lng: number, a: [number, number], b: [number, number]) {
  const kx = Math.cos(rad(lat)) * 111_320;
  const ky = 110_540;
  const px = (lng - a[1]) * kx, py = (lat - a[0]) * ky;
  const bx = (b[1] - a[1]) * kx, by = (b[0] - a[0]) * ky;
  const largo2 = bx * bx + by * by;
  const t = largo2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / largo2));
  return Math.hypot(px - t * bx, py - t * by);
}

export function barrioMasCercano(lat: number, lng: number): Barrio {
  let mejor = BARRIOS[0];
  let min = Infinity;
  for (const b of BARRIOS) {
    const d = distanciaM(lat, lng, b.lat, b.lng);
    if (d < min) { min = d; mejor = b; }
  }
  return mejor;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Busca un barrio o corredor mencionado en un texto libre. Prefiere la coincidencia mas larga. */
export function barrioEnTexto(texto: string): Barrio | null {
  const t = ` ${sinTildes(texto).replace(/[^a-z0-9 ]/g, ' ')} `;
  let mejor: Barrio | null = null;
  let largo = 0;
  for (const b of BARRIOS) {
    for (const nombre of [b.nombre, ...(b.alias ?? [])]) {
      const n = sinTildes(nombre);
      if (n.length > largo && t.includes(` ${n} `)) { mejor = b; largo = n.length; }
    }
  }
  for (const c of CORREDORES) {
    const n = sinTildes(c.nombre.replace('Av. ', 'avenida '));
    const corto = sinTildes(c.nombre.replace('Av. ', ''));
    if ((t.includes(` ${n} `) || t.includes(` ${corto} `)) && corto.length > largo) {
      const [lat, lng] = c.puntos[Math.floor(c.puntos.length / 2)];
      mejor = { nombre: c.nombre, lat, lng };
      largo = corto.length;
    }
  }
  return mejor;
}

/** Punto dentro de poligono (ray casting). Poligono en [lng, lat], como GeoJSON. */
export function puntoEnPoligono(lat: number, lng: number, poligono: [number, number][]) {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [xi, yi] = poligono[i];
    const [xj, yj] = poligono[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

/** Formato de coordenadas tipo plano: 10.4105° N · 75.5155° O */
export function coordenadas(lat: number, lng: number) {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lng).toFixed(4)}° ${lng >= 0 ? 'E' : 'O'}`;
}
