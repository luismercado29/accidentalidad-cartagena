/**
 * Importacion de historicos: deteccion de columnas, normalizacion de valores en
 * español (sinonimos) y validacion por fila. Es codigo puro: lo usa el navegador
 * para la vista previa y el servidor para volver a validar antes de guardar.
 */
import type { Clase, Gravedad, Vehiculo } from '@/db/esquema';
import { barrioMasCercano, dentroDeCartagena } from '@/lib/geo';
import { fechaLocal } from '@/lib/tiempo';

export const CAMPOS = [
  { clave: 'fecha', texto: 'Fecha', requerido: true, sinonimos: ['fecha', 'fecha_hora', 'fecha hora', 'fecha del siniestro', 'fecha accidente', 'date', 'dia'] },
  { clave: 'hora', texto: 'Hora', requerido: false, sinonimos: ['hora', 'hora del siniestro', 'time', 'hora accidente'] },
  { clave: 'lat', texto: 'Latitud', requerido: true, sinonimos: ['lat', 'latitud', 'latitude', 'y', 'coord_y'] },
  { clave: 'lng', texto: 'Longitud', requerido: true, sinonimos: ['lng', 'lon', 'long', 'longitud', 'longitude', 'x', 'coord_x'] },
  { clave: 'barrio', texto: 'Barrio', requerido: false, sinonimos: ['barrio', 'sector', 'localidad', 'zona', 'comuna'] },
  { clave: 'direccion', texto: 'Dirección', requerido: false, sinonimos: ['direccion', 'dirección', 'ubicacion', 'ubicación', 'lugar', 'via', 'vía', 'address'] },
  { clave: 'gravedad', texto: 'Gravedad', requerido: true, sinonimos: ['gravedad', 'severidad', 'clase de gravedad', 'tipo gravedad', 'resultado'] },
  { clave: 'clase', texto: 'Clase de siniestro', requerido: false, sinonimos: ['clase', 'clase accidente', 'clase de siniestro', 'tipo', 'tipo accidente', 'tipo de siniestro'] },
  { clave: 'vehiculo', texto: 'Vehículos', requerido: false, sinonimos: ['vehiculo', 'vehículo', 'vehiculos', 'vehículos', 'tipo_vehiculo', 'tipo vehiculo', 'actores'] },
  { clave: 'heridos', texto: 'Heridos', requerido: false, sinonimos: ['heridos', 'lesionados', 'num heridos', 'n_heridos'] },
  { clave: 'fallecidos', texto: 'Fallecidos', requerido: false, sinonimos: ['fallecidos', 'muertos', 'victimas fatales', 'víctimas fatales', 'num muertos'] },
  { clave: 'clima', texto: 'Clima', requerido: false, sinonimos: ['clima', 'condicion climatica', 'condición climática', 'tiempo atmosferico'] },
  { clave: 'descripcion', texto: 'Descripción', requerido: false, sinonimos: ['descripcion', 'descripción', 'observaciones', 'detalle', 'hechos', 'notas'] },
] as const;

export type ClaveCampo = (typeof CAMPOS)[number]['clave'];
export type Mapeo = Partial<Record<ClaveCampo, number>>;
export type Celda = string | number | boolean | Date | null | undefined;

export const MAX_FILAS = 20_000;

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const limpio = (s: string) => sinTildes(s).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ');

/** Asigna cada campo a la columna cuyo encabezado se parece mas. */
export function detectarColumnas(encabezados: string[]): Mapeo {
  const mapeo: Mapeo = {};
  const usados = new Set<number>();
  const normal = encabezados.map((h) => limpio(String(h ?? '')));
  // Primero coincidencias exactas, despues las que contienen el sinonimo.
  for (const pasada of ['exacta', 'contiene'] as const) {
    for (const c of CAMPOS) {
      if (mapeo[c.clave] != null) continue;
      const i = normal.findIndex((h, idx) => !usados.has(idx) && c.sinonimos.some((s) => {
        const sn = limpio(s);
        return pasada === 'exacta' ? h === sn : sn.length > 2 && h.includes(sn);
      }));
      if (i >= 0) { mapeo[c.clave] = i; usados.add(i); }
    }
  }
  return mapeo;
}

export function normalizarGravedad(v: Celda): Gravedad | null {
  const s = limpio(String(v ?? ''));
  if (!s) return null;
  if (/(fatal|muert|fallec|mortal|homicid)/.test(s)) return 'fatal';
  if (/(grave|hospitaliz|severo)/.test(s)) return 'grave';
  if (/(solo dan|dano|danos|material|latas|sin herid)/.test(s)) return 'solo_danos';
  if (/(leve|herid|lesion|menor)/.test(s)) return 'leve';
  return null;
}

export function normalizarClase(v: Celda): Clase {
  const s = limpio(String(v ?? ''));
  if (/(atropell|arroll|peaton)/.test(s)) return 'atropello';
  if (/(volc)/.test(s)) return 'volcamiento';
  if (/(caida|ocupante)/.test(s)) return 'caida_ocupante';
  if (/(incend)/.test(s)) return 'incendio';
  if (/(choque|colision|estrell|impact)/.test(s) || !s) return 'choque';
  return 'otro';
}

const SINONIMOS_VEHICULO: [RegExp, Vehiculo][] = [
  [/(moto|motocic|motociclet|motorizad)/, 'motocicleta'],
  [/(taxi)/, 'taxi'],
  [/(bus|buseta|microbus|colectivo|transporte publico)/, 'bus'],
  [/(camion|tractomula|volqueta|furgon|carga)/, 'camion'],
  [/(bici|cicla|ciclista)/, 'bicicleta'],
  [/(peaton)/, 'peaton'],
  [/(auto|carro|automovil|campero|camioneta|particular)/, 'automovil'],
];

export function normalizarVehiculos(v: Celda): Vehiculo[] {
  const partes = limpio(String(v ?? '')).split(/[,;/+|]| y /).map((x) => x.trim()).filter(Boolean);
  const res = new Set<Vehiculo>();
  for (const p of partes) {
    const m = SINONIMOS_VEHICULO.find(([re]) => re.test(p));
    res.add(m ? m[1] : 'otro');
  }
  return [...res];
}

export function normalizarClima(v: Celda): string | null {
  const s = limpio(String(v ?? ''));
  if (!s) return null;
  if (/(fuerte|torrencial|aguacero|tormenta)/.test(s)) return 'lluvia_fuerte';
  if (/(lluv|llovizna)/.test(s)) return 'lluvia';
  if (/(nubl)/.test(s)) return 'nublado';
  if (/(sol|despejado|normal|seco)/.test(s)) return 'soleado';
  return null;
}

export function numero(v: Celda): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.includes('.') && s.includes(',')) {
    // El ultimo separador es el decimal: "1.234,5" o "1,234.5".
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Hora y minuto desde "14:35", "2:35 pm", "1435" o una fraccion de dia de Excel. */
export function parsearHora(v: Celda): [number, number] | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return [v.getUTCHours(), v.getUTCMinutes()];
  if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return [Math.floor(m / 60) % 24, m % 60]; }
  const s = sinTildes(String(v)).replace(/\./g, '');
  const m = /^(\d{1,2})(?::?(\d{2}))?(?::\d{2})?\s*(am|pm|a m|p m)?$/.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const sufijo = m[3]?.replace(' ', '');
  if (sufijo === 'pm' && h < 12) h += 12;
  if (sufijo === 'am' && h === 12) h = 0;
  return h < 24 && min < 60 ? [h, min] : null;
}

/**
 * Fecha (y hora si viene incluida) en hora local de Cartagena.
 * Acepta Date (Excel), "2025-03-14", "14/03/2025", "14-03-2025 18:20" y numeros de serie de Excel.
 */
export function parsearFecha(v: Celda): { anio: number; mes: number; dia: number; hora?: [number, number] } | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // read-excel-file entrega las fechas como UTC "de pared": se leen tal cual.
    const conHora = v.getUTCHours() || v.getUTCMinutes();
    return { anio: v.getUTCFullYear(), mes: v.getUTCMonth(), dia: v.getUTCDate(), hora: conHora ? [v.getUTCHours(), v.getUTCMinutes()] : undefined };
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86_400_000));
    return parsearFecha(d);
  }
  const s = String(v).trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](.+))?$/.exec(s);
  let anio: number, mes: number, dia: number, resto: string | undefined;
  if (m) { anio = +m[1]; mes = +m[2]; dia = +m[3]; resto = m[4]; }
  else {
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s+(.+))?$/.exec(s);
    if (!m) return null;
    dia = +m[1]; mes = +m[2]; anio = +m[3]; resto = m[4];
    if (anio < 100) anio += 2000;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || anio < 1990 || anio > 2100) return null;
  const f = new Date(Date.UTC(anio, mes - 1, dia));
  if (f.getUTCDate() !== dia) return null;
  const hora = resto ? parsearHora(resto.replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/, '')) : null;
  return { anio, mes: mes - 1, dia, hora: hora ?? undefined };
}

export type FilaImportada = {
  ocurridoEn: string; // ISO
  lat: number; lng: number;
  barrio: string; direccion: string | null;
  gravedad: Gravedad; clase: Clase; vehiculos: Vehiculo[];
  heridos: number; fallecidos: number;
  clima: string | null; descripcion: string | null;
};

const texto = (v: Celda, max: number) => {
  if (v == null) return null;
  const s = (v instanceof Date ? v.toISOString() : String(v)).trim();
  return s ? s.slice(0, max) : null;
};

/** Valida y normaliza una fila; devuelve la fila lista o la lista de errores. */
export function procesarFila(fila: Celda[], mapeo: Mapeo, ahora = new Date()): { fila?: FilaImportada; errores: string[] } {
  const errores: string[] = [];
  const val = (k: ClaveCampo) => (mapeo[k] == null ? null : fila[mapeo[k]!]);

  const f = parsearFecha(val('fecha'));
  if (!f) errores.push('Fecha inválida o vacía');
  const hora = parsearHora(val('hora')) ?? f?.hora ?? [12, 0];
  let lat = numero(val('lat'));
  let lng = numero(val('lng'));
  // Columnas invertidas: en Cartagena la latitud es ~10 y la longitud ~-75.
  if (lat != null && lng != null && Math.abs(lat) > 50 && Math.abs(lng) < 50) [lat, lng] = [lng, lat];
  if (lat == null || lng == null) errores.push('Coordenadas vacías');
  else if (!dentroDeCartagena(lat, lng)) errores.push('Coordenadas fuera de Cartagena');
  const gravedad = normalizarGravedad(val('gravedad'));
  if (!gravedad) errores.push('Gravedad no reconocida');

  let heridos = Math.max(0, Math.round(numero(val('heridos')) ?? 0));
  let fallecidos = Math.max(0, Math.round(numero(val('fallecidos')) ?? 0));
  if (gravedad === 'fatal' && fallecidos === 0) fallecidos = 1;
  if ((gravedad === 'leve' || gravedad === 'grave') && heridos === 0) heridos = 1;
  if (gravedad === 'solo_danos' && (heridos || fallecidos)) errores.push('«Solo daños» no puede tener víctimas');
  if (fallecidos > 0 && gravedad && gravedad !== 'fatal') errores.push('Hay fallecidos pero la gravedad no es fatal');
  if (heridos > 99 || fallecidos > 99) errores.push('Número de víctimas fuera de rango');

  let ocurrido: Date | null = null;
  if (f) {
    ocurrido = new Date(fechaLocal(f.anio, f.mes, f.dia).getTime() + hora[0] * 3_600_000 + hora[1] * 60_000);
    if (ocurrido.getTime() > ahora.getTime() + 5 * 60_000) errores.push('La fecha está en el futuro');
  }
  if (errores.length || !ocurrido || lat == null || lng == null || !gravedad) return { errores };

  const vehiculos = normalizarVehiculos(val('vehiculo'));
  return {
    errores,
    fila: {
      ocurridoEn: ocurrido.toISOString(), lat, lng,
      barrio: texto(val('barrio'), 120) ?? barrioMasCercano(lat, lng).nombre,
      direccion: texto(val('direccion'), 200),
      gravedad,
      clase: vehiculos.includes('peaton') && mapeo.clase == null ? 'atropello' : normalizarClase(val('clase')),
      vehiculos, heridos, fallecidos,
      clima: normalizarClima(val('clima')),
      descripcion: texto(val('descripcion'), 2000),
    },
  };
}

/** Parser CSV (RFC 4180) con deteccion de separador: coma, punto y coma o tabulador. */
export function parsearCsv(contenido: string): string[][] {
  const t = contenido.replace(/^﻿/, '');
  const primera = t.slice(0, t.indexOf('\n') > 0 ? t.indexOf('\n') : t.length);
  const sep = [';', '\t', ','].map((s) => [s, primera.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const filas: string[][] = [];
  let fila: string[] = [], campo = '', comillas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (comillas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else comillas = false; }
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === sep) { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x.trim() !== '')) filas.push(fila);
      fila = [];
    } else campo += c;
  }
  fila.push(campo);
  if (fila.some((x) => x.trim() !== '')) filas.push(fila);
  return filas;
}

export const PLANTILLA_CSV = [
  'fecha;hora;latitud;longitud;barrio;direccion;gravedad;clase;vehiculos;heridos;fallecidos;clima;descripcion',
  '2025-03-14;18:20;10.4110;-75.4990;Los Ejecutivos;Av. Pedro de Heredia;grave;choque;moto, bus;2;0;lluvia;Choque entre motocicleta y bus',
  '14/03/2025;07:45;10,4236;-75,5506;Centro Histórico;Av. Santander;solo daños;choque;carro;0;0;soleado;Choque simple sin heridos',
].join('\r\n');
