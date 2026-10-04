/**
 * Prepara la base despues de migrar. Es idempotente: se ejecuta en cada despliegue.
 *
 * 1. Copia los datos de la version anterior (tablas del esquema public) sin modificarlas.
 * 2. Crea las cuentas del equipo si no existen (claves desde variables de entorno;
 *    en local se generan y se guardan en credenciales-local.local).
 * 3. Carga catalogos iniciales (unidades, zonas, camaras, fuentes, QR...) si estan vacios.
 * 4. Modo demostracion: completa el historico con siniestros simulados (marcados como tales).
 * 5. Calcula los puntos negros si no hay.
 *
 *   npm run db:preparar
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync } from 'node:fs';

import bcrypt from 'bcryptjs';
import { and, count, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

import { crearConexion, type BaseDeDatos } from './conexion';
import { crearAleatorio, generarSiniestros, ubicacion } from './demo';
import * as e from './esquema';
import { detectarPuntosNegros } from '../lib/analitica/puntos-negros';
import { BARRIOS, barrioMasCercano, CENTRO } from '../lib/geo';
import { fechaLocal, partesLocales } from '../lib/tiempo';

const db: BaseDeDatos = crearConexion();
const log = (...m: unknown[]) => console.log('[preparar]', ...m);

async function existeTabla(nombre: string) {
  const r = await db.execute(sql`select to_regclass(${nombre}) as t`);
  const filas = (Array.isArray(r) ? r : (r as unknown as { rows: { t: string | null }[] }).rows) as { t: string | null }[];
  return !!filas[0]?.t;
}

async function filas<T>(consulta: ReturnType<typeof sql>): Promise<T[]> {
  const r = await db.execute(consulta);
  return (Array.isArray(r) ? r : (r as unknown as { rows: T[] }).rows) as T[];
}

// ─── 1. Datos de la version anterior ────────────────────────────────────────

const VEHICULO_LEGADO: Record<string, e.Vehiculo> = {
  moto: 'motocicleta', motocicleta: 'motocicleta', automovil: 'automovil', carro: 'automovil', auto: 'automovil',
  bus: 'bus', autobus: 'bus', buseta: 'bus', camion: 'camion', taxi: 'taxi', bicicleta: 'bicicleta', peaton: 'peaton',
};

async function migrarLegado() {
  if (await existeTabla('public.accidentes')) {
    const ya = await db.select({ n: count() }).from(e.siniestros).where(eq(e.siniestros.fuente, 'legado'));
    if (ya[0].n === 0) {
      type Fila = { id: number; latitud: number; longitud: number; barrio: string | null; fecha_hora: string | Date; gravedad: string; tipo_vehiculo: string | null; clima: string | null; estado_via: string | null; dia_festivo: boolean | null; descripcion: string | null; estado: string | null };
      const viejos = await filas<Fila>(sql`select id, latitud, longitud, barrio, fecha_hora, gravedad, tipo_vehiculo, clima, estado_via, dia_festivo, descripcion, estado from public.accidentes`);
      const valores = viejos
        .filter((v) => Number.isFinite(v.latitud) && Number.isFinite(v.longitud))
        .map((v) => {
          const gravedad = (['leve', 'grave', 'fatal'].includes(v.gravedad) ? v.gravedad : 'leve') as e.Gravedad;
          const veh = VEHICULO_LEGADO[(v.tipo_vehiculo ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')];
          return {
            codigo: `SL-${String(v.id).padStart(6, '0')}`,
            // fecha_hora se guardaba sin zona (UTC por datetime.utcnow en el backend anterior).
            ocurridoEn: new Date(typeof v.fecha_hora === 'string' && !/[zZ+]/.test(v.fecha_hora.slice(10)) ? `${v.fecha_hora}Z` : v.fecha_hora),
            lat: v.latitud, lng: v.longitud,
            barrio: v.barrio || barrioMasCercano(v.latitud, v.longitud).nombre,
            gravedad,
            vehiculos: veh ? [veh] : [],
            heridos: gravedad === 'leve' || gravedad === 'grave' ? 1 : 0,
            fallecidos: gravedad === 'fatal' ? 1 : 0,
            clima: v.clima, estadoVia: v.estado_via, diaFestivo: !!v.dia_festivo,
            descripcion: v.descripcion,
            fuente: 'legado' as const,
            estado: (v.estado === 'pendiente' ? 'pendiente' : v.estado === 'rechazado' ? 'descartado' : 'verificado') as 'pendiente' | 'verificado' | 'descartado',
            legadoId: v.id,
          };
        });
      for (let i = 0; i < valores.length; i += 500) {
        await db.insert(e.siniestros).values(valores.slice(i, i + 500)).onConflictDoNothing();
      }
      log(`Siniestros de la version anterior copiados: ${valores.length}`);
    }
  }

  if (await existeTabla('public.usuarios')) {
    type U = { id: number; username: string; email: string; hashed_password: string; es_admin: boolean };
    const viejos = await filas<U>(sql`select id, username, email, hashed_password, es_admin from public.usuarios`);
    let n = 0;
    for (const u of viejos) {
      // Las cuentas administrativas anteriores usaban claves por defecto conocidas:
      // se copian desactivadas y como ciudadania; un admin las reactiva si hace falta.
      const r = await db.insert(e.usuarios).values({
        nombre: u.username, usuario: u.username, email: u.email, hashClave: u.hashed_password,
        rol: 'ciudadano', activo: !u.es_admin, legadoId: u.id,
      }).onConflictDoNothing().returning({ id: e.usuarios.id });
      n += r.length;
    }
    if (n) log(`Cuentas anteriores copiadas: ${n} (las administrativas, desactivadas)`);
  }

  if (await existeTabla('public.geocercas')) {
    type G = { id: number; nombre: string; descripcion: string | null; poligono_geojson: string; nivel_alerta: string | null; activa: boolean | null };
    const viejas = await filas<G>(sql`select id, nombre, descripcion, poligono_geojson, nivel_alerta, activa from public.geocercas`);
    for (const g of viejas) {
      try {
        const geo = JSON.parse(g.poligono_geojson);
        const anillo: [number, number][] = geo?.coordinates?.[0] ?? geo?.geometry?.coordinates?.[0] ?? geo;
        if (!Array.isArray(anillo) || anillo.length < 3) continue;
        await db.insert(e.geocercas).values({
          nombre: g.nombre, descripcion: g.descripcion, poligono: anillo,
          nivel: (e.NIVELES_ALERTA as readonly string[]).includes(g.nivel_alerta ?? '') ? (g.nivel_alerta as 'medio') : 'medio',
          activa: g.activa ?? true, legadoId: g.id,
        }).onConflictDoNothing();
      } catch { /* poligono invalido: se omite */ }
    }
  }
}

// ─── 2. Cuentas del equipo ──────────────────────────────────────────────────

const EQUIPO: { usuario: string; nombre: string; rol: e.Rol; variable: string }[] = [
  { usuario: 'luis.mercado', nombre: 'Luis Mercado', rol: 'admin', variable: 'CLAVE_ADMIN' },
  { usuario: 'supervisor', nombre: 'Supervisión de turno', rol: 'supervisor', variable: 'CLAVE_SUPERVISOR' },
  { usuario: 'operador', nombre: 'Centro de operación', rol: 'operador', variable: 'CLAVE_OPERADOR' },
  { usuario: 'analista', nombre: 'Análisis de datos', rol: 'analista', variable: 'CLAVE_ANALISTA' },
];

async function crearEquipo() {
  const remoto = !!process.env.DATABASE_URL;
  for (const m of EQUIPO) {
    const existe = await db.query.usuarios.findFirst({ where: sql`lower(${e.usuarios.usuario}) = ${m.usuario}`, columns: { id: true } });
    if (existe) continue;
    let clave = process.env[m.variable];
    if (!clave) {
      if (remoto) { log(`Sin ${m.variable}: no se crea la cuenta "${m.usuario}".`); continue; }
      clave = randomBytes(9).toString('base64url');
      const archivo = 'credenciales-local.local';
      if (!existsSync(archivo)) appendFileSync(archivo, '# Cuentas de la base LOCAL (no se versiona)\n');
      appendFileSync(archivo, `${m.usuario}\t${clave}\t${m.rol}\n`);
    }
    await db.insert(e.usuarios).values({
      nombre: m.nombre, usuario: m.usuario, email: `${m.usuario}@pulsovial.local`,
      hashClave: await bcrypt.hash(clave, 12), rol: m.rol,
    });
    log(`Cuenta creada: ${m.usuario} (${m.rol})`);
  }
}

// ─── 3. Catalogos ───────────────────────────────────────────────────────────

async function vacia(tabla: PgTable) {
  const r = await db.select({ n: count() }).from(tabla);
  return r[0].n === 0;
}

async function catalogos() {
  if (await vacia(e.unidades)) {
    const a = crearAleatorio(42);
    const tipos: [(typeof e.TIPOS_UNIDAD)[number], string, number][] = [['agente', 'Agente', 8], ['motorizado', 'Motorizado', 6], ['grua', 'Grúa', 3], ['ambulancia', 'Ambulancia', 3], ['patrulla', 'Patrulla', 4]];
    const filasU = tipos.flatMap(([tipo, nombre, n]) => Array.from({ length: n }, (_, i) => {
      const u = ubicacion(a);
      return { nombre: `${nombre} ${String(i + 1).padStart(2, '0')}`, tipo, lat: u.lat, lng: u.lng, estado: (i === n - 1 && n > 3 ? 'fuera_servicio' : 'disponible') as 'disponible' | 'fuera_servicio' };
    }));
    await db.insert(e.unidades).values(filasU);
  }

  if (await vacia(e.zonasAlerta)) {
    await db.insert(e.zonasAlerta).values([
      { nombre: 'Mercado de Bazurto', lat: 10.4100, lng: -75.5230, radioM: 450, umbral: 3, ventanaMin: 60 },
      { nombre: 'Glorieta Santander – Marbella', lat: 10.4330, lng: -75.5420, radioM: 400, umbral: 3, ventanaMin: 60 },
      { nombre: 'Av. Pedro de Heredia – Los Ejecutivos', lat: 10.4110, lng: -75.4990, radioM: 500, umbral: 4, ventanaMin: 90 },
      { nombre: 'Troncal de Occidente – El Socorro', lat: 10.3810, lng: -75.4760, radioM: 600, umbral: 3, ventanaMin: 90 },
      { nombre: 'Corredor de Mamonal', lat: 10.3600, lng: -75.5140, radioM: 900, umbral: 2, ventanaMin: 120 },
      { nombre: 'Bocagrande – Av. San Martín', lat: 10.4020, lng: -75.5540, radioM: 400, umbral: 3, ventanaMin: 60 },
    ]);
  }

  if (await vacia(e.geocercas)) {
    await db.insert(e.geocercas).values([
      { nombre: 'Centro Histórico', descripcion: 'Zona de alta afluencia peatonal y turística.', nivel: 'alto', color: '#4F2BD9', poligono: [[-75.5560, 10.4215], [-75.5470, 10.4300], [-75.5440, 10.4250], [-75.5490, 10.4180], [-75.5560, 10.4215]] },
      { nombre: 'Entorno del Mercado de Bazurto', descripcion: 'Carga y descarga, transporte informal y alto flujo de motos.', nivel: 'critico', color: '#B42318', poligono: [[-75.5270, 10.4135], [-75.5195, 10.4140], [-75.5185, 10.4070], [-75.5265, 10.4060], [-75.5270, 10.4135]] },
      { nombre: 'Zona industrial de Mamonal', descripcion: 'Tráfico pesado: tractomulas y camiones.', nivel: 'alto', color: '#B45309', poligono: [[-75.5200, 10.3850], [-75.5080, 10.3850], [-75.5000, 10.3300], [-75.5150, 10.3250], [-75.5200, 10.3850]] },
    ]);
  }

  if (await vacia(e.camaras)) {
    await db.insert(e.camaras).values([
      ['Glorieta de la India Catalina', 10.4260, -75.5450], ['Av. Pedro de Heredia – Bazurto', 10.4110, -75.5215], ['Av. Santander – Marbella', 10.4370, -75.5370],
      ['Av. San Martín – Bocagrande', 10.4030, -75.5535], ['Av. Pedro Romero – El Bosque', 10.3975, -75.5120], ['Troncal de Occidente – Ternera', 10.3830, -75.4760],
      ['Glorieta de Los Ejecutivos', 10.4105, -75.4985], ['Puente Jiménez – Manga', 10.4180, -75.5370],
    ].map(([nombre, lat, lng]) => ({ nombre: nombre as string, lat: lat as number, lng: lng as number, descripcion: 'Conexión pendiente con la red de cámaras de la ciudad.' })));
  }

  if (await vacia(e.fuentes)) {
    await db.insert(e.fuentes).values([
      { nombre: 'Noticias: accidentes de tránsito en Cartagena', tipo: 'rss', url: 'https://news.google.com/rss/search?q=accidente+tr%C3%A1nsito+Cartagena&hl=es-419&gl=CO&ceid=CO:es-419' },
      { nombre: 'Noticias: siniestros viales en Cartagena', tipo: 'rss', url: 'https://news.google.com/rss/search?q=%22Cartagena%22+(choque+OR+atropellado+OR+motociclista)&hl=es-419&gl=CO&ceid=CO:es-419' },
      { nombre: 'Publicaciones de redes sociales (carga manual)', tipo: 'manual' },
      { nombre: 'WhatsApp ciudadano', tipo: 'whatsapp' },
    ]);
  }

  if (await vacia(e.puntosQr)) {
    await db.insert(e.puntosQr).values([
      ['QR-BAZ', 'Paradero Mercado de Bazurto', 10.4105, -75.5225, 'Bazurto'],
      ['QR-IND', 'Glorieta de la India Catalina', 10.4262, -75.5448, 'Centro Histórico'],
      ['QR-EJE', 'Glorieta de Los Ejecutivos', 10.4106, -75.4988, 'Los Ejecutivos'],
      ['QR-SOC', 'Troncal de Occidente – El Socorro', 10.3812, -75.4765, 'El Socorro'],
      ['QR-BOC', 'Av. San Martín – Bocagrande', 10.4025, -75.5538, 'Bocagrande'],
      ['QR-TER', 'Terminal de Transportes', 10.4040, -75.4460, 'Terminal de Transportes'],
    ].map(([codigo, nombre, lat, lng, barrio]) => ({ codigo: codigo as string, nombre: nombre as string, lat: lat as number, lng: lng as number, barrio: barrio as string })));
  }

  if (await vacia(e.novedadesVia)) {
    const ahora = Date.now();
    await db.insert(e.novedadesVia).values([
      { tipo: 'obra', titulo: 'Obras de repavimentación', descripcion: 'Carril derecho cerrado en sentido Bazurto – Centro.', lat: 10.4130, lng: -75.5160, hasta: new Date(ahora + 20 * 86_400_000) },
      { tipo: 'semaforo_danado', titulo: 'Semáforo intermitente', descripcion: 'Intersección sin control semafórico; agente asignado en hora pico.', lat: 10.3985, lng: -75.5060 },
      { tipo: 'hueco', titulo: 'Hueco profundo en el carril de motos', descripcion: 'Reportado por ciudadanos; riesgo para motociclistas.', lat: 10.3842, lng: -75.4715 },
      { tipo: 'cierre', titulo: 'Cierre por evento en el Centro', descripcion: 'Desvío por la Av. Santander durante la noche.', lat: 10.4240, lng: -75.5500, hasta: new Date(ahora + 3 * 86_400_000) },
    ]);
  }
}

// ─── 4. Modo demostracion ───────────────────────────────────────────────────

async function demostracion() {
  const ajuste = await db.query.ajustes.findFirst({ where: eq(e.ajustes.clave, 'demo') });
  if (!ajuste) await db.insert(e.ajustes).values({ clave: 'demo', valor: { activo: true } });
  else if (!(ajuste.valor as { activo?: boolean }).activo) return;

  const simulados = await db.select({ n: count() }).from(e.siniestros).where(eq(e.siniestros.fuente, 'simulado'));
  if (simulados[0].n > 0) return;

  const a = crearAleatorio(20260101);
  const ahora = new Date();
  const desde = fechaLocal(2024, 0, 1);
  const datos = generarSiniestros(a, desde, ahora, 6);
  const consecutivo = new Map<number, number>();
  const valores = datos.map((s) => {
    const anio = partesLocales(s.ocurridoEn).anio;
    const n = (consecutivo.get(anio) ?? 0) + 1;
    consecutivo.set(anio, n);
    return { ...s, codigo: `SV-${anio}-${String(n).padStart(6, '0')}`, fuente: 'simulado' as const, estado: 'verificado' as const };
  });
  for (let i = 0; i < valores.length; i += 500) await db.insert(e.siniestros).values(valores.slice(i, i + 500)).onConflictDoNothing();
  log(`Siniestros de demostración: ${valores.length} (${partesLocales(desde).anio}–${partesLocales(ahora).anio})`);

  // Historial operativo de los ultimos 120 dias: reportes ciudadanos e incidentes atendidos.
  const recientes = await db.select().from(e.siniestros)
    .where(and(eq(e.siniestros.fuente, 'simulado'), gte(e.siniestros.ocurridoEn, new Date(ahora.getTime() - 120 * 86_400_000)), ne(e.siniestros.gravedad, 'solo_danos')))
    .orderBy(e.siniestros.ocurridoEn);
  const unidades = await db.select({ id: e.unidades.id }).from(e.unidades);
  const prioridad = { leve: 'media', grave: 'alta', fatal: 'critica', solo_danos: 'baja' } as const;
  let nIn = 0;
  for (const s of recientes) {
    const t0 = s.ocurridoEn.getTime() + (2 + a.r() * 6) * 60_000;
    const p = prioridad[s.gravedad];
    const desp = t0 + (1 + a.r() * 6) * 60_000;
    const sitio = desp + (4 + a.r() * (p === 'critica' ? 8 : 22)) * 60_000;
    const cierre = sitio + (25 + a.r() * 90) * 60_000;
    let reporteId: number | null = null;
    if (a.r() < 0.35) {
      const [r] = await db.insert(e.reportes).values({
        codigo: `RV-D${String(s.id).padStart(6, '0')}`, lat: s.lat, lng: s.lng, direccion: s.direccion, barrio: s.barrio,
        descripcion: s.descripcion ?? 'Siniestro reportado por la ciudadanía.', gravedadEstimada: s.gravedad, hayHeridos: s.heridos > 0,
        vehiculos: s.vehiculos, canal: a.ponderado([['web', 5], ['qr', 2], ['whatsapp', 3]] as const), estado: 'verificado', siniestroId: s.id,
        creado: new Date(t0 - 60_000), revisadoEn: new Date(t0),
      }).returning({ id: e.reportes.id });
      reporteId = r.id;
    }
    nIn++;
    const [inc] = await db.insert(e.incidentes).values({
      codigo: `IN-${partesLocales(s.ocurridoEn).anio}-D${String(nIn).padStart(5, '0')}`,
      titulo: s.descripcion ?? 'Siniestro vial', lat: s.lat, lng: s.lng, direccion: s.direccion, barrio: s.barrio,
      prioridad: p, estado: 'cerrado', slaMin: { baja: 45, media: 25, alta: 15, critica: 8 }[p], siniestroId: s.id, reporteId,
      abiertoEn: new Date(t0), despachadoEn: new Date(desp), enSitioEn: new Date(sitio), cerradoEn: new Date(cierre),
      cierre: 'Vía despejada. Se levantó el informe del siniestro.', simulado: true,
    }).returning({ id: e.incidentes.id });
    if (reporteId) await db.update(e.reportes).set({ incidenteId: inc.id }).where(eq(e.reportes.id, reporteId));
    if (unidades.length) await db.insert(e.incidenteUnidades).values({ incidenteId: inc.id, unidadId: a.elegir(unidades).id, asignadoEn: new Date(desp), liberadoEn: new Date(cierre) });
  }
  log(`Incidentes atendidos de demostración: ${nIn}`);
}

// ─── 5. Puntos negros ───────────────────────────────────────────────────────

async function puntosNegros() {
  if (!(await vacia(e.puntosNegros))) return;
  const desde = new Date(Date.now() - 2 * 365 * 86_400_000);
  const datos = await db.select({ id: e.siniestros.id, lat: e.siniestros.lat, lng: e.siniestros.lng, gravedad: e.siniestros.gravedad })
    .from(e.siniestros).where(and(gte(e.siniestros.ocurridoEn, desde), ne(e.siniestros.estado, 'descartado')));
  const grupos = detectarPuntosNegros(datos, 150, 8).slice(0, 40);
  if (!grupos.length) return;
  await db.insert(e.puntosNegros).values(grupos.map((g, i) => ({
    nombre: `${g.barrio} · punto ${i + 1}`, lat: g.lat, lng: g.lng, barrio: g.barrio, radioM: g.radioM,
    total: g.total, fatales: g.fatales, graves: g.graves, indice: g.indice, ranking: i + 1,
  })));
  log(`Puntos negros calculados: ${grupos.length}`);
}

async function main() {
  await migrarLegado();
  await crearEquipo();
  await catalogos();
  await demostracion();
  await puntosNegros();
  // Reportes de la version anterior sin barrio: se completan con el mas cercano.
  const sinBarrio = await db.select({ id: e.siniestros.id, lat: e.siniestros.lat, lng: e.siniestros.lng }).from(e.siniestros).where(isNull(e.siniestros.barrio)).limit(2000);
  for (const s of sinBarrio) await db.update(e.siniestros).set({ barrio: barrioMasCercano(s.lat, s.lng).nombre }).where(eq(e.siniestros.id, s.id));
  log('Listo. Centro del mapa:', CENTRO.join(', '), '· barrios conocidos:', BARRIOS.length);
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
