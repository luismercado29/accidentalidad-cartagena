/** Calculo del tiempo de llegada frente al SLA de un incidente. */
export type DatosSla = { abiertoEn: Date; enSitioEn: Date | null; cerradoEn: Date | null; slaMin: number; estado: string };

export const ACTIVOS = ['abierto', 'despachado', 'en_sitio', 'controlado'] as const;
const esActivo = (estado: string) => (ACTIVOS as readonly string[]).includes(estado);

export function calcularSla(i: DatosSla, ahora = new Date()) {
  const llego = !!i.enSitioEn;
  const fin = i.enSitioEn ?? (esActivo(i.estado) ? ahora : i.cerradoEn ?? ahora);
  const minutos = Math.max(0, (fin.getTime() - i.abiertoEn.getTime()) / 60_000);
  const aplica = llego || esActivo(i.estado);
  return { llego, minutos, fuera: aplica && minutos > i.slaMin, aplica, restante: i.slaMin - minutos };
}

export function minutosTexto(m: number) {
  const t = Math.round(m);
  if (t < 60) return `${t} min`;
  return `${Math.floor(t / 60)} h ${t % 60} min`;
}

export const COLOR_PRIORIDAD: Record<string, string> = { critica: '#7A1010', alta: '#B42318', media: '#B45309', baja: '#4A475C' };
