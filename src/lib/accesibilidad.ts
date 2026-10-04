import type { PreferenciasAccesibilidad } from '@/db/esquema';

export const COOKIE_ACCESIBILIDAD = 'vial_accesibilidad';

export const PREFERENCIAS_BASE: PreferenciasAccesibilidad = {
  tamanoTexto: 100,
  altoContraste: false,
  fuenteLegible: false,
  subrayarEnlaces: false,
  reducirMovimiento: false,
  interlineado: 'normal',
  velocidadVoz: 1,
};

const TAMANOS = [100, 125, 150, 175, 200] as const;

/** Valida lo que venga de la cookie o la base de datos: nunca se confia en la entrada. */
export function normalizarPreferencias(valor: unknown): PreferenciasAccesibilidad {
  const v = (valor && typeof valor === 'object' ? valor : {}) as Record<string, unknown>;
  const tam = Number(v.tamanoTexto);
  const vel = Number(v.velocidadVoz);
  return {
    tamanoTexto: (TAMANOS as readonly number[]).includes(tam) ? (tam as PreferenciasAccesibilidad['tamanoTexto']) : 100,
    altoContraste: v.altoContraste === true,
    fuenteLegible: v.fuenteLegible === true,
    subrayarEnlaces: v.subrayarEnlaces === true,
    reducirMovimiento: v.reducirMovimiento === true,
    interlineado: v.interlineado === 'amplio' ? 'amplio' : 'normal',
    velocidadVoz: Number.isFinite(vel) ? Math.min(2, Math.max(0.5, vel)) : 1,
  };
}

export function leerCookie(texto: string | undefined) {
  if (!texto) return PREFERENCIAS_BASE;
  try { return normalizarPreferencias(JSON.parse(texto)); } catch { return PREFERENCIAS_BASE; }
}

/** Clases y atributos que se aplican en <html>. */
export function atributosHtml(p: PreferenciasAccesibilidad) {
  const clases = [
    p.altoContraste && 'alto-contraste',
    p.fuenteLegible && 'fuente-legible',
    p.subrayarEnlaces && 'subrayar-enlaces',
    p.reducirMovimiento && 'reducir-movimiento',
    p.interlineado === 'amplio' && 'interlineado-amplio',
  ].filter(Boolean).join(' ');
  return { className: clases, 'data-texto': String(p.tamanoTexto) };
}
