import 'server-only';

import { and, eq, gte } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import { entrenar, validar, type Modelo, type Observacion } from '@/lib/analitica/riesgo';

const VIGENCIA_MS = 10 * 60_000;

type Entrenado = { modelo: Modelo; datos: Observacion[]; validacion: ReturnType<typeof validar>; entrenadoEn: Date };
const cache = globalThis as unknown as { __modeloRiesgo?: { valor: Promise<Entrenado>; hasta: number } };

async function construir(): Promise<Entrenado> {
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 3 * 365 * 86_400_000);
  const datos = await db.select({ lat: e.siniestros.lat, lng: e.siniestros.lng, ocurridoEn: e.siniestros.ocurridoEn, gravedad: e.siniestros.gravedad, clima: e.siniestros.clima })
    .from(e.siniestros).where(and(eq(e.siniestros.estado, 'verificado'), gte(e.siniestros.ocurridoEn, desde)));
  return {
    modelo: entrenar(datos, ahora),
    datos,
    // Validacion temporal: entrena hasta hace 8 semanas y mide sobre esas 8 semanas.
    validacion: validar(datos, new Date(ahora.getTime() - 56 * 86_400_000)),
    entrenadoEn: ahora,
  };
}

/** Modelo entrenado con el historico verificado de 3 años; se reentrena cada 10 minutos por proceso. */
export function modeloRiesgo() {
  const c = cache.__modeloRiesgo;
  if (c && c.hasta > Date.now()) return c.valor;
  const valor = construir();
  cache.__modeloRiesgo = { valor, hasta: Date.now() + VIGENCIA_MS };
  valor.catch(() => { cache.__modeloRiesgo = undefined; });
  return valor;
}
