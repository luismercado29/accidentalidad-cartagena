import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, esquema: {} }));

const { decodificar, parsearRss, textoPlano, urlPermitida } = await import('./fuentes');
const { clasificar } = await import('./analitica/clasificador');

const XML = `<?xml version="1.0"?><rss><channel><title>Canal</title>
<item><title><![CDATA[Motociclista murió en la avenida Pedro de Heredia &amp; dos heridos]]></title>
<link>https://medio.example.com/nota-1</link><pubDate>Sat, 04 Oct 2026 10:00:00 GMT</pubDate>
<description>&lt;p&gt;El accidente de tránsito ocurrió en &lt;b&gt;Cartagena&lt;/b&gt;&lt;/p&gt;</description></item>
<item><title>Sin enlace</title></item>
<item><title>Enlace peligroso</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

describe('lector RSS', () => {
  it('extrae titulo, enlace, fecha y texto plano', () => {
    const items = parsearRss(XML);
    expect(items).toHaveLength(1);
    expect(items[0].titulo).toBe('Motociclista murió en la avenida Pedro de Heredia & dos heridos');
    expect(items[0].resumen).toBe('El accidente de tránsito ocurrió en Cartagena');
    expect(items[0].publicadoEn.toISOString()).toBe('2026-10-04T10:00:00.000Z');
    expect(clasificar(items[0].titulo, items[0].resumen).gravedad).toBe('fatal');
  });

  it('decodifica entidades numericas y no deja etiquetas', () => {
    expect(decodificar('Bocagrande &#233; &#xF1;')).toBe('Bocagrande é ñ');
    expect(textoPlano('&lt;script&gt;x&lt;/script&gt; hola')).toBe('x hola');
  });

  it('solo permite https publico (evita SSRF)', () => {
    expect(urlPermitida('https://news.google.com/rss')).toBe(true);
    expect(urlPermitida('http://news.google.com/rss')).toBe(false);
    expect(urlPermitida('https://localhost/x')).toBe(false);
    expect(urlPermitida('https://127.0.0.1/x')).toBe(false);
    expect(urlPermitida('https://[::1]/x')).toBe(false);
    expect(urlPermitida('https://169.254.169.254/latest')).toBe(false);
    expect(urlPermitida('file:///etc/passwd')).toBe(false);
  });

  const muestra = join(process.env.TEMP ?? '/tmp', 'gn-muestra.xml');
  it.runIf(existsSync(muestra))('lee un feed real de Google News', () => {
    const items = parsearRss(readFileSync(muestra, 'utf8'));
    expect(items.length).toBeGreaterThan(10);
    const relevantes = items.map((i) => clasificar(i.titulo, i.resumen)).filter((c) => c.esSiniestro);
    console.log(`items: ${items.length}, probables siniestros: ${relevantes.length}`);
    expect(relevantes.length).toBeGreaterThan(0);
  });
});
