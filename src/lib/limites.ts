import 'server-only';

/**
 * Limite de intentos en memoria (por instancia). Frena fuerza bruta desde una
 * misma conexion; para un limite global en serverless habria que usar un
 * almacen compartido (p. ej. Redis).
 */
const intentos = new Map<string, { n: number; hasta: number }>();

export function bloqueado(clave: string, maximo: number) {
  const r = intentos.get(clave);
  if (!r || r.hasta < Date.now()) return false;
  return r.n >= maximo;
}

export function sumarIntento(clave: string, ventanaMs = 15 * 60_000) {
  const ahora = Date.now();
  const r = intentos.get(clave);
  if (!r || r.hasta < ahora) intentos.set(clave, { n: 1, hasta: ahora + ventanaMs });
  else r.n++;
  if (intentos.size > 10_000) for (const [k, v] of intentos) if (v.hasta < ahora) intentos.delete(k);
}

export function limpiarIntentos(clave: string) {
  intentos.delete(clave);
}
