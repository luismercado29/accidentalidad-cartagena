import 'server-only';

import { headers } from 'next/headers';
import QRCode from 'qrcode';

/** Origen publico del sitio (para los enlaces impresos en los codigos QR). */
export async function origenPublico() {
  if (process.env.URL_PUBLICA) return process.env.URL_PUBLICA.replace(/\/$/, '');
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export const enlaceReporte = (origen: string, codigo: string) => `${origen}/reportar?punto=${encodeURIComponent(codigo)}`;

/** Codigo QR como SVG (nivel de correccion M: tolera algo de suciedad en un afiche a la intemperie). */
export function qrSvg(texto: string) {
  return QRCode.toString(texto, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#121019', light: '#FFFFFF' } });
}
