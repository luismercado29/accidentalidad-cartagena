import { Chat } from '@/components/asistente/Chat';
import { iaDisponible } from '@/lib/asistente';

export const metadata = {
  title: 'Asistente',
  description: 'Pregunta en lenguaje natural por la siniestralidad vial de Cartagena: cifras, zonas, horarios, riesgo y novedades en la vía.',
};

export default function AsistentePublico() {
  return (
    <>
      <section className="contenedor grid gap-10 py-14 lg:grid-cols-[1fr_1.2fr] lg:py-20">
        <div>
          <p className="anotacion text-tinta-3">Asistente · datos en vivo</p>
          <h1 className="titular mt-3">Pregúntale a la <span className="serif text-marca">vía</span>.</h1>
          <p className="mt-5 max-w-md text-lg text-tinta-2">
            Cuántos siniestros hubo, dónde y a qué hora pasan, qué riesgo hay esta noche o si hay obras en tu camino.
            Las respuestas salen de los mismos datos del mapa, nunca de suposiciones.
          </p>
          <ul className="mt-8 space-y-3 text-tinta-2">
            {[
              ['01', 'Cifras con su periodo', 'Siempre te decimos de qué fechas hablamos.'],
              ['02', 'Sin registro', 'No guardamos tus preguntas ni pedimos datos personales.'],
              ['03', 'Siempre disponible', 'Si la IA no está disponible, un modo por reglas responde con los mismos datos.'],
            ].map(([num, t, d]) => (
              <li key={num} className="flex gap-4">
                <span className="serif text-4xl leading-none text-marca" aria-hidden="true">{num}</span>
                <span><strong className="block text-tinta">{t}</strong>{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-noche sobre-oscuro rounded-3xl p-5 shadow-elevada sm:p-7">
          <Chat oscuro iaConfigurada={iaDisponible()} />
        </div>
      </section>
      <div className="franja h-2" aria-hidden="true" />
    </>
  );
}
