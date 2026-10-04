import type { Metadata, Viewport } from 'next';
import { Anton, Atkinson_Hyperlegible, Instrument_Sans, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { cookies } from 'next/headers';

import { atributosHtml, COOKIE_ACCESIBILIDAD, leerCookie, normalizarPreferencias } from '@/lib/accesibilidad';
import { usuarioActual } from '@/lib/sesion';

import './globals.css';

const sans = Instrument_Sans({ subsets: ['latin'], variable: '--fuente-sans', display: 'swap' });
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--fuente-serif', display: 'swap' });
// Grotesca condensada para cifras de impacto (equivalente libre de ROC Grotesk Condensed).
const cifra = Anton({ subsets: ['latin'], weight: '400', variable: '--fuente-cifra', display: 'swap' });
// Monoespaciada para anotaciones tipo plano: coordenadas, codigos, horas.
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--fuente-mono', display: 'swap' });
// Atkinson Hyperlegible: creada por el Braille Institute para personas con baja vision.
const legible = Atkinson_Hyperlegible({ subsets: ['latin'], weight: ['400', '700'], variable: '--fuente-legible', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Pulso Vial · Siniestralidad vial de Cartagena', template: '%s · Pulso Vial' },
  description: 'Observatorio y gestión de la siniestralidad vial en Cartagena: mapa de calor, ruta segura, reportes ciudadanos, gestión de incidentes y predicción de riesgo.',
  applicationName: 'Pulso Vial',
};

export const viewport: Viewport = {
  themeColor: '#121019',
  // Nunca se bloquea el zoom: es una herramienta basica para personas con baja vision.
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [usuario, almacen] = await Promise.all([usuarioActual(), cookies()]);
  const preferencias = usuario && Object.keys(usuario.accesibilidad).length
    ? normalizarPreferencias(usuario.accesibilidad)
    : leerCookie(almacen.get(COOKIE_ACCESIBILIDAD)?.value);
  const { className, ...atributos } = atributosHtml(preferencias);

  return (
    <html lang="es-CO" className={`${sans.variable} ${serif.variable} ${cifra.variable} ${mono.variable} ${legible.variable} ${className}`} {...atributos}>
      <body className="min-h-dvh">
        <a className="saltar" href="#contenido">Saltar al contenido principal</a>
        {children}
      </body>
    </html>
  );
}
