import { createHmac, timingSafeEqual } from 'node:crypto';

import { clasificar } from '@/lib/analitica/clasificador';
import { barrioEnTexto, dentroDeCartagena } from '@/lib/geo';
import { bloqueado, sumarIntento } from '@/lib/limites';
import { crearReporteCiudadano } from '@/lib/reportes';

export const dynamic = 'force-dynamic';

/**
 * Webhook de WhatsApp compatible con Twilio (application/x-www-form-urlencoded).
 * Campos usados: Body, From, Latitude, Longitude. Responde TwiML.
 *
 * Seguridad: con TWILIO_AUTH_TOKEN se valida la firma X-Twilio-Signature
 * (HMAC-SHA1 de la URL publica + parametros ordenados). Sin token, en
 * produccion el webhook queda deshabilitado (503).
 */
function twiml(texto: string, estado = 200) {
  const seguro = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${seguro}</Message></Response>`, {
    status: estado, headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}

function firmaValida(url: string, params: URLSearchParams, firma: string, token: string) {
  const claves = [...new Set(params.keys())].sort();
  const base = url + claves.map((k) => k + params.getAll(k).join('')).join('');
  const esperada = createHmac('sha1', token).update(base, 'utf8').digest('base64');
  const a = Buffer.from(esperada), b = Buffer.from(firma);
  return a.length === b.length && timingSafeEqual(a, b);
}

const HERIDOS = /\b(herid\w*|lesionad\w*|sangr\w*|inconscient\w*|ambulancia|muert\w*|fallec\w*)\b/i;

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token && process.env.NODE_ENV === 'production') {
    return new Response('Canal de WhatsApp no configurado.', { status: 503 });
  }
  const cuerpo = await req.text();
  if (cuerpo.length > 10_000) return new Response('Mensaje demasiado largo.', { status: 413 });
  const params = new URLSearchParams(cuerpo);

  if (token) {
    const url = process.env.WHATSAPP_URL_PUBLICA ?? req.url;
    const firma = req.headers.get('x-twilio-signature') ?? '';
    if (!firma || !firmaValida(url, params, firma, token)) return new Response('Firma inválida.', { status: 403 });
  }

  const texto = (params.get('Body') ?? '').trim().slice(0, 1000);
  const telefono = (params.get('From') ?? '').replace(/^whatsapp:/, '').slice(0, 20) || null;
  if (telefono) {
    const clave = `wa:${telefono}`;
    if (bloqueado(clave, 5)) return twiml('Recibimos varios reportes desde este número. Si es una emergencia, llama al 123.');
    sumarIntento(clave, 30 * 60_000);
  }

  let lat = Number(params.get('Latitude'));
  let lng = Number(params.get('Longitude'));
  let barrio: string | null = null;
  const conUbicacion = params.has('Latitude') && Number.isFinite(lat) && Number.isFinite(lng);
  if (!conUbicacion) {
    const b = barrioEnTexto(texto);
    if (!b) {
      return twiml('Hola, recibimos tu mensaje. Para registrar el siniestro comparte tu ubicación (clip → Ubicación) o escribe el barrio o la avenida donde ocurrió. Si hay heridos, llama al 123.');
    }
    ({ lat, lng } = b);
    barrio = b.nombre;
  }
  if (!dentroDeCartagena(lat, lng)) return twiml('La ubicación que compartiste está fuera de Cartagena. Este canal solo recibe reportes de la ciudad.');

  const c = clasificar(texto);
  const hayHeridos = HERIDOS.test(texto);
  const rep = await crearReporteCiudadano({
    lat, lng, barrio, direccion: barrio ? `${barrio} (aprox., según el mensaje)` : null,
    descripcion: texto.length >= 5 ? texto : 'Reporte por WhatsApp con ubicación compartida.',
    gravedadEstimada: c.gravedad ?? (hayHeridos ? 'leve' : 'solo_danos'), hayHeridos,
    vehiculos: [], contactoTelefono: telefono, canal: 'whatsapp',
  });

  return twiml(`Gracias. Tu reporte quedó registrado con el código ${rep.codigo}. Consulta su estado en ${new URL(req.url).origin}/seguimiento?codigo=${rep.codigo}.${rep.incidenteId ? ' Se abrió una atención prioritaria.' : ''} Si hay heridos, llama al 123.`);
}

export function GET() {
  return new Response('Webhook de WhatsApp: usa POST.', { status: 405, headers: { Allow: 'POST' } });
}
