import { PaginaTexto } from '@/components/portada/PaginaTexto';

export const metadata = { title: 'Declaración de accesibilidad' };

const SECCIONES = [
  {
    titulo: 'Compromiso',
    parrafos: [
      'Pulso Vial busca que cualquier persona pueda consultar la siniestralidad vial y reportar un siniestro, incluidas personas ciegas o con baja visión, con discapacidad motriz, auditiva o cognitiva.',
      'El objetivo es cumplir las Pautas de Accesibilidad para el Contenido Web (WCAG) 2.2 en el nivel AA, que también recoge la Norma Técnica Colombiana NTC 5854.',
    ],
  },
  {
    titulo: 'Qué hicimos',
    lista: [
      'Navegación completa con teclado, foco visible y enlace para saltar al contenido.',
      'Estructura con encabezados y regiones para lectores de pantalla (NVDA, JAWS, VoiceOver, TalkBack).',
      'Cada mapa tiene una alternativa en texto, lista o tabla; los gráficos incluyen su tabla de datos.',
      'La gravedad nunca se comunica solo con color: siempre va con texto y una forma distinta.',
      'Formularios con etiquetas visibles, ayudas y errores junto al campo; el foco va al primer error.',
      'Contraste mínimo de 4,5:1 en textos y objetivos táctiles de al menos 44 píxeles.',
      'Todo lo que se mueve se puede pausar, y las animaciones se desactivan con «reducir movimiento».',
      'Nunca se bloquea el zoom del navegador.',
    ],
  },
  {
    titulo: 'Ajustes disponibles',
    parrafos: ['Con el botón «Accesibilidad» de la cabecera puedes cambiar sin crear cuenta:'],
    lista: [
      'Tamaño del texto del 100 % al 200 %.',
      'Alto contraste.',
      'Fuente de alta legibilidad (Atkinson Hyperlegible, diseñada para baja visión).',
      'Espaciado amplio entre líneas y letras.',
      'Subrayado de enlaces.',
      'Reducción de movimiento.',
    ],
  },
  {
    titulo: 'Limitaciones conocidas',
    lista: [
      'Los mapas interactivos dependen de servicios externos de cartografía; si no cargan, la información equivalente sigue disponible en las tablas de cada página.',
      'Algunas noticias enlazadas desde fuentes externas pueden no cumplir estas pautas.',
    ],
  },
  {
    titulo: 'Cómo reportar una barrera',
    parrafos: [
      'Si encuentras algo que no puedes usar, cuéntanos qué página, qué intentabas hacer y qué tecnología de apoyo usas. Lo revisaremos y te responderemos.',
      'Puedes escribirnos por el formulario de reporte indicando «Accesibilidad» en la descripción, o por el canal de contacto del proyecto.',
    ],
  },
];

export default function Accesibilidad() {
  return <PaginaTexto anotacion="Accesibilidad · WCAG 2.2 AA" titulo="Una vía para" destacado="todas las personas" secciones={SECCIONES} actualizado="octubre de 2026" />;
}
