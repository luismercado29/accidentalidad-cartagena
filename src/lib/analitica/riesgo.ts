/**
 * Prediccion de riesgo de siniestros.
 *
 * Modelo de conteos (Poisson) explicable, entrenado con el historico:
 *
 *   λ(celda, hora, dia) = tasa_base(celda) · f_hora(h) · f_dia(d) · f_lluvia
 *
 * - tasa_base: siniestros por hora en cada celda de ~400 m, con decaimiento
 *   temporal (vida media de 180 dias) para que pese mas lo reciente.
 * - f_hora y f_dia: cuanto se concentran los siniestros en esa hora y ese dia
 *   respecto al promedio, con suavizado para no sobreajustar horas con pocos datos.
 * - f_lluvia: proporcion de siniestros con lluvia frente a la frecuencia de lluvia.
 *
 * La probabilidad de al menos un siniestro en la celda durante la hora es 1 - e^(-λ).
 * Se valida con el PAI (indice de precision predictiva, usado en analitica policial):
 * que porcentaje de los siniestros de las ultimas semanas cayo en el 10 % de celdas
 * de mayor riesgo, dividido entre el 10 % del area.
 */
import type { Gravedad } from '@/db/esquema';
import { barrioMasCercano } from '@/lib/geo';
import { partesLocales } from '@/lib/tiempo';

export type Observacion = { lat: number; lng: number; ocurridoEn: Date; gravedad: Gravedad; clima?: string | null };

export const TAM_CELDA = 0.0036; // grados (~400 m)
const VIDA_MEDIA_DIAS = 180;
const SUAVIZADO = 8;

export type Celda = { clave: string; lat: number; lng: number; barrio: string; peso: number; graves: number; total: number };

export type Modelo = {
  celdas: Map<string, Celda>;
  fHora: number[];
  fDia: number[];
  fLluvia: number;
  horasObservadas: number;
  total: number;
};

const claveCelda = (lat: number, lng: number) => `${Math.floor(lat / TAM_CELDA)}:${Math.floor(lng / TAM_CELDA)}`;
const centroCelda = (clave: string) => {
  const [y, x] = clave.split(':').map(Number);
  return { lat: (y + 0.5) * TAM_CELDA, lng: (x + 0.5) * TAM_CELDA };
};

export function entrenar(datos: Observacion[], ahora = new Date()): Modelo {
  const celdas = new Map<string, Celda>();
  const porHora = new Array(24).fill(0);
  const porDia = new Array(7).fill(0);
  let conLluvia = 0, conClima = 0;
  let primero = ahora.getTime();

  for (const o of datos) {
    const t = o.ocurridoEn.getTime();
    if (t > ahora.getTime()) continue;
    primero = Math.min(primero, t);
    const edadDias = (ahora.getTime() - t) / 86_400_000;
    const peso = Math.pow(0.5, edadDias / VIDA_MEDIA_DIAS);
    const k = claveCelda(o.lat, o.lng);
    let c = celdas.get(k);
    if (!c) {
      const centro = centroCelda(k);
      c = { clave: k, ...centro, barrio: barrioMasCercano(centro.lat, centro.lng).nombre, peso: 0, graves: 0, total: 0 };
      celdas.set(k, c);
    }
    c.peso += peso;
    c.total++;
    if (o.gravedad === 'grave' || o.gravedad === 'fatal') c.graves++;
    const p = partesLocales(o.ocurridoEn);
    porHora[p.hora]++;
    porDia[p.diaSemana]++;
    if (o.clima) { conClima++; if (o.clima.startsWith('lluvia')) conLluvia++; }
  }

  const n = datos.length || 1;
  const fHora = porHora.map((c) => ((c + SUAVIZADO) / (n + 24 * SUAVIZADO)) * 24);
  const fDia = porDia.map((c) => ((c + SUAVIZADO) / (n + 7 * SUAVIZADO)) * 7);
  // En Cartagena llueve aprox. el 15 % de las horas; si la lluvia aparece en mas
  // siniestros que eso, aumenta el riesgo. Se limita para no exagerar con pocos datos.
  const fLluvia = conClima >= 30 ? Math.min(2.5, Math.max(1, conLluvia / conClima / 0.15)) : 1.4;

  // Horas "efectivas" observadas con el mismo decaimiento, para convertir peso en tasa por hora.
  const dias = Math.max(1, (ahora.getTime() - primero) / 86_400_000);
  const efectivos = (VIDA_MEDIA_DIAS / Math.LN2) * (1 - Math.pow(0.5, dias / VIDA_MEDIA_DIAS));
  return { celdas, fHora, fDia, fLluvia, horasObservadas: efectivos * 24, total: datos.length };
}

export type Pronostico = Celda & { lambda: number; probabilidad: number; relativo: number; nivel: 'bajo' | 'medio' | 'alto' | 'muy_alto' };

export function pronosticar(m: Modelo, momento: Date, lluvia = false): Pronostico[] {
  const p = partesLocales(momento);
  const factor = m.fHora[p.hora] * m.fDia[p.diaSemana] * (lluvia ? m.fLluvia : 1);
  const lista = [...m.celdas.values()].map((c) => {
    const lambda = (c.peso / m.horasObservadas) * factor;
    return { ...c, lambda, probabilidad: 1 - Math.exp(-lambda), relativo: 0, nivel: 'bajo' as Pronostico['nivel'] };
  });
  const media = lista.reduce((s, c) => s + c.lambda, 0) / (lista.length || 1);
  lista.sort((a, b) => b.lambda - a.lambda);
  lista.forEach((c, i) => {
    c.relativo = media ? c.lambda / media : 0;
    const q = i / lista.length;
    c.nivel = q < 0.05 ? 'muy_alto' : q < 0.15 ? 'alto' : q < 0.4 ? 'medio' : 'bajo';
  });
  return lista;
}

/** Siniestros esperados en toda la ciudad para cada hora de un dia. */
export function curvaDiaria(m: Modelo, dia: Date, lluvia = false) {
  const base = [...m.celdas.values()].reduce((s, c) => s + c.peso, 0) / m.horasObservadas;
  const { diaSemana } = partesLocales(dia);
  return m.fHora.map((fh, hora) => ({ hora, esperados: base * fh * m.fDia[diaSemana] * (lluvia ? m.fLluvia : 1) }));
}

/**
 * Validacion temporal: entrena con todo lo anterior a `corte` y mide sobre lo posterior.
 * PAI = (% de siniestros en el 10 % de celdas de mayor riesgo) / 10 %.
 */
export function validar(datos: Observacion[], corte: Date) {
  const entrenamiento = datos.filter((o) => o.ocurridoEn < corte);
  const prueba = datos.filter((o) => o.ocurridoEn >= corte);
  if (entrenamiento.length < 50 || prueba.length < 10) return null;
  const m = entrenar(entrenamiento, corte);
  const ranking = [...m.celdas.values()].sort((a, b) => b.peso - a.peso);
  const top = new Set(ranking.slice(0, Math.max(1, Math.ceil(ranking.length * 0.1))).map((c) => c.clave));
  const aciertos = prueba.filter((o) => top.has(claveCelda(o.lat, o.lng))).length;
  const tasa = aciertos / prueba.length;
  return { aciertos, prueba: prueba.length, tasa, pai: tasa / 0.1, celdas: ranking.length };
}
