/**
 * Filtro de tiempo comun a todos los modulos (siniestros, reportes, incidentes,
 * alertas, noticias, auditoria...). Vive en la URL (?periodo=30d o
 * ?periodo=rango&desde=2025-01-01&hasta=2025-03-31) para poder compartir y
 * guardar una consulta.
 *
 * Colombia no tiene horario de verano: la hora local es siempre UTC-5.
 */

export const DESFASE_MS = -5 * 3_600_000;
const DIA = 86_400_000;

export const PERIODOS = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: '24h', etiqueta: 'Últimas 24 horas' },
  { clave: '7d', etiqueta: 'Últimos 7 días' },
  { clave: '30d', etiqueta: 'Últimos 30 días' },
  { clave: '90d', etiqueta: 'Últimos 90 días' },
  { clave: 'mes', etiqueta: 'Este mes' },
  { clave: 'mes-anterior', etiqueta: 'Mes anterior' },
  { clave: 'anio', etiqueta: 'Este año' },
  { clave: '12m', etiqueta: 'Últimos 12 meses' },
  { clave: 'anio-anterior', etiqueta: 'Año anterior' },
  { clave: 'hace-1-anio', etiqueta: 'Hace un año (mismos 30 días)' },
  { clave: 'todo', etiqueta: 'Todo el historial' },
] as const;

export type ClavePeriodo = (typeof PERIODOS)[number]['clave'] | 'rango' | `a${number}`;

export type Periodo = {
  clave: ClavePeriodo;
  /** null = sin limite inferior (todo el historial) */
  desde: Date | null;
  /** Limite superior exclusivo */
  hasta: Date;
  etiqueta: string;
};

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function leer(p: Params, k: string) {
  const v = p instanceof URLSearchParams ? p.get(k) : p[k];
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

/** Medianoche local (Bogota) del dia que contiene `d`, como instante UTC. */
export function inicioDia(d: Date) {
  const local = d.getTime() + DESFASE_MS;
  return new Date(Math.floor(local / DIA) * DIA - DESFASE_MS);
}

/** Partes de la fecha en hora local de Cartagena. */
export function partesLocales(d: Date) {
  const l = new Date(d.getTime() + DESFASE_MS);
  return { anio: l.getUTCFullYear(), mes: l.getUTCMonth(), dia: l.getUTCDate(), hora: l.getUTCHours(), minuto: l.getUTCMinutes(), diaSemana: l.getUTCDay() };
}

/** Instante UTC de una fecha local (anio, mes 0-11, dia). */
export function fechaLocal(anio: number, mes: number, dia = 1, hora = 0) {
  return new Date(Date.UTC(anio, mes, dia, hora) - DESFASE_MS);
}

/** "2025-03-31" -> medianoche local de ese dia. */
export function parsearDia(texto: string | undefined): Date | null {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [a, m, d] = texto.split('-').map(Number);
  const f = fechaLocal(a, m - 1, d);
  return Number.isNaN(f.getTime()) || partesLocales(f).dia !== d ? null : f;
}

/** Medianoche local -> "2025-03-31" */
export function diaISO(d: Date) {
  const p = partesLocales(d);
  return `${p.anio}-${String(p.mes + 1).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`;
}

const fmtDia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Bogota' });

export function resolverPeriodo(params: Params, porDefecto: ClavePeriodo = '30d', ahora = new Date()): Periodo {
  const clave = (leer(params, 'periodo') ?? porDefecto) as ClavePeriodo;
  const hoy = inicioDia(ahora);
  const manana = new Date(hoy.getTime() + DIA);
  const { anio, mes } = partesLocales(ahora);
  const conocido = PERIODOS.find((p) => p.clave === clave);
  const r = (desde: Date | null, hasta: Date, etiqueta = conocido?.etiqueta ?? ''): Periodo => ({ clave, desde, hasta, etiqueta });

  switch (clave) {
    case 'hoy': return r(hoy, manana);
    case '24h': return r(new Date(ahora.getTime() - DIA), ahora);
    case '7d': return r(new Date(manana.getTime() - 7 * DIA), manana);
    case '30d': return r(new Date(manana.getTime() - 30 * DIA), manana);
    case '90d': return r(new Date(manana.getTime() - 90 * DIA), manana);
    case 'mes': return r(fechaLocal(anio, mes), manana);
    case 'mes-anterior': return r(fechaLocal(anio, mes - 1), fechaLocal(anio, mes));
    case 'anio': return r(fechaLocal(anio, 0), manana);
    case '12m': return r(fechaLocal(anio - 1, mes, partesLocales(ahora).dia + 1), manana);
    case 'anio-anterior': return r(fechaLocal(anio - 1, 0), fechaLocal(anio, 0), `Año ${anio - 1}`);
    case 'hace-1-anio': {
      const hasta = fechaLocal(anio - 1, mes, partesLocales(ahora).dia + 1);
      return r(new Date(hasta.getTime() - 30 * DIA), hasta);
    }
    case 'todo': return r(null, manana);
    case 'rango': {
      const d = parsearDia(leer(params, 'desde'));
      const h = parsearDia(leer(params, 'hasta'));
      if (!d && !h) break;
      const desde = d && h && d > h ? h : d;
      const hastaDia = d && h && d > h ? d : h;
      const hasta = hastaDia ? new Date(hastaDia.getTime() + DIA) : manana;
      const etiqueta = `${desde ? fmtDia.format(desde) : 'Inicio'} – ${fmtDia.format(new Date(hasta.getTime() - DIA))}`;
      return { clave, desde, hasta, etiqueta };
    }
    default: {
      const m = /^a(\d{4})$/.exec(clave);
      if (m) {
        const a = Number(m[1]);
        if (a >= 2000 && a <= anio) return r(fechaLocal(a, 0), fechaLocal(a + 1, 0), `Año ${a}`);
      }
    }
  }
  return resolverPeriodo({ periodo: porDefecto }, porDefecto === clave ? '30d' : porDefecto, ahora);
}

/** El periodo inmediatamente anterior de igual duracion (para comparar). */
export function periodoAnterior(p: Periodo): Periodo | null {
  if (!p.desde) return null;
  const dur = p.hasta.getTime() - p.desde.getTime();
  return { clave: 'rango', desde: new Date(p.desde.getTime() - dur), hasta: p.desde, etiqueta: 'periodo anterior' };
}

/** El mismo periodo un año antes. */
export function mismoPeriodoAnioAnterior(p: Periodo): Periodo | null {
  if (!p.desde) return null;
  const menosUnAnio = (d: Date) => {
    const x = partesLocales(d);
    return new Date(fechaLocal(x.anio - 1, x.mes, x.dia).getTime() + (d.getTime() - fechaLocal(x.anio, x.mes, x.dia).getTime()));
  };
  return { clave: 'rango', desde: menosUnAnio(p.desde), hasta: menosUnAnio(p.hasta), etiqueta: 'mismo periodo del año anterior' };
}

/** Variacion porcentual redondeada; null si no hay base. */
export function variacion(actual: number, anterior: number) {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

/** Parametros de URL que representan un periodo (para conservarlo al navegar o exportar). */
export function paramsPeriodo(params: Params) {
  const u = new URLSearchParams();
  for (const k of ['periodo', 'desde', 'hasta']) {
    const v = leer(params, k);
    if (v) u.set(k, v);
  }
  return u;
}

const fmtFechaHora = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });
const fmtFecha = fmtDia;
const fmtHora = new Intl.DateTimeFormat('es-CO', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota' });

export const formatoFechaHora = (d: Date | string) => fmtFechaHora.format(new Date(d));
export const formatoFecha = (d: Date | string) => fmtFecha.format(new Date(d));
export const formatoHora = (d: Date | string) => fmtHora.format(new Date(d));

/** "hace 5 min", "hace 3 h", "hace 2 d" */
export function hace(d: Date | string, ahora = new Date()) {
  const min = Math.floor((ahora.getTime() - new Date(d).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dias = Math.floor(h / 24);
  if (dias < 60) return `hace ${dias} d`;
  return formatoFecha(d);
}

export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
