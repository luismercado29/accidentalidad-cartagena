import { describe, expect, it } from 'vitest';

import { barrioEnTexto, distanciaM, puntoEnPoligono } from '@/lib/geo';
import { mismoPeriodoAnioAnterior, partesLocales, periodoAnterior, resolverPeriodo, variacion } from '@/lib/tiempo';

import { clasificar } from './clasificador';
import { detectarPuntosNegros } from './puntos-negros';
import { curvaDiaria, entrenar, pronosticar, validar, type Observacion } from './riesgo';
import { evaluarRuta } from './ruta';

// Generador determinista para que las pruebas no dependan del azar.
function aleatorio(semilla = 7) {
  let s = semilla;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

describe('filtro de tiempo', () => {
  const ahora = new Date('2026-10-04T15:00:00Z'); // 10:00 en Cartagena

  it('los ultimos 30 dias terminan manana a medianoche local', () => {
    const p = resolverPeriodo({ periodo: '30d' }, '30d', ahora);
    expect(p.hasta.toISOString()).toBe('2026-10-05T05:00:00.000Z');
    expect((p.hasta.getTime() - p.desde!.getTime()) / 86_400_000).toBe(30);
  });

  it('el año anterior va del 1 de enero al 1 de enero en hora local', () => {
    const p = resolverPeriodo({ periodo: 'anio-anterior' }, '30d', ahora);
    expect(p.desde!.toISOString()).toBe('2025-01-01T05:00:00.000Z');
    expect(p.hasta.toISOString()).toBe('2026-01-01T05:00:00.000Z');
    expect(p.etiqueta).toBe('Año 2025');
  });

  it('"hace un año" cubre los mismos 30 dias del año pasado', () => {
    const p = resolverPeriodo({ periodo: 'hace-1-anio' }, '30d', ahora);
    expect(p.hasta.toISOString()).toBe('2025-10-05T05:00:00.000Z');
    expect(p.desde!.toISOString()).toBe('2025-09-05T05:00:00.000Z');
  });

  it('acepta un año concreto y un rango personalizado (invertido incluso)', () => {
    expect(resolverPeriodo({ periodo: 'a2024' }, '30d', ahora).desde!.toISOString()).toBe('2024-01-01T05:00:00.000Z');
    const r = resolverPeriodo({ periodo: 'rango', desde: '2025-03-31', hasta: '2025-03-01' }, '30d', ahora);
    expect(r.desde!.toISOString()).toBe('2025-03-01T05:00:00.000Z');
    expect(r.hasta.toISOString()).toBe('2025-04-01T05:00:00.000Z');
  });

  it('ignora valores invalidos y usa el periodo por defecto', () => {
    expect(resolverPeriodo({ periodo: 'xyz' }, '7d', ahora).clave).toBe('7d');
    expect(resolverPeriodo({ periodo: 'a1990' }, '7d', ahora).clave).toBe('7d');
    expect(resolverPeriodo({ periodo: 'rango', desde: '2025-02-31' }, '7d', ahora).clave).toBe('7d');
  });

  it('calcula los periodos de comparacion', () => {
    const p = resolverPeriodo({ periodo: '7d' }, '30d', ahora);
    expect(periodoAnterior(p)!.hasta).toEqual(p.desde);
    expect(partesLocales(mismoPeriodoAnioAnterior(p)!.desde!).anio).toBe(2025);
    expect(variacion(120, 100)).toBe(20);
    expect(variacion(5, 0)).toBeNull();
    expect(resolverPeriodo({ periodo: 'todo' }, '30d', ahora).desde).toBeNull();
  });
});

describe('geografia', () => {
  it('mide distancias en metros', () => {
    expect(Math.round(distanciaM(10.4, -75.5, 10.401, -75.5))).toBeGreaterThan(105);
    expect(Math.round(distanciaM(10.4, -75.5, 10.401, -75.5))).toBeLessThan(115);
  });
  it('reconoce barrios con o sin tildes', () => {
    expect(barrioEnTexto('Choque en el Pie de la Popa deja dos heridos')?.nombre).toBe('Pie de la Popa');
    expect(barrioEnTexto('motociclista murio en El Pozon')?.nombre).toBe('El Pozón');
    expect(barrioEnTexto('accidente en la avenida Pedro de Heredia')?.nombre).toBe('Av. Pedro de Heredia');
    expect(barrioEnTexto('nada que ver')).toBeNull();
  });
  it('detecta si un punto esta en un poligono', () => {
    const cuadro: [number, number][] = [[-75.6, 10.3], [-75.4, 10.3], [-75.4, 10.5], [-75.6, 10.5]];
    expect(puntoEnPoligono(10.4, -75.5, cuadro)).toBe(true);
    expect(puntoEnPoligono(10.6, -75.5, cuadro)).toBe(false);
  });
});

describe('puntos negros (DBSCAN)', () => {
  it('agrupa los siniestros densos y descarta los aislados', () => {
    const r = aleatorio();
    const puntos = [
      ...Array.from({ length: 12 }, (_, i) => ({ id: i, lat: 10.41 + (r() - 0.5) * 0.001, lng: -75.51 + (r() - 0.5) * 0.001, gravedad: i === 0 ? 'fatal' as const : 'leve' as const })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: 100 + i, lat: 10.43 + (r() - 0.5) * 0.001, lng: -75.54 + (r() - 0.5) * 0.001, gravedad: 'grave' as const })),
      { id: 999, lat: 10.38, lng: -75.47, gravedad: 'fatal' as const },
    ];
    const grupos = detectarPuntosNegros(puntos, 150, 5);
    expect(grupos).toHaveLength(2);
    expect(grupos[0].total).toBe(12);
    expect(grupos[0].fatales).toBe(1);
    expect(grupos[0].indice).toBe(12 + 11 * 3);
    expect(grupos.flatMap((g) => g.ids)).not.toContain(999);
  });
});

describe('prediccion de riesgo', () => {
  const ahora = new Date('2026-10-04T15:00:00Z');
  const r = aleatorio(11);
  // Celda A muy activa en la tarde; celda B tranquila.
  const datos: Observacion[] = [];
  for (let i = 0; i < 400; i++) {
    const dias = Math.floor(r() * 700);
    const enA = r() < 0.8;
    const hora = enA ? 17 + Math.floor(r() * 3) : Math.floor(r() * 24);
    const f = new Date(ahora.getTime() - dias * 86_400_000);
    f.setUTCHours(hora + 5, 0, 0, 0);
    datos.push({ lat: enA ? 10.4105 : 10.3800, lng: enA ? -75.5100 : -75.4700, ocurridoEn: f, gravedad: 'leve', clima: r() < 0.3 ? 'lluvia' : 'soleado' });
  }
  const m = entrenar(datos, ahora);

  it('la zona activa encabeza el pronostico y la hora pico pesa mas', () => {
    const p = pronosticar(m, new Date('2026-10-05T23:00:00Z')); // 18:00 local
    expect(p[0].lat).toBeCloseTo(10.4106, 2);
    expect(p[0].nivel).toBe('muy_alto');
    expect(m.fHora[18]).toBeGreaterThan(m.fHora[3]);
    expect(p[0].probabilidad).toBeGreaterThan(0);
    expect(p[0].probabilidad).toBeLessThan(1);
  });

  it('la lluvia aumenta el riesgo y la curva diaria suma lo esperado', () => {
    const seco = pronosticar(m, ahora, false)[0].lambda;
    const lluvia = pronosticar(m, ahora, true)[0].lambda;
    expect(lluvia).toBeGreaterThan(seco);
    expect(curvaDiaria(m, ahora)).toHaveLength(24);
  });

  it('la validacion temporal supera al azar (PAI > 1)', () => {
    const v = validar(datos, new Date(ahora.getTime() - 60 * 86_400_000));
    expect(v).not.toBeNull();
    expect(v!.pai).toBeGreaterThan(1);
  });
});

describe('ruta segura', () => {
  const ahora = new Date('2026-10-04T15:00:00Z');
  const ruta: [number, number][] = [[10.41, -75.52], [10.41, -75.51], [10.41, -75.50]];
  it('una ruta con siniestros cerca es mas riesgosa que una despejada', () => {
    const historico = Array.from({ length: 20 }, () => ({ lat: 10.4102, lng: -75.512, gravedad: 'grave' as const, ocurridoEn: ahora }));
    const peligrosa = evaluarRuta(ruta, historico, ahora);
    const despejada = evaluarRuta([[10.45, -75.52], [10.45, -75.50]], historico, ahora);
    expect(peligrosa.indice).toBeGreaterThan(despejada.indice);
    expect(peligrosa.siniestrosCerca).toBe(20);
    expect(despejada.siniestrosCerca).toBe(0);
    expect(peligrosa.tramos.some((t) => t.nivel === 'alto')).toBe(true);
    expect(peligrosa.distanciaM).toBeGreaterThan(2000);
  });
});

describe('clasificador de noticias', () => {
  it('reconoce un siniestro fatal y su barrio', () => {
    const c = clasificar('Motociclista murió tras chocar contra un bus en la avenida Pedro de Heredia', 'El accidente de tránsito ocurrió en Cartagena');
    expect(c.esSiniestro).toBe(true);
    expect(c.gravedad).toBe('fatal');
    expect(c.barrio?.nombre).toBe('Av. Pedro de Heredia');
  });
  it('descarta lo que no es un siniestro vial', () => {
    expect(clasificar('Accidente laboral en una obra de Manga').esSiniestro).toBe(false);
    expect(clasificar('Gran concierto este sábado en Cartagena').esSiniestro).toBe(false);
    expect(clasificar('Muere un motorista en un accidente de tráfico en Cartagena (Murcia)').esSiniestro).toBe(false);
    expect(clasificar('Jimbee Cartagena gana en fútbol sala tras un choque de trenes').esSiniestro).toBe(false);
  });
  it('detecta heridos leves en un atropello', () => {
    const c = clasificar('Atropellan a peatón en Bocagrande; fue trasladado al hospital');
    expect(c.esSiniestro).toBe(true);
    expect(c.gravedad).toBe('leve');
  });
});
