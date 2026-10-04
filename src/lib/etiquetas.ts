/** Textos y colores de los catalogos. Los colores de texto tienen contraste AA sobre papel. */
import type { Clase, EstadoIncidente, EstadoReporte, Gravedad, Prioridad, Vehiculo } from '@/db/esquema';

export const GRAVEDAD: Record<Gravedad, { texto: string; corto: string; color: string; fondo: string; peso: number }> = {
  solo_danos: { texto: 'Solo daños', corto: 'Daños', color: '#4A475C', fondo: '#EDEBF2', peso: 1 },
  leve: { texto: 'Con heridos leves', corto: 'Leve', color: '#8A4B06', fondo: '#FDF0D5', peso: 3 },
  grave: { texto: 'Con heridos graves', corto: 'Grave', color: '#B42318', fondo: '#FDE4DF', peso: 6 },
  fatal: { texto: 'Con víctimas fatales', corto: 'Fatal', color: '#7A1010', fondo: '#F6D3D3', peso: 12 },
};
/** Color de punto en el mapa (mas saturado; siempre acompanado de texto o forma). */
export const COLOR_MAPA: Record<Gravedad, string> = { solo_danos: '#8E8AA3', leve: '#E0A100', grave: '#E5531A', fatal: '#B3121B' };

export const CLASE: Record<Clase, string> = {
  choque: 'Choque', atropello: 'Atropello', volcamiento: 'Volcamiento', caida_ocupante: 'Caída de ocupante', incendio: 'Incendio', otro: 'Otro',
};

export const VEHICULO: Record<Vehiculo, string> = {
  motocicleta: 'Motocicleta', automovil: 'Automóvil', bus: 'Bus', camion: 'Camión', taxi: 'Taxi', bicicleta: 'Bicicleta', peaton: 'Peatón', otro: 'Otro',
};

export const ESTADO_REPORTE: Record<EstadoReporte, { texto: string; tono: Tono }> = {
  recibido: { texto: 'Recibido', tono: 'info' },
  en_revision: { texto: 'En revisión', tono: 'aviso' },
  verificado: { texto: 'Verificado', tono: 'ok' },
  descartado: { texto: 'Descartado', tono: 'neutro' },
  duplicado: { texto: 'Duplicado', tono: 'neutro' },
};

export const ESTADO_INCIDENTE: Record<EstadoIncidente, { texto: string; tono: Tono }> = {
  abierto: { texto: 'Abierto', tono: 'peligro' },
  despachado: { texto: 'Unidad en camino', tono: 'aviso' },
  en_sitio: { texto: 'Unidad en el sitio', tono: 'info' },
  controlado: { texto: 'Controlado', tono: 'ok' },
  cerrado: { texto: 'Cerrado', tono: 'neutro' },
  cancelado: { texto: 'Cancelado', tono: 'neutro' },
};

export const PRIORIDAD: Record<Prioridad, { texto: string; tono: Tono; sla: number }> = {
  baja: { texto: 'Baja', tono: 'neutro', sla: 45 },
  media: { texto: 'Media', tono: 'info', sla: 25 },
  alta: { texto: 'Alta', tono: 'aviso', sla: 15 },
  critica: { texto: 'Crítica', tono: 'peligro', sla: 8 },
};

export const UNIDAD: Record<string, string> = {
  agente: 'Agente a pie', motorizado: 'Agente motorizado', grua: 'Grúa', ambulancia: 'Ambulancia', patrulla: 'Patrulla',
};
export const ESTADO_UNIDAD: Record<string, { texto: string; tono: Tono }> = {
  disponible: { texto: 'Disponible', tono: 'ok' }, asignada: { texto: 'Asignada', tono: 'aviso' }, fuera_servicio: { texto: 'Fuera de servicio', tono: 'neutro' },
};

export const INTERVENCION: Record<string, { texto: string; tono: Tono }> = {
  sin_intervenir: { texto: 'Sin intervenir', tono: 'peligro' },
  en_estudio: { texto: 'En estudio', tono: 'aviso' },
  en_intervencion: { texto: 'En intervención', tono: 'info' },
  intervenido: { texto: 'Intervenido', tono: 'ok' },
};

export const NIVEL_ALERTA: Record<string, { texto: string; tono: Tono }> = {
  bajo: { texto: 'Bajo', tono: 'neutro' }, medio: { texto: 'Medio', tono: 'info' }, alto: { texto: 'Alto', tono: 'aviso' }, critico: { texto: 'Crítico', tono: 'peligro' },
};

export const NOVEDAD: Record<string, string> = {
  obra: 'Obra en la vía', cierre: 'Cierre vial', semaforo_danado: 'Semáforo dañado', hueco: 'Hueco o daño en la vía', inundacion: 'Inundación', evento: 'Evento masivo', otro: 'Otra novedad',
};

export const ROL: Record<string, string> = {
  admin: 'Administración', supervisor: 'Supervisión', operador: 'Operación', analista: 'Análisis', ciudadano: 'Ciudadanía',
};

export const CANAL: Record<string, string> = { web: 'Web', qr: 'Código QR', whatsapp: 'WhatsApp', externo: 'Fuente externa' };

export const CLIMA: Record<string, string> = { soleado: 'Soleado', nublado: 'Nublado', lluvia: 'Lluvia', lluvia_fuerte: 'Lluvia fuerte' };
export const ESTADO_VIA: Record<string, string> = { bueno: 'Buena', regular: 'Regular', malo: 'Mala', mojada: 'Mojada', obra: 'En obra' };

export type Tono = 'ok' | 'info' | 'aviso' | 'peligro' | 'neutro';

export const etiquetaDe = <T extends string>(mapa: Record<T, string>, clave: string | null | undefined, porDefecto = '—') =>
  (clave && (mapa as Record<string, string>)[clave]) || porDefecto;
