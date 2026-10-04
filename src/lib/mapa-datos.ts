import 'server-only';

import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import { CLASES, GRAVEDADES, type Gravedad } from '@/db/esquema';
import { leerFiltros, puntosMapa } from '@/lib/consultas';
import { partesLocales, resolverPeriodo, type Periodo } from '@/lib/tiempo';

export const FRANJAS = {
  madrugada: { texto: 'Madrugada (0–5 h)', desde: 0, hasta: 5 },
  manana: { texto: 'Mañana (6–11 h)', desde: 6, hasta: 11 },
  tarde: { texto: 'Tarde (12–17 h)', desde: 12, hasta: 17 },
  noche: { texto: 'Noche (18–23 h)', desde: 18, hasta: 23 },
} as const;
export type Franja = keyof typeof FRANJAS;

/**
 * Punto compacto para enviar miles al navegador:
 * [lat, lng, indice de gravedad, minutos epoch, indice de clase, indice de barrio, id (solo consola)]
 */
export type PuntoCompacto = [number, number, number, number, number, number, number];

export type DatosMapa = {
  periodo: Periodo;
  puntos: PuntoCompacto[];
  barrios: string[];
  truncado: boolean;
  zonas: { barrio: string; total: number; graves: number; fatales: number }[];
  puntosNegros: { id: number; nombre: string; lat: number; lng: number; radioM: number; total: number; fatales: number; graves: number; indice: number; ranking: number }[];
  novedades: { id: number; tipo: string; titulo: string; lat: number; lng: number; hasta: string | null }[];
  camaras?: { id: number; nombre: string; lat: number; lng: number; conectada: boolean }[];
  incidentes?: { id: number; codigo: string; titulo: string; lat: number; lng: number; prioridad: string; estado: string }[];
  geocercas?: { id: number; nombre: string; nivel: string; color: string; coords: [number, number][] }[];
};

const LIMITE = 20_000;
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export async function cargarDatosMapa(sp: Record<string, string | string[] | undefined>, equipo: boolean): Promise<DatosMapa> {
  const periodo = resolverPeriodo(sp, '90d');
  const f = leerFiltros(sp);
  const franjaTexto = Array.isArray(sp.franja) ? sp.franja[0] : sp.franja;
  const franja = franjaTexto && franjaTexto in FRANJAS ? FRANJAS[franjaTexto as Franja] : null;

  const ahora = new Date();
  const [crudos, negros, novedades] = await Promise.all([
    puntosMapa({ periodo, gravedad: f.gravedad, clase: f.clase, vehiculo: f.vehiculo }, LIMITE),
    db.select().from(e.puntosNegros).orderBy(e.puntosNegros.ranking).limit(60),
    db.select().from(e.novedadesVia).where(and(eq(e.novedadesVia.activa, true), or(isNull(e.novedadesVia.hasta), gt(e.novedadesVia.hasta, ahora)))),
  ]);

  const filtrados = franja
    ? crudos.filter((p) => { const h = partesLocales(p.ocurridoEn).hora; return h >= franja.desde && h <= franja.hasta; })
    : crudos;

  const barrios: string[] = [];
  const indiceBarrio = new Map<string, number>();
  const zonas = new Map<string, { barrio: string; total: number; graves: number; fatales: number }>();
  const puntos: PuntoCompacto[] = filtrados.map((p) => {
    const b = p.barrio ?? 'Sin barrio';
    let ib = indiceBarrio.get(b);
    if (ib == null) { ib = barrios.length; barrios.push(b); indiceBarrio.set(b, ib); }
    const z = zonas.get(b) ?? { barrio: b, total: 0, graves: 0, fatales: 0 };
    z.total++;
    if (p.gravedad === 'grave') z.graves++;
    if (p.gravedad === 'fatal') z.fatales++;
    zonas.set(b, z);
    return [r5(p.lat), r5(p.lng), GRAVEDADES.indexOf(p.gravedad as Gravedad), Math.floor(p.ocurridoEn.getTime() / 60_000), Math.max(0, CLASES.indexOf(p.clase)), ib, equipo ? p.id : 0];
  });

  const datos: DatosMapa = {
    periodo,
    puntos,
    barrios,
    truncado: crudos.length >= LIMITE,
    zonas: [...zonas.values()].sort((a, b) => b.total - a.total).slice(0, 12),
    puntosNegros: negros.map((n) => ({ id: n.id, nombre: n.nombre, lat: n.lat, lng: n.lng, radioM: n.radioM, total: n.total, fatales: n.fatales, graves: n.graves, indice: n.indice, ranking: n.ranking })),
    novedades: novedades.map((n) => ({ id: n.id, tipo: n.tipo, titulo: n.titulo, lat: n.lat, lng: n.lng, hasta: n.hasta?.toISOString() ?? null })),
  };

  if (equipo) {
    const [camaras, incidentes, geocercas] = await Promise.all([
      db.select().from(e.camaras).where(eq(e.camaras.activa, true)),
      db.select().from(e.incidentes).where(inArray(e.incidentes.estado, ['abierto', 'despachado', 'en_sitio', 'controlado'])),
      db.select().from(e.geocercas).where(eq(e.geocercas.activa, true)),
    ]);
    datos.camaras = camaras.map((c) => ({ id: c.id, nombre: c.nombre, lat: c.lat, lng: c.lng, conectada: !!c.urlStream }));
    datos.incidentes = incidentes.map((i) => ({ id: i.id, codigo: i.codigo, titulo: i.titulo, lat: i.lat, lng: i.lng, prioridad: i.prioridad, estado: i.estado }));
    datos.geocercas = geocercas.map((g) => ({ id: g.id, nombre: g.nombre, nivel: g.nivel, color: g.color, coords: g.poligono.map(([lng, lat]) => [lat, lng] as [number, number]) }));
  }
  return datos;
}
