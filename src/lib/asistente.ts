import 'server-only';

import { generateText, isStepCount, tool, type ModelMessage } from 'ai';
import { and, count, desc, eq, gte, isNull, or } from 'drizzle-orm';
import { z } from 'zod';

import { db, esquema as e } from '@/db';
import type { Gravedad } from '@/db/esquema';
import { entrenar, pronosticar, type Modelo } from '@/lib/analitica/riesgo';
import { gravedadEnTexto, intencion, periodoEnTexto, sinTildes } from '@/lib/asistente-reglas';
import { matrizHoraDia, ranking, resumen } from '@/lib/consultas';
import { GRAVEDAD, NOVEDAD } from '@/lib/etiquetas';
import { barrioEnTexto, distanciaM } from '@/lib/geo';
import { DIAS_SEMANA, formatoFecha, partesLocales, periodoAnterior, resolverPeriodo, variacion, type Periodo } from '@/lib/tiempo';

/**
 * Asistente de siniestralidad vial.
 *
 * Con el AI Gateway disponible, un modelo responde usando herramientas que
 * consultan la base (nunca inventa cifras). Sin gateway, o si falla, responde
 * un modo de respaldo por reglas que reconoce la intencion y contesta con los
 * mismos datos reales.
 */

export const MODELO = 'anthropic/claude-haiku-4.5';
export type Mensaje = { rol: 'usuario' | 'asistente'; texto: string };
export type Respuesta = { respuesta: string; modo: 'ia' | 'respaldo'; demo: boolean };

const n = (x: number) => x.toLocaleString('es-CO');
const GRAVEDADES = ['solo_danos', 'leve', 'grave', 'fatal'] as const;

// ─── Consultas que usan tanto la IA como el respaldo ────────────────────────

function periodoDe(clave?: string, desde?: string, hasta?: string): Periodo {
  if (desde || hasta) return resolverPeriodo({ periodo: 'rango', desde, hasta }, '12m');
  return resolverPeriodo({ periodo: clave ?? '12m' }, '12m');
}

async function proporcionDemo() {
  const [t] = await db.select({ n: count() }).from(e.siniestros);
  const [s] = await db.select({ n: count() }).from(e.siniestros).where(eq(e.siniestros.fuente, 'simulado'));
  return t.n ? s.n / t.n : 0;
}

export async function estadisticas(p: Periodo, barrio?: string | null, gravedad?: Gravedad | null) {
  const f = { periodo: p, barrio: barrio ?? null, gravedad: gravedad ?? null };
  const ant = periodoAnterior(p);
  const [actual, previo] = await Promise.all([resumen(f), ant ? resumen({ ...f, periodo: ant }) : null]);
  return {
    periodo: p.etiqueta, barrio: barrio ?? 'toda la ciudad', gravedad: gravedad ? GRAVEDAD[gravedad].texto : 'todas',
    siniestros: actual.total, heridos: actual.heridos, fallecidos: actual.fallecidos,
    porGravedad: Object.fromEntries(GRAVEDADES.map((g) => [GRAVEDAD[g].texto, actual.porGravedad[g]])),
    variacionVsPeriodoAnterior: previo ? variacion(actual.total, previo.total) : null,
  };
}

export async function criticos(p: Periodo) {
  const [barrios, corredores, matriz] = await Promise.all([ranking({ periodo: p }, 'barrio', 5), ranking({ periodo: p }, 'direccion', 5), matrizHoraDia({ periodo: p })]);
  const porHora = Array.from({ length: 24 }, (_, h) => matriz.reduce((s, d) => s + d[h], 0));
  const porDia = matriz.map((d) => d.reduce((s, x) => s + x, 0));
  const horas = porHora.map((v, h) => ({ hora: `${h}:00–${h}:59`, siniestros: v })).sort((a, b) => b.siniestros - a.siniestros).slice(0, 4);
  const dias = porDia.map((v, d) => ({ dia: DIAS_SEMANA[d], siniestros: v })).sort((a, b) => b.siniestros - a.siniestros).slice(0, 3);
  return {
    periodo: p.etiqueta,
    barrios: barrios.map((b) => ({ barrio: b.clave, siniestros: b.n, fatales: b.fatales })),
    corredores: corredores.filter((c) => !c.clave.startsWith('Sector') && c.clave !== 'Sin dato').map((c) => ({ via: c.clave, siniestros: c.n })),
    horas, dias,
  };
}

export async function puntosNegrosTop(limite = 5) {
  const filas = await db.select().from(e.puntosNegros).orderBy(e.puntosNegros.ranking).limit(limite);
  return filas.map((p) => ({ ranking: p.ranking, nombre: p.nombre, barrio: p.barrio, siniestros: p.total, fatales: p.fatales, graves: p.graves, indiceEPDO: Math.round(p.indice), intervencion: p.estadoIntervencion.replace(/_/g, ' ') }));
}

// El modelo de riesgo se entrena una vez cada 30 minutos por instancia.
let modelo: { m: Modelo; t: number } | null = null;
async function modeloRiesgo() {
  if (modelo && Date.now() - modelo.t < 30 * 60_000) return modelo.m;
  const desde = new Date(Date.now() - 2 * 365 * 86_400_000);
  const datos = await db.select({ lat: e.siniestros.lat, lng: e.siniestros.lng, ocurridoEn: e.siniestros.ocurridoEn, gravedad: e.siniestros.gravedad, clima: e.siniestros.clima })
    .from(e.siniestros).where(and(gte(e.siniestros.ocurridoEn, desde), eq(e.siniestros.estado, 'verificado')));
  modelo = { m: entrenar(datos), t: Date.now() };
  return modelo.m;
}

export async function riesgo(momento: Date, barrio?: string | null, lluvia = false) {
  const m = await modeloRiesgo();
  const p = pronosticar(m, momento, lluvia);
  const loc = partesLocales(momento);
  const cuando = `${DIAS_SEMANA[loc.diaSemana].toLowerCase()} ${formatoFecha(momento)} a las ${loc.hora}:00`;
  // Una entrada por barrio (varias celdas pueden caer en el mismo).
  const vistos = new Set<string>();
  const zonasMasAltas = p.filter((c) => !vistos.has(c.barrio) && vistos.add(c.barrio)).slice(0, 5).map((c) => ({ zona: c.barrio, nivel: c.nivel.replace('_', ' '), vecesSobreElPromedio: Math.round(c.relativo * 10) / 10 }));
  let enBarrio = null;
  if (barrio) {
    const b = barrioEnTexto(barrio);
    if (b) {
      const cercanas = p.filter((c) => distanciaM(c.lat, c.lng, b.lat, b.lng) < 900);
      const peor = cercanas[0];
      enBarrio = peor ? { barrio: b.nombre, nivel: peor.nivel.replace('_', ' '), vecesSobreElPromedio: Math.round(peor.relativo * 10) / 10 } : { barrio: b.nombre, nivel: 'bajo', vecesSobreElPromedio: 0 };
    }
  }
  return { momento: cuando, lluvia, zonasMasAltas, enBarrio, nota: 'Modelo de conteos (Poisson) entrenado con los últimos 2 años; el nivel es relativo a las demás zonas de la ciudad.' };
}

export async function novedadesActivas() {
  const ahora = new Date();
  const filas = await db.select().from(e.novedadesVia)
    .where(and(eq(e.novedadesVia.activa, true), or(isNull(e.novedadesVia.hasta), gte(e.novedadesVia.hasta, ahora))))
    .orderBy(desc(e.novedadesVia.desde)).limit(10);
  return filas.map((x) => ({ tipo: NOVEDAD[x.tipo], titulo: x.titulo, detalle: x.descripcion, hasta: x.hasta ? formatoFecha(x.hasta) : 'sin fecha de fin' }));
}

export async function comparativoAnual(anioA: number, anioB: number, barrio?: string | null) {
  const hoy = partesLocales(new Date());
  const [a, b] = await Promise.all([anioA, anioB].map(async (anio) => {
    // El año en curso se compara contra el mismo tramo del otro año (hasta la fecha de hoy).
    const p = resolverPeriodo({ periodo: `a${anio}` });
    return { anio, ...(await resumen({ periodo: p, barrio: barrio ?? null })) };
  }));
  const parcial = anioA === hoy.anio || anioB === hoy.anio;
  return {
    barrio: barrio ?? 'toda la ciudad',
    nota: parcial ? `El año ${hoy.anio} está en curso: sus cifras van hasta hoy.` : undefined,
    [anioA]: { siniestros: a.total, fallecidos: a.fallecidos, heridos: a.heridos },
    [anioB]: { siniestros: b.total, fallecidos: b.fallecidos, heridos: b.heridos },
    variacionSiniestros: variacion(b.total, a.total),
  };
}

// ─── Modo IA ────────────────────────────────────────────────────────────────

const zPeriodo = {
  periodo: z.string().optional().describe("Clave: hoy, 7d, 30d, 90d, mes, mes-anterior, anio, 12m, anio-anterior, hace-1-anio, todo, o aAAAA (p. ej. a2025)."),
  desde: z.string().optional().describe('Fecha inicial AAAA-MM-DD (rango personalizado).'),
  hasta: z.string().optional().describe('Fecha final AAAA-MM-DD (rango personalizado).'),
};

const herramientas = {
  estadisticas: tool({
    description: 'Totales de siniestros, heridos y fallecidos por periodo, con filtro opcional de barrio y gravedad, y variación frente al periodo anterior.',
    inputSchema: z.object({ ...zPeriodo, barrio: z.string().optional(), gravedad: z.enum(GRAVEDADES).optional() }),
    execute: async (i) => estadisticas(periodoDe(i.periodo, i.desde, i.hasta), i.barrio ? barrioEnTexto(i.barrio)?.nombre ?? i.barrio : null, i.gravedad ?? null),
  }),
  zonasYHorasCriticas: tool({
    description: 'Barrios, vías, horas y días de la semana con más siniestros en un periodo.',
    inputSchema: z.object(zPeriodo),
    execute: async (i) => criticos(periodoDe(i.periodo, i.desde, i.hasta)),
  }),
  puntosNegros: tool({
    description: 'Ranking de puntos negros (sitios donde se agrupan los siniestros) con su índice de gravedad y estado de intervención.',
    inputSchema: z.object({ limite: z.number().int().min(1).max(15).optional() }),
    execute: async (i) => puntosNegrosTop(i.limite ?? 5),
  }),
  riesgoPrevisto: tool({
    description: 'Riesgo previsto de siniestros para una fecha y hora (hora local de Cartagena), opcionalmente en un barrio y con lluvia.',
    inputSchema: z.object({
      fechaHora: z.string().optional().describe('AAAA-MM-DDTHH:mm en hora local. Vacío = ahora.'),
      barrio: z.string().optional(), lluvia: z.boolean().optional(),
    }),
    execute: async (i) => {
      let momento = new Date();
      if (i.fechaHora && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(i.fechaHora)) {
        const f = new Date(`${i.fechaHora.slice(0, 16)}:00-05:00`);
        if (!Number.isNaN(f.getTime())) momento = f;
      }
      return riesgo(momento, i.barrio, i.lluvia ?? false);
    },
  }),
  novedadesEnLaVia: tool({
    description: 'Obras, cierres, semáforos dañados, huecos e inundaciones vigentes.',
    inputSchema: z.object({}),
    execute: async () => novedadesActivas(),
  }),
  comparativoAnual: tool({
    description: 'Compara dos años (siniestros, fallecidos, heridos), opcionalmente en un barrio.',
    inputSchema: z.object({ anioA: z.number().int().min(2000).max(2100), anioB: z.number().int().min(2000).max(2100), barrio: z.string().optional() }),
    execute: async (i) => comparativoAnual(i.anioA, i.anioB, i.barrio ? barrioEnTexto(i.barrio)?.nombre ?? i.barrio : null),
  }),
};

function instrucciones(demo: boolean) {
  const hoy = partesLocales(new Date());
  return `Eres el asistente de Pulso Vial, un observatorio independiente de siniestralidad vial de Cartagena (Colombia).
Hoy es ${hoy.dia}/${hoy.mes + 1}/${hoy.anio} (hora de Colombia).
- Responde en español de Colombia, claro y breve (máximo 180 palabras), con viñetas cuando ayuden.
- Solo hablas de siniestralidad y seguridad vial en Cartagena. Si te preguntan otra cosa, dilo con amabilidad y ofrece lo que sí puedes responder.
- Toda cifra debe salir de una herramienta y debe ir con su periodo. Nunca inventes datos; si no hay datos, dilo.
- No te presentes como una entidad oficial ni hables en nombre de ninguna autoridad.
- Ante una emergencia, indica llamar al 123 antes que nada.
${demo ? '- IMPORTANTE: buena parte de los datos son de demostración (simulados). Acláralo al dar cifras.' : ''}`;
}

async function responderIA(mensajes: Mensaje[], demo: boolean) {
  const historial: ModelMessage[] = mensajes.map((m) => ({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: m.texto }));
  const r = await generateText({
    model: MODELO,
    instructions: instrucciones(demo),
    messages: historial,
    tools: herramientas,
    stopWhen: isStepCount(5),
    maxOutputTokens: 700,
    timeout: 25_000,
  });
  return r.text.trim();
}

// ─── Modo de respaldo por reglas ────────────────────────────────────────────

async function responderRespaldo(mensajes: Mensaje[], demo: boolean): Promise<string> {
  const ultimo = [...mensajes].reverse().find((m) => m.rol === 'usuario')?.texto ?? '';
  const tipo = intencion(ultimo);
  const clave = periodoEnTexto(ultimo);
  const barrio = barrioEnTexto(ultimo);
  const nota = demo ? '\n\nNota: buena parte de estos datos son de demostración (simulados).' : '';

  switch (tipo) {
    case 'emergencia':
      return 'Si hay personas heridas o la vía está en riesgo, llama ya al 123. Después puedes reportar el siniestro en «Reportar» para que quede registrado.';
    case 'comparar': {
      const anios = [...ultimo.matchAll(/\b(20[12]\d)\b/g)].map((m) => Number(m[1]));
      const actual = partesLocales(new Date()).anio;
      const [a, b] = anios.length >= 2 ? [anios[0], anios[1]] : [actual - 1, actual];
      const c = await comparativoAnual(Math.min(a, b), Math.max(a, b), barrio?.nombre);
      const x = c[Math.min(a, b)] as { siniestros: number; fallecidos: number; heridos: number };
      const y = c[Math.max(a, b)] as { siniestros: number; fallecidos: number; heridos: number };
      return `Comparativo ${Math.min(a, b)} frente a ${Math.max(a, b)} (${c.barrio}):\n• Siniestros: ${n(x.siniestros)} → ${n(y.siniestros)}${c.variacionSiniestros != null ? ` (${c.variacionSiniestros > 0 ? '+' : ''}${c.variacionSiniestros} %)` : ''}\n• Fallecidos: ${n(x.fallecidos)} → ${n(y.fallecidos)}\n• Heridos: ${n(x.heridos)} → ${n(y.heridos)}${c.nota ? `\n${c.nota}` : ''}${nota}`;
    }
    case 'riesgo': {
      const s = sinTildes(ultimo);
      let momento = new Date();
      const h = /(\d{1,2})\s*(?::\d{2})?\s*(am|pm|de la manana|de la tarde|de la noche)?/.exec(s.replace(/20[12]\d/g, ''));
      if (/manana/.test(s) && !/de la manana/.test(s)) momento = new Date(momento.getTime() + 86_400_000);
      if (h) {
        let hora = Number(h[1]);
        if ((h[2] === 'pm' || h[2] === 'de la tarde' || h[2] === 'de la noche') && hora < 12) hora += 12;
        if (hora <= 23) {
          const p = partesLocales(momento);
          momento = new Date(Date.UTC(p.anio, p.mes, p.dia, hora + 5));
        }
      } else if (/esta noche/.test(s)) {
        const p = partesLocales(momento);
        momento = new Date(Date.UTC(p.anio, p.mes, p.dia, 21 + 5));
      }
      const r = await riesgo(momento, barrio?.nombre, /lluv/.test(s));
      const zonas = r.zonasMasAltas.map((z) => `• ${z.zona}: ${z.nivel} (${n(z.vecesSobreElPromedio)}× el promedio)`).join('\n');
      return `Riesgo previsto para el ${r.momento}${r.lluvia ? ', con lluvia' : ''}:${r.enBarrio ? `\nEn ${r.enBarrio.barrio} el nivel es ${r.enBarrio.nivel}.` : ''}\nZonas con mayor riesgo:\n${zonas}\n${r.nota}${nota}`;
    }
    case 'novedades': {
      const nv = await novedadesActivas();
      if (!nv.length) return 'No hay novedades vigentes en la vía registradas en este momento.';
      return `Novedades vigentes en la vía:\n${nv.map((x) => `• ${x.tipo}: ${x.titulo}${x.detalle ? ` — ${x.detalle}` : ''} (hasta ${x.hasta})`).join('\n')}`;
    }
    case 'puntos': {
      const pn = await puntosNegrosTop(5);
      if (!pn.length) return 'Aún no hay puntos negros calculados.';
      return `Puntos negros con mayor índice de gravedad:\n${pn.map((p) => `• ${p.ranking}. ${p.nombre}: ${n(p.siniestros)} siniestros, ${p.fatales} fatales (intervención: ${p.intervencion})`).join('\n')}${nota}`;
    }
    case 'cuando':
    case 'donde': {
      const p = periodoDe(clave ?? '12m');
      const c = await criticos(p);
      if (tipo === 'cuando') {
        return `Cuándo ocurren más siniestros (${c.periodo.toLowerCase()}):\n• Horas: ${c.horas.map((h) => `${h.hora} (${n(h.siniestros)})`).join(', ')}\n• Días: ${c.dias.map((d) => `${d.dia} (${n(d.siniestros)})`).join(', ')}${nota}`;
      }
      return `Dónde se concentran los siniestros (${c.periodo.toLowerCase()}):\n${c.barrios.map((b) => `• ${b.barrio}: ${n(b.siniestros)}${b.fatales ? ` (${b.fatales} fatales)` : ''}`).join('\n')}${c.corredores.length ? `\nVías principales: ${c.corredores.map((v) => `${v.via} (${n(v.siniestros)})`).join(', ')}` : ''}${nota}`;
    }
    case 'consejos':
      return 'Recomendaciones para moverte más seguro en Cartagena:\n• Revisa la «Ruta segura» antes de salir: compara rutas por siniestros históricos.\n• Las horas pico de la tarde y las madrugadas de fin de semana concentran los casos más graves.\n• En moto: casco abrochado, luces encendidas y nada de zigzag entre carros.\n• Con lluvia, aumenta la distancia y baja la velocidad.\n• Como peatón, cruza por las esquinas y semáforos, y hazte visible de noche.\nSi presencias un siniestro, llama al 123 y luego repórtalo aquí.';
    case 'cuantos': {
      const p = periodoDe(clave ?? '30d');
      const g = gravedadEnTexto(ultimo);
      const s = await estadisticas(p, barrio?.nombre ?? null, g);
      const v = s.variacionVsPeriodoAnterior;
      return `${s.periodo}${barrio ? ` en ${barrio.nombre}` : ' en Cartagena'}${g ? ` (${GRAVEDAD[g].texto.toLowerCase()})` : ''}:\n• ${n(s.siniestros)} ${s.siniestros === 1 ? 'siniestro' : 'siniestros'}${v != null ? ` (${v > 0 ? '+' : ''}${v} % frente al periodo anterior)` : ''}\n• ${n(s.fallecidos)} ${s.fallecidos === 1 ? 'persona fallecida' : 'personas fallecidas'} y ${n(s.heridos)} ${s.heridos === 1 ? 'herida' : 'heridas'}${nota}`;
    }
    default:
      return 'Puedo responder preguntas sobre la siniestralidad vial de Cartagena. Por ejemplo:\n• ¿Cuántos siniestros hubo este mes en Bocagrande?\n• ¿En qué horas ocurren más siniestros?\n• ¿Cuáles son los puntos negros?\n• Compara 2024 con 2025.\n• ¿Qué riesgo hay mañana a las 6 pm con lluvia?\n• ¿Hay obras o cierres en la vía?';
  }
}

export const iaDisponible = () => !!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

export async function responder(mensajes: Mensaje[]): Promise<Respuesta> {
  const demo = (await proporcionDemo()) > 0.5;
  if (iaDisponible()) {
    try {
      const texto = await responderIA(mensajes, demo);
      if (texto) return { respuesta: texto, modo: 'ia', demo };
    } catch (err) {
      console.error('[asistente] gateway no disponible, se usa el respaldo:', err instanceof Error ? err.message : err);
    }
  }
  return { respuesta: await responderRespaldo(mensajes, demo), modo: 'respaldo', demo };
}

