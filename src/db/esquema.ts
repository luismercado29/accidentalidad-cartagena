/**
 * Esquema de Pulso Vial.
 *
 * Todas las tablas viven en el esquema de Postgres "vial". Asi conviven con las
 * tablas de la version anterior (esquema public), que no se tocan: la migracion
 * de datos solo las lee (ver preparar.ts).
 */
import { sql } from 'drizzle-orm';
import {
  boolean, doublePrecision, index, integer, jsonb, pgSchema, primaryKey, serial, smallint, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

export const vial = pgSchema('vial');

// ─── Catalogos ──────────────────────────────────────────────────────────────

export const ROLES = ['admin', 'supervisor', 'operador', 'analista', 'ciudadano'] as const;
export type Rol = (typeof ROLES)[number];
/** Roles que entran a la consola de gestion. */
export const ROLES_EQUIPO: Rol[] = ['admin', 'supervisor', 'operador', 'analista'];

export const GRAVEDADES = ['solo_danos', 'leve', 'grave', 'fatal'] as const;
export type Gravedad = (typeof GRAVEDADES)[number];

export const CLASES = ['choque', 'atropello', 'volcamiento', 'caida_ocupante', 'incendio', 'otro'] as const;
export type Clase = (typeof CLASES)[number];

export const VEHICULOS = ['motocicleta', 'automovil', 'bus', 'camion', 'taxi', 'bicicleta', 'peaton', 'otro'] as const;
export type Vehiculo = (typeof VEHICULOS)[number];

export const FUENTES_SINIESTRO = ['manual', 'ciudadano', 'importado', 'externo', 'camara', 'legado', 'simulado'] as const;
export const ESTADOS_SINIESTRO = ['pendiente', 'verificado', 'descartado'] as const;

export const ESTADOS_REPORTE = ['recibido', 'en_revision', 'verificado', 'descartado', 'duplicado'] as const;
export type EstadoReporte = (typeof ESTADOS_REPORTE)[number];
export const CANALES_REPORTE = ['web', 'qr', 'whatsapp', 'externo'] as const;

export const PRIORIDADES = ['baja', 'media', 'alta', 'critica'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export const ESTADOS_INCIDENTE = ['abierto', 'despachado', 'en_sitio', 'controlado', 'cerrado', 'cancelado'] as const;
export type EstadoIncidente = (typeof ESTADOS_INCIDENTE)[number];

export const TIPOS_UNIDAD = ['agente', 'motorizado', 'grua', 'ambulancia', 'patrulla'] as const;
export const ESTADOS_UNIDAD = ['disponible', 'asignada', 'fuera_servicio'] as const;

export const ESTADOS_INTERVENCION = ['sin_intervenir', 'en_estudio', 'en_intervencion', 'intervenido'] as const;
export const NIVELES_ALERTA = ['bajo', 'medio', 'alto', 'critico'] as const;
export const TIPOS_CAMARA = ['hls', 'mjpeg', 'imagen', 'embed'] as const;
export const TIPOS_FUENTE = ['rss', 'manual', 'whatsapp'] as const;
export const ESTADOS_NOTICIA = ['nueva', 'vinculada', 'convertida', 'descartada'] as const;
export const TIPOS_NOVEDAD = ['obra', 'cierre', 'semaforo_danado', 'hueco', 'inundacion', 'evento', 'otro'] as const;

/** Ajustes de accesibilidad (tambien viven en una cookie para pintarlos sin parpadeo). */
export type PreferenciasAccesibilidad = {
  tamanoTexto: 100 | 125 | 150 | 175 | 200;
  altoContraste: boolean;
  fuenteLegible: boolean;
  subrayarEnlaces: boolean;
  reducirMovimiento: boolean;
  interlineado: 'normal' | 'amplio';
  velocidadVoz: number;
};

const creado = () => timestamp('creado', { withTimezone: true }).notNull().defaultNow();

// ─── Personas ───────────────────────────────────────────────────────────────

export const usuarios = vial.table('usuarios', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  usuario: text('usuario').notNull(),
  email: text('email').notNull(),
  hashClave: text('hash_clave').notNull(),
  rol: text('rol', { enum: ROLES }).notNull().default('ciudadano'),
  activo: boolean('activo').notNull().default(true),
  accesibilidad: jsonb('accesibilidad').$type<Partial<PreferenciasAccesibilidad>>().notNull().default({}),
  legadoId: integer('legado_id').unique(),
  ultimoIngreso: timestamp('ultimo_ingreso', { withTimezone: true }),
  creado: creado(),
}, (t) => [
  uniqueIndex('usuarios_usuario_unico').on(sql`lower(${t.usuario})`),
  uniqueIndex('usuarios_email_unico').on(sql`lower(${t.email})`),
]);

// ─── Siniestros (registro historico, estilo IPAT) ───────────────────────────

export const siniestros = vial.table('siniestros', {
  id: serial('id').primaryKey(),
  codigo: text('codigo').notNull().unique(), // SV-2026-000123
  ocurridoEn: timestamp('ocurrido_en', { withTimezone: true }).notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  barrio: text('barrio'),
  direccion: text('direccion'),
  gravedad: text('gravedad', { enum: GRAVEDADES }).notNull(),
  clase: text('clase', { enum: CLASES }).notNull().default('choque'),
  vehiculos: jsonb('vehiculos').$type<Vehiculo[]>().notNull().default([]),
  heridos: smallint('heridos').notNull().default(0),
  fallecidos: smallint('fallecidos').notNull().default(0),
  clima: text('clima'),
  estadoVia: text('estado_via'),
  iluminacion: text('iluminacion'),
  diaFestivo: boolean('dia_festivo').notNull().default(false),
  causaProbable: text('causa_probable'),
  descripcion: text('descripcion'),
  fuente: text('fuente', { enum: FUENTES_SINIESTRO }).notNull().default('manual'),
  estado: text('estado', { enum: ESTADOS_SINIESTRO }).notNull().default('verificado'),
  registradoPor: integer('registrado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  legadoId: integer('legado_id').unique(),
  creado: creado(),
  actualizado: timestamp('actualizado', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('siniestros_ocurrido').on(t.ocurridoEn),
  index('siniestros_gravedad').on(t.gravedad),
  index('siniestros_barrio').on(t.barrio),
]);

// ─── Reportes ciudadanos ────────────────────────────────────────────────────

export const puntosQr = vial.table('puntos_qr', {
  id: serial('id').primaryKey(),
  codigo: text('codigo').notNull().unique(),
  nombre: text('nombre').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  barrio: text('barrio'),
  escaneos: integer('escaneos').notNull().default(0),
  activo: boolean('activo').notNull().default(true),
  creado: creado(),
});

export const reportes = vial.table('reportes', {
  id: serial('id').primaryKey(),
  codigo: text('codigo').notNull().unique(), // codigo de seguimiento que recibe el ciudadano
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  direccion: text('direccion'),
  barrio: text('barrio'),
  descripcion: text('descripcion').notNull(),
  gravedadEstimada: text('gravedad_estimada', { enum: GRAVEDADES }).notNull().default('leve'),
  hayHeridos: boolean('hay_heridos').notNull().default(false),
  vehiculos: jsonb('vehiculos').$type<Vehiculo[]>().notNull().default([]),
  contactoNombre: text('contacto_nombre'),
  contactoTelefono: text('contacto_telefono'),
  canal: text('canal', { enum: CANALES_REPORTE }).notNull().default('web'),
  puntoQrId: integer('punto_qr_id').references(() => puntosQr.id, { onDelete: 'set null' }),
  usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
  estado: text('estado', { enum: ESTADOS_REPORTE }).notNull().default('recibido'),
  motivo: text('motivo'), // por que se descarto o se marco duplicado
  siniestroId: integer('siniestro_id').references(() => siniestros.id, { onDelete: 'set null' }),
  incidenteId: integer('incidente_id'),
  revisadoPor: integer('revisado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  revisadoEn: timestamp('revisado_en', { withTimezone: true }),
  creado: creado(),
}, (t) => [index('reportes_creado').on(t.creado), index('reportes_estado').on(t.estado)]);

// ─── Operacion: incidentes en curso y unidades ──────────────────────────────

export const incidentes = vial.table('incidentes', {
  id: serial('id').primaryKey(),
  codigo: text('codigo').notNull().unique(), // IN-2026-00045
  titulo: text('titulo').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  direccion: text('direccion'),
  barrio: text('barrio'),
  prioridad: text('prioridad', { enum: PRIORIDADES }).notNull().default('media'),
  estado: text('estado', { enum: ESTADOS_INCIDENTE }).notNull().default('abierto'),
  slaMin: smallint('sla_min').notNull().default(20), // minutos maximos para llegar al sitio
  siniestroId: integer('siniestro_id').references(() => siniestros.id, { onDelete: 'set null' }),
  reporteId: integer('reporte_id').references(() => reportes.id, { onDelete: 'set null' }),
  responsableId: integer('responsable_id').references(() => usuarios.id, { onDelete: 'set null' }),
  abiertoEn: timestamp('abierto_en', { withTimezone: true }).notNull().defaultNow(),
  despachadoEn: timestamp('despachado_en', { withTimezone: true }),
  enSitioEn: timestamp('en_sitio_en', { withTimezone: true }),
  cerradoEn: timestamp('cerrado_en', { withTimezone: true }),
  cierre: text('cierre'), // resumen al cerrar
  simulado: boolean('simulado').notNull().default(false),
}, (t) => [index('incidentes_estado').on(t.estado), index('incidentes_abierto').on(t.abiertoEn)]);

export const incidenteEventos = vial.table('incidente_eventos', {
  id: serial('id').primaryKey(),
  incidenteId: integer('incidente_id').notNull().references(() => incidentes.id, { onDelete: 'cascade' }),
  tipo: text('tipo').notNull(), // creado, estado, nota, unidad, prioridad
  texto: text('texto').notNull(),
  usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
  creado: creado(),
}, (t) => [index('eventos_incidente').on(t.incidenteId)]);

export const unidades = vial.table('unidades', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull().unique(), // "Agente 12", "Grua 3"
  tipo: text('tipo', { enum: TIPOS_UNIDAD }).notNull(),
  estado: text('estado', { enum: ESTADOS_UNIDAD }).notNull().default('disponible'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  actualizado: timestamp('actualizado', { withTimezone: true }).notNull().defaultNow(),
});

export const incidenteUnidades = vial.table('incidente_unidades', {
  incidenteId: integer('incidente_id').notNull().references(() => incidentes.id, { onDelete: 'cascade' }),
  unidadId: integer('unidad_id').notNull().references(() => unidades.id, { onDelete: 'cascade' }),
  asignadoEn: timestamp('asignado_en', { withTimezone: true }).notNull().defaultNow(),
  liberadoEn: timestamp('liberado_en', { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.incidenteId, t.unidadId, t.asignadoEn] })]);

// ─── Vigilancia: alertas por zona, geocercas, puntos negros, camaras ────────

export const zonasAlerta = vial.table('zonas_alerta', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  radioM: integer('radio_m').notNull().default(500),
  umbral: smallint('umbral').notNull().default(3), // eventos dentro de la ventana para disparar
  ventanaMin: integer('ventana_min').notNull().default(60),
  contacto: text('contacto'),
  activa: boolean('activa').notNull().default(true),
  creado: creado(),
});

export const alertas = vial.table('alertas', {
  id: serial('id').primaryKey(),
  zonaId: integer('zona_id').references(() => zonasAlerta.id, { onDelete: 'cascade' }),
  geocercaId: integer('geocerca_id'),
  titulo: text('titulo').notNull(),
  detalle: text('detalle').notNull(),
  nivel: text('nivel', { enum: NIVELES_ALERTA }).notNull().default('medio'),
  conteo: smallint('conteo').notNull().default(0),
  atendida: boolean('atendida').notNull().default(false),
  atendidaPor: integer('atendida_por').references(() => usuarios.id, { onDelete: 'set null' }),
  nota: text('nota'),
  creado: creado(),
}, (t) => [index('alertas_creado').on(t.creado)]);

export const geocercas = vial.table('geocercas', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  /** Anillo exterior en [lng, lat], como GeoJSON. */
  poligono: jsonb('poligono').$type<[number, number][]>().notNull(),
  nivel: text('nivel', { enum: NIVELES_ALERTA }).notNull().default('medio'),
  color: text('color').notNull().default('#B45309'),
  activa: boolean('activa').notNull().default(true),
  legadoId: integer('legado_id').unique(),
  creado: creado(),
});

export const puntosNegros = vial.table('puntos_negros', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  barrio: text('barrio'),
  radioM: integer('radio_m').notNull().default(150),
  total: integer('total').notNull().default(0),
  fatales: integer('fatales').notNull().default(0),
  graves: integer('graves').notNull().default(0),
  indice: doublePrecision('indice').notNull().default(0), // EPDO: danos equivalentes
  ranking: integer('ranking').notNull().default(0),
  estadoIntervencion: text('estado_intervencion', { enum: ESTADOS_INTERVENCION }).notNull().default('sin_intervenir'),
  notas: text('notas'),
  calculadoEn: timestamp('calculado_en', { withTimezone: true }).notNull().defaultNow(),
});

export const camaras = vial.table('camaras', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  urlStream: text('url_stream'), // vacio = conexion pendiente
  tipo: text('tipo', { enum: TIPOS_CAMARA }).notNull().default('hls'),
  descripcion: text('descripcion'),
  activa: boolean('activa').notNull().default(true),
  creado: creado(),
});

export const novedadesVia = vial.table('novedades_via', {
  id: serial('id').primaryKey(),
  tipo: text('tipo', { enum: TIPOS_NOVEDAD }).notNull(),
  titulo: text('titulo').notNull(),
  descripcion: text('descripcion'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  desde: timestamp('desde', { withTimezone: true }).notNull().defaultNow(),
  hasta: timestamp('hasta', { withTimezone: true }),
  activa: boolean('activa').notNull().default(true),
  creadoPor: integer('creado_por').references(() => usuarios.id, { onDelete: 'set null' }),
  creado: creado(),
});

// ─── Fuentes externas (noticias, redes, mensajeria) ─────────────────────────

export const fuentes = vial.table('fuentes', {
  id: serial('id').primaryKey(),
  nombre: text('nombre').notNull(),
  tipo: text('tipo', { enum: TIPOS_FUENTE }).notNull().default('rss'),
  url: text('url'),
  activa: boolean('activa').notNull().default(true),
  ultimaLectura: timestamp('ultima_lectura', { withTimezone: true }),
  ultimoError: text('ultimo_error'),
  creado: creado(),
});

export const noticias = vial.table('noticias', {
  id: serial('id').primaryKey(),
  fuenteId: integer('fuente_id').references(() => fuentes.id, { onDelete: 'set null' }),
  red: text('red'), // facebook, instagram, x, tiktok, prensa (para las cargadas a mano)
  titulo: text('titulo').notNull(),
  url: text('url').notNull().unique(),
  resumen: text('resumen'),
  publicadoEn: timestamp('publicado_en', { withTimezone: true }).notNull(),
  barrio: text('barrio'),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  gravedadDetectada: text('gravedad_detectada', { enum: GRAVEDADES }),
  relevancia: smallint('relevancia').notNull().default(0), // 0-100
  estado: text('estado', { enum: ESTADOS_NOTICIA }).notNull().default('nueva'),
  siniestroId: integer('siniestro_id').references(() => siniestros.id, { onDelete: 'set null' }),
  creado: creado(),
}, (t) => [index('noticias_publicado').on(t.publicadoEn)]);

// ─── Sistema ────────────────────────────────────────────────────────────────

export const notificaciones = vial.table('notificaciones', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }), // null = todo el equipo
  tipo: text('tipo', { enum: ['info', 'alerta', 'reporte', 'incidente', 'sistema'] }).notNull().default('info'),
  titulo: text('titulo').notNull(),
  mensaje: text('mensaje').notNull(),
  enlace: text('enlace'),
  leida: boolean('leida').notNull().default(false),
  creado: creado(),
}, (t) => [index('notificaciones_creado').on(t.creado)]);

export const auditoria = vial.table('auditoria', {
  id: serial('id').primaryKey(),
  usuarioId: integer('usuario_id').references(() => usuarios.id, { onDelete: 'set null' }),
  accion: text('accion').notNull(), // crear, editar, eliminar, ingresar, importar, exportar...
  entidad: text('entidad').notNull(),
  entidadId: text('entidad_id'),
  detalle: jsonb('detalle').$type<Record<string, unknown>>().notNull().default({}),
  creado: creado(),
}, (t) => [index('auditoria_creado').on(t.creado)]);

/** Ajustes clave-valor (modo demostracion, ultima simulacion, etc.). */
export const ajustes = vial.table('ajustes', {
  clave: text('clave').primaryKey(),
  valor: jsonb('valor').$type<unknown>().notNull(),
  actualizado: timestamp('actualizado', { withTimezone: true }).notNull().defaultNow(),
});
