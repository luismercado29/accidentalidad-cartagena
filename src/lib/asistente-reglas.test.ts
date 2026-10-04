import { describe, expect, it } from 'vitest';

import { gravedadEnTexto, intencion, periodoEnTexto } from './asistente-reglas';

describe('reglas del asistente', () => {
  it('reconoce el periodo pedido', () => {
    expect(periodoEnTexto('¿Cuántos siniestros hubo este mes?')).toBe('mes');
    expect(periodoEnTexto('muertos en 2024')).toBe('a2024');
    expect(periodoEnTexto('lo que pasó hace un año')).toBe('hace-1-anio');
    expect(periodoEnTexto('el año pasado')).toBe('anio-anterior');
    expect(periodoEnTexto('hola')).toBeNull();
  });
  it('reconoce la intención', () => {
    expect(intencion('Compara 2024 con 2025')).toBe('comparar');
    expect(intencion('¿Qué riesgo hay mañana a las 6 pm?')).toBe('riesgo');
    expect(intencion('¿En qué horas ocurren más siniestros?')).toBe('cuando');
    expect(intencion('¿Dónde ocurren más accidentes?')).toBe('donde');
    expect(intencion('¿Cuántos heridos hubo en Bocagrande?')).toBe('cuantos');
    expect(intencion('¿Cuáles son los puntos negros?')).toBe('puntos');
    expect(intencion('hay obras en la vía?')).toBe('novedades');
    expect(intencion('dame consejos para ir en moto')).toBe('consejos');
  });
  it('reconoce la gravedad', () => {
    expect(gravedadEnTexto('¿cuántos muertos hubo?')).toBe('fatal');
    expect(gravedadEnTexto('heridos graves')).toBe('grave');
  });
});
