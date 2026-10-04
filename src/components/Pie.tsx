import Link from 'next/link';

import { Logo } from './Logo';

export function Pie() {
  return (
    <footer className="sobre-oscuro bg-noche text-white/80">
      <div className="franja h-2" aria-hidden="true" />
      <div className="contenedor grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo claro />
          <p className="mt-4 max-w-xs">Observatorio ciudadano de siniestralidad vial de Cartagena: datos abiertos, rutas más seguras y reportes que llegan a quien atiende.</p>
          <p className="anotacion mt-6 text-white/60">10.3910° N · 75.4794° O</p>
        </div>
        {[
          { titulo: 'Ciudadanía', enlaces: [['/reportar', 'Reportar un siniestro'], ['/seguimiento', 'Seguir mi reporte'], ['/ruta-segura', 'Ruta segura'], ['/mapa', 'Mapa de calor']] },
          { titulo: 'Datos', enlaces: [['/datos', 'Datos abiertos'], ['/asistente', 'Asistente'], ['/datos#metodologia', 'Metodología']] },
          { titulo: 'Plataforma', enlaces: [['/ingresar', 'Ingreso del equipo'], ['/accesibilidad', 'Accesibilidad'], ['/privacidad', 'Tratamiento de datos']] },
        ].map((g) => (
          <nav key={g.titulo} aria-label={g.titulo}>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-white">{g.titulo}</h2>
            <ul className="mt-4 space-y-2">
              {g.enlaces.map(([href, texto]) => (
                <li key={href}><Link href={href} className="underline-offset-4 hover:text-white hover:underline">{texto}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-white/10">
        <div className="contenedor flex flex-wrap justify-between gap-2 py-6 text-sm text-white/70">
          <p>© {new Date().getFullYear()} Pulso Vial · Proyecto de Luis Mercado.</p>
          <p>Iniciativa independiente; no representa a ninguna entidad oficial.</p>
        </div>
      </div>
    </footer>
  );
}
