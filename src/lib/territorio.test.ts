import { describe, expect, it } from 'vitest';

import { interpretarPoligono } from './territorio';

describe('interpretarPoligono', () => {
  it('acepta el formato del editor [lat,lng] y lo cierra en [lng,lat]', () => {
    const r = interpretarPoligono('[[10.41,-75.52],[10.42,-75.52],[10.42,-75.51]]');
    expect(r).toEqual([[-75.52, 10.41], [-75.52, 10.42], [-75.51, 10.42], [-75.52, 10.41]]);
  });
  it('acepta GeoJSON y lineas "lat, lng"', () => {
    const geo = JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[-75.52, 10.41], [-75.52, 10.42], [-75.51, 10.42], [-75.52, 10.41]]] } });
    expect(Array.isArray(interpretarPoligono(geo))).toBe(true);
    expect(Array.isArray(interpretarPoligono('10.41, -75.52\n10.42, -75.52\n10.42, -75.51'))).toBe(true);
  });
  it('rechaza menos de 3 vertices, texto invalido y puntos fuera de Cartagena', () => {
    expect(typeof interpretarPoligono('[[10.41,-75.52],[10.42,-75.52]]')).toBe('string');
    expect(typeof interpretarPoligono('hola mundo')).toBe('string');
    expect(typeof interpretarPoligono('[[4.6,-74.08],[4.7,-74.08],[4.7,-74.0]]')).toBe('string');
  });
});
