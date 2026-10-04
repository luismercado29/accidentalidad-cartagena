/**
 * Generador de datos de demostracion con patrones realistas de siniestralidad
 * urbana en Cartagena: concentracion en corredores, picos de hora, fines de
 * semana nocturnos mas letales, temporada de lluvias y alta participacion de motos.
 *
 * Todo lo generado se marca como fuente "simulado" y se puede borrar desde la consola.
 */
import type { Clase, Gravedad, Vehiculo } from './esquema';
import { BARRIOS, barrioMasCercano, CORREDORES } from '../lib/geo';
import { fechaLocal, partesLocales } from '../lib/tiempo';

export function crearAleatorio(semilla = 20260101) {
  let s = semilla % 2147483647;
  if (s <= 0) s += 2147483646;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  const elegir = <T,>(lista: readonly T[]) => lista[Math.floor(r() * lista.length)];
  const ponderado = <T,>(opciones: readonly (readonly [T, number])[]) => {
    const total = opciones.reduce((a, [, p]) => a + p, 0);
    let x = r() * total;
    for (const [v, p] of opciones) if ((x -= p) <= 0) return v;
    return opciones[opciones.length - 1][0];
  };
  return { r, elegir, ponderado };
}
export type Aleatorio = ReturnType<typeof crearAleatorio>;

const PESO_HORA = [3, 2.5, 2, 1.5, 1.5, 3, 6, 8, 7, 5, 5, 6, 7, 6, 5, 5, 6, 8, 9, 8, 6, 5, 4.5, 4];
const PESO_DIA = [1.25, 0.9, 0.9, 0.95, 1, 1.15, 1.3]; // domingo..sabado
const PESO_MES = [1.15, 0.9, 0.95, 0.95, 1.05, 1, 1.05, 1, 0.95, 1.1, 1.1, 1.25];
const LLUVIA_MES = [0.03, 0.02, 0.03, 0.08, 0.2, 0.18, 0.12, 0.15, 0.2, 0.3, 0.28, 0.1];

export type SiniestroDemo = {
  ocurridoEn: Date; lat: number; lng: number; barrio: string; direccion: string;
  gravedad: Gravedad; clase: Clase; vehiculos: Vehiculo[]; heridos: number; fallecidos: number;
  clima: string; estadoVia: string; iluminacion: string; diaFestivo: boolean; causaProbable: string; descripcion: string;
};

const CAUSAS = ['Exceso de velocidad', 'No respetar la señal de pare', 'Adelantar invadiendo carril', 'Distancia de seguimiento insuficiente', 'Giro indebido', 'Conducir en estado de embriaguez', 'Desobedecer el semáforo', 'Falta de precaución del peatón', 'Vía en mal estado', 'Maniobra imprudente de motociclista'];

/** Un punto sobre un corredor (con un pequeno desvio) o cerca del centro de un barrio. */
export function ubicacion(a: Aleatorio) {
  if (a.r() < 0.75) {
    const c = a.ponderado(CORREDORES.map((x) => [x, x.peso] as const));
    const i = Math.floor(a.r() * (c.puntos.length - 1));
    const t = a.r();
    const [p, q] = [c.puntos[i], c.puntos[i + 1]];
    const lat = p[0] + (q[0] - p[0]) * t + (a.r() - 0.5) * 0.0008;
    const lng = p[1] + (q[1] - p[1]) * t + (a.r() - 0.5) * 0.0008;
    return { lat, lng, barrio: barrioMasCercano(lat, lng).nombre, direccion: c.nombre };
  }
  const b = a.elegir(BARRIOS);
  const lat = b.lat + (a.r() - 0.5) * 0.006;
  const lng = b.lng + (a.r() - 0.5) * 0.006;
  return { lat, lng, barrio: b.nombre, direccion: `Sector ${b.nombre}` };
}

export function siniestroEn(a: Aleatorio, ocurridoEn: Date): SiniestroDemo {
  const p = partesLocales(ocurridoEn);
  const noche = p.hora >= 21 || p.hora <= 4;
  const finDeSemana = p.diaSemana === 0 || p.diaSemana === 6;
  const lluvia = a.r() < LLUVIA_MES[p.mes];
  const gravedad = a.ponderado<Gravedad>([
    ['solo_danos', 45], ['leve', 38], ['grave', noche ? 20 : 12], ['fatal', noche && finDeSemana ? 9 : noche ? 5 : 2.5],
  ]);
  const clase = a.ponderado<Clase>([['choque', 60], ['atropello', 14], ['caida_ocupante', 12], ['volcamiento', 6], ['incendio', 0.5], ['otro', 7.5]]);
  const vehiculos = new Set<Vehiculo>();
  vehiculos.add(a.ponderado<Vehiculo>([['motocicleta', 62], ['automovil', 22], ['taxi', 8], ['bus', 5], ['camion', 3]]));
  if (clase === 'choque') vehiculos.add(a.ponderado<Vehiculo>([['automovil', 35], ['motocicleta', 30], ['taxi', 12], ['bus', 12], ['camion', 8], ['bicicleta', 3]]));
  if (clase === 'atropello') vehiculos.add('peaton');
  const lugar = ubicacion(a);
  const heridos = gravedad === 'solo_danos' ? 0 : gravedad === 'leve' ? 1 + Math.floor(a.r() * 2) : 1 + Math.floor(a.r() * 3);
  const fallecidos = gravedad === 'fatal' ? (a.r() < 0.85 ? 1 : 2) : 0;
  const lista = [...vehiculos];
  const nombres: Record<string, string> = { motocicleta: 'una motocicleta', automovil: 'un automóvil', taxi: 'un taxi', bus: 'un bus', camion: 'un camión', bicicleta: 'una bicicleta', peaton: 'un peatón' };
  const descripcion = clase === 'atropello'
    ? `Atropello a peatón por ${nombres[lista[0]] ?? 'un vehículo'} en ${lugar.direccion}.`
    : clase === 'choque' && lista.length > 1
      ? `Choque entre ${nombres[lista[0]]} y ${nombres[lista[1]]} en ${lugar.direccion}.`
      : `${clase === 'caida_ocupante' ? 'Caída de ocupante de' : clase === 'volcamiento' ? 'Volcamiento de' : 'Siniestro con'} ${nombres[lista[0]] ?? 'un vehículo'} en ${lugar.direccion}.`;
  return {
    ocurridoEn, ...lugar, gravedad, clase, vehiculos: lista, heridos, fallecidos,
    clima: lluvia ? (a.r() < 0.3 ? 'lluvia_fuerte' : 'lluvia') : a.r() < 0.7 ? 'soleado' : 'nublado',
    estadoVia: lluvia ? 'mojada' : a.ponderado([['bueno', 70], ['regular', 22], ['malo', 6], ['obra', 2]] as const),
    iluminacion: p.hora >= 6 && p.hora < 18 ? 'dia' : a.r() < 0.8 ? 'noche_con_alumbrado' : 'noche_sin_alumbrado',
    diaFestivo: false,
    causaProbable: noche && finDeSemana && a.r() < 0.4 ? 'Conducir en estado de embriaguez' : a.elegir(CAUSAS),
    descripcion,
  };
}

/** Siniestros entre dos fechas, con en promedio `porDia` al dia. */
export function generarSiniestros(a: Aleatorio, desde: Date, hasta: Date, porDia = 6) {
  const res: SiniestroDemo[] = [];
  const totalHora = PESO_HORA.reduce((x, y) => x + y, 0);
  for (let t = desde.getTime(); t < hasta.getTime(); t += 86_400_000) {
    const p = partesLocales(new Date(t));
    // Leve tendencia a la baja año a año (campañas de seguridad vial).
    const tendencia = 1 - (p.anio - 2024) * 0.06;
    const esperado = porDia * PESO_DIA[p.diaSemana] * PESO_MES[p.mes] * tendencia;
    const n = Math.max(0, Math.round(esperado + (a.r() - 0.5) * esperado * 0.8));
    const inicioDia = fechaLocal(p.anio, p.mes, p.dia).getTime();
    for (let i = 0; i < n; i++) {
      let x = a.r() * totalHora;
      let hora = 0;
      while ((x -= PESO_HORA[hora]) > 0 && hora < 23) hora++;
      const instante = new Date(inicioDia + hora * 3_600_000 + Math.floor(a.r() * 3_600_000));
      if (instante.getTime() < hasta.getTime()) res.push(siniestroEn(a, instante));
    }
  }
  return res;
}
