import 'server-only';

import { isIP } from 'node:net';

import { and, eq } from 'drizzle-orm';

import { db, esquema as e } from '@/db';
import { clasificar } from '@/lib/analitica/clasificador';
import { notificar } from '@/lib/registro';

/**
 * Lectura de fuentes externas (RSS de medios). Las redes sociales no se leen
 * automaticamente: sus terminos prohiben el scraping y la integracion oficial
 * requiere sus API con aprobacion; se cargan a mano desde la consola.
 */

export type ItemRss = { titulo: string; url: string; resumen: string; publicadoEn: Date };

const LIMITE_BYTES = 2 * 1024 * 1024;
const TIEMPO_MS = 10_000;
const ANTIGUEDAD_MAX_DIAS = 60;
const RELEVANCIA_MINIMA = 25;

/** Solo https publico: evita que una URL configurada apunte a la red interna (SSRF). */
export function urlPermitida(texto: string) {
  try {
    const u = new URL(texto);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
    if (isIP(host.replace(/^\[|\]$/g, ''))) return false; // sin IP literales
    return true;
  } catch {
    return false;
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodificar(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, c: string) => {
      if (c[0] === '#') {
        const n = c[1].toLowerCase() === 'x' ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
      }
      return ENTIDADES[c.toLowerCase()] ?? m;
    });
}

/** Quita etiquetas HTML (las descripciones RSS suelen traerlas) y compacta espacios. */
export function textoPlano(html: string) {
  return decodificar(decodificar(html).replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function campo(item: string, etiqueta: string) {
  const m = new RegExp(`<${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</${etiqueta}>`, 'i').exec(item);
  return m ? m[1] : '';
}

/** Parser minimo de RSS 2.0 y Atom: solo extrae texto; nunca ejecuta ni interpreta el XML. */
export function parsearRss(xml: string): ItemRss[] {
  const items: ItemRss[] = [];
  const bloques = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi), ...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)];
  for (const [, b] of bloques) {
    const titulo = textoPlano(campo(b, 'title')).slice(0, 300);
    let url = decodificar(campo(b, 'link')).trim();
    if (!url) url = /<link\b[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? '';
    url = decodificar(url);
    const fecha = campo(b, 'pubDate') || campo(b, 'published') || campo(b, 'updated') || campo(b, 'dc:date');
    const publicadoEn = new Date(decodificar(fecha).trim());
    const resumen = textoPlano(campo(b, 'description') || campo(b, 'summary') || campo(b, 'content')).slice(0, 1000);
    if (!titulo || !/^https?:\/\//i.test(url) || url.length > 1000) continue;
    items.push({ titulo, url, resumen, publicadoEn: Number.isNaN(publicadoEn.getTime()) ? new Date() : publicadoEn });
  }
  return items;
}

export async function descargarRss(url: string): Promise<ItemRss[]> {
  if (!urlPermitida(url)) throw new Error('URL no permitida (solo https público).');
  const control = new AbortController();
  const t = setTimeout(() => control.abort(), TIEMPO_MS);
  try {
    const r = await fetch(url, {
      signal: control.signal,
      redirect: 'follow',
      cache: 'no-store',
      headers: { 'User-Agent': 'PulsoVial/2.0 (observatorio de siniestralidad vial; lectura de RSS)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9' },
    });
    if (!r.ok) throw new Error(`La fuente respondió ${r.status}.`);
    if (r.url && !urlPermitida(r.url)) throw new Error('La fuente redirigió a una URL no permitida.');
    const largo = Number(r.headers.get('content-length') ?? 0);
    if (largo > LIMITE_BYTES) throw new Error('La respuesta es demasiado grande.');
    const texto = await r.text();
    return parsearRss(texto.slice(0, LIMITE_BYTES));
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('La fuente tardó demasiado en responder.');
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export type ResultadoLectura = { fuente: string; leidos: number; nuevos: number; probables: number; error?: string };

/** Lee una fuente RSS y guarda las noticias relevantes (url unica: no se repiten). */
export async function leerFuente(fuente: typeof e.fuentes.$inferSelect): Promise<ResultadoLectura> {
  const base = { fuente: fuente.nombre, leidos: 0, nuevos: 0, probables: 0 };
  if (fuente.tipo !== 'rss' || !fuente.url) return base;
  try {
    const items = await descargarRss(fuente.url);
    const limite = Date.now() - ANTIGUEDAD_MAX_DIAS * 86_400_000;
    const resultado = { ...base, leidos: items.length };
    for (const it of items) {
      if (it.publicadoEn.getTime() < limite) continue;
      const c = clasificar(it.titulo, it.resumen);
      if (c.relevancia < RELEVANCIA_MINIMA) continue;
      const [n] = await db.insert(e.noticias).values({
        fuenteId: fuente.id, red: 'prensa', titulo: it.titulo, url: it.url, resumen: it.resumen || null,
        publicadoEn: it.publicadoEn > new Date() ? new Date() : it.publicadoEn,
        barrio: c.barrio?.nombre ?? null, lat: c.barrio?.lat ?? null, lng: c.barrio?.lng ?? null,
        gravedadDetectada: c.gravedad, relevancia: c.relevancia,
      }).onConflictDoNothing().returning({ id: e.noticias.id });
      if (!n) continue;
      resultado.nuevos++;
      if (c.esSiniestro) resultado.probables++;
    }
    await db.update(e.fuentes).set({ ultimaLectura: new Date(), ultimoError: null }).where(eq(e.fuentes.id, fuente.id));
    return resultado;
  } catch (err) {
    const mensaje = (err as Error).message?.slice(0, 300) || 'Error desconocido';
    await db.update(e.fuentes).set({ ultimaLectura: new Date(), ultimoError: mensaje }).where(eq(e.fuentes.id, fuente.id));
    return { ...base, error: mensaje };
  }
}

/** Lee todas las fuentes RSS activas y avisa al equipo si hay siniestros probables nuevos. */
export async function leerTodas() {
  const lista = await db.select().from(e.fuentes).where(and(eq(e.fuentes.activa, true), eq(e.fuentes.tipo, 'rss')));
  const resultados: ResultadoLectura[] = [];
  for (const f of lista) resultados.push(await leerFuente(f));
  const probables = resultados.reduce((s, r) => s + r.probables, 0);
  if (probables > 0) {
    await notificar({ tipo: 'info', titulo: `${probables} noticias sobre posibles siniestros`, mensaje: 'Revísalas y conviértelas en reporte o siniestro si corresponde.', enlace: '/consola/fuentes' });
  }
  return resultados;
}
