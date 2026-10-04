import { describe, expect, it } from 'vitest';

import { detectarColumnas, normalizarGravedad, normalizarVehiculos, numero, parsearCsv, parsearFecha, parsearHora, PLANTILLA_CSV, procesarFila } from './importacion';

describe('importacion de historicos', () => {
  it('detecta columnas por sinonimos', () => {
    const m = detectarColumnas(['Fecha', 'Hora', 'LATITUD', 'Longitud', 'Barrio', 'Tipo_Vehiculo', 'Gravedad', 'Observaciones']);
    expect(m).toMatchObject({ fecha: 0, hora: 1, lat: 2, lng: 3, barrio: 4, vehiculo: 5, gravedad: 6, descripcion: 7 });
  });

  it('normaliza gravedad y vehiculos en español', () => {
    expect(normalizarGravedad('Muerto')).toBe('fatal');
    expect(normalizarGravedad('Solo daños')).toBe('solo_danos');
    expect(normalizarGravedad('HERIDO')).toBe('leve');
    expect(normalizarGravedad('???')).toBeNull();
    expect(normalizarVehiculos('moto, carro y bus')).toEqual(['motocicleta', 'automovil', 'bus']);
  });

  it('lee numeros, fechas y horas en varios formatos', () => {
    expect(numero('10,4105')).toBe(10.4105);
    expect(numero('-75.512')).toBe(-75.512);
    expect(numero('1.234,5')).toBe(1234.5);
    expect(parsearFecha('14/03/2025')).toMatchObject({ anio: 2025, mes: 2, dia: 14 });
    expect(parsearFecha('2025-03-14 18:20')).toMatchObject({ hora: [18, 20] });
    expect(parsearFecha('31/02/2025')).toBeNull();
    expect(parsearHora('6:20 pm')).toEqual([18, 20]);
    expect(parsearHora(0.5)).toEqual([12, 0]);
  });

  it('procesa la plantilla y rechaza filas incoherentes', () => {
    const [cab, ...filas] = parsearCsv(PLANTILLA_CSV);
    const m = detectarColumnas(cab);
    const r = filas.map((f) => procesarFila(f, m, new Date('2026-10-04T12:00:00Z')));
    expect(r.every((x) => x.fila)).toBe(true);
    expect(r[0].fila).toMatchObject({ gravedad: 'grave', heridos: 2, vehiculos: ['motocicleta', 'bus'], clima: 'lluvia' });
    expect(r[0].fila!.ocurridoEn).toBe('2025-03-14T23:20:00.000Z'); // 18:20 en Cartagena
    expect(r[1].fila).toMatchObject({ gravedad: 'solo_danos', lat: 10.4236, lng: -75.5506 });

    const malo = procesarFila(['2025-01-01', '10:00', '4.6', '-74.08', '', '', 'leve', '', '', '', '2'], m);
    expect(malo.errores).toContain('Coordenadas fuera de Cartagena');
    expect(malo.errores).toContain('Hay fallecidos pero la gravedad no es fatal');
  });

  it('acepta comillas y separadores dentro de campos CSV', () => {
    expect(parsearCsv('a,b\n"x, y","dice ""hola"""\n')).toEqual([['a', 'b'], ['x, y', 'dice "hola"']]);
  });
});
