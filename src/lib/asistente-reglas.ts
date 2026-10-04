/** Reglas del modo de respaldo del asistente (puras: se prueban sin base de datos). */
import type { Gravedad } from '@/db/esquema';
import { barrioEnTexto } from '@/lib/geo';

export const sinTildes = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Lee el periodo mencionado en el texto (o null). */
export function periodoEnTexto(t: string): string | null {
  const s = sinTildes(t);
  const anio = /\b(20[12]\d)\b/.exec(s);
  if (/hace un ano/.test(s)) return 'hace-1-anio';
  if (anio) return `a${anio[1]}`;
  if (/\bhoy\b/.test(s)) return 'hoy';
  if (/(ultim[oa]s? 24|ayer)/.test(s)) return '24h';
  if (/(esta semana|ultimos? 7|ultima semana)/.test(s)) return '7d';
  if (/(mes pasado|mes anterior)/.test(s)) return 'mes-anterior';
  if (/este mes/.test(s)) return 'mes';
  if (/(ultimos? 30|ultimo mes)/.test(s)) return '30d';
  if (/(ultimos? 90|trimestre|tres meses)/.test(s)) return '90d';
  if (/(ano pasado|ano anterior)/.test(s)) return 'anio-anterior';
  if (/(este ano|en lo que va del ano)/.test(s)) return 'anio';
  if (/(ultimos? 12|ultimo ano)/.test(s)) return '12m';
  if (/(siempre|historico|todo el historial|desde el inicio)/.test(s)) return 'todo';
  return null;
}

export function intencion(t: string) {
  const s = sinTildes(t);
  if (/\b(emergencia|auxilio|ayuda urgente|acaba de pasar|esta pasando)\b/.test(s)) return 'emergencia';
  if (/(compar|\bvs\b|versus|frente a|contra el)/.test(s)) return 'comparar';
  if (/(riesgo|peligros|probab|predic|pronost|manana|esta noche)/.test(s)) return 'riesgo';
  if (/(obra|cierre|cerrad|hueco|semaforo|inundac|desvio|novedad)/.test(s)) return 'novedades';
  if (/(punto(s)? negro|sitio(s)? critico|intervenc)/.test(s)) return 'puntos';
  if (/(cuando|hora|horario|que dia|dias? de la semana|madrugada|noche)/.test(s)) return 'cuando';
  if (/(donde|barrio|zona|sector|via(s)?\b|avenida|lugar)/.test(s) && !barrioEnTexto(t)) return 'donde';
  if (/(consejo|recomend|como evit|prevenir|tips|seguro|segura)/.test(s)) return 'consejos';
  if (/(cuant|total|cifra|numero|muert|fallec|herid|estadistic|siniestr|accidente)/.test(s)) return 'cuantos';
  return 'ayuda';
}

export function gravedadEnTexto(t: string): Gravedad | null {
  const s = sinTildes(t);
  if (/(muert|fallec|fatal|mortal)/.test(s)) return 'fatal';
  if (/grave/.test(s)) return 'grave';
  if (/leve/.test(s)) return 'leve';
  return null;
}

