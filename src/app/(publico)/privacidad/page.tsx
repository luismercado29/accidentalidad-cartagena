import { PaginaTexto } from '@/components/portada/PaginaTexto';

export const metadata = { title: 'Tratamiento de datos personales' };

const SECCIONES = [
  {
    titulo: 'Quiénes somos',
    parrafos: [
      'Pulso Vial es una iniciativa independiente de análisis y gestión de la siniestralidad vial en Cartagena. No representa a ninguna entidad oficial.',
      'Esta política aplica a los datos que recibimos cuando alguien reporta un siniestro por la web, con un código QR o por WhatsApp, y a las cuentas del equipo de gestión. Se rige por la Ley 1581 de 2012 y el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015).',
    ],
  },
  {
    titulo: 'Qué datos recogemos',
    lista: [
      'Del reporte: ubicación del siniestro, fecha y hora, descripción, gravedad estimada y vehículos involucrados.',
      'Opcionalmente, nombre y teléfono de contacto si decides dejarlos para que podamos confirmar información.',
      'Del canal de WhatsApp: el número desde el que escribes y el contenido del mensaje.',
      'Datos técnicos mínimos para seguridad (por ejemplo, la dirección IP en los registros del servidor y para limitar abusos).',
    ],
    parrafos: ['No pedimos datos sensibles. Por favor, no incluyas en la descripción nombres, placas, documentos ni información de salud de terceros.'],
  },
  {
    titulo: 'Para qué los usamos',
    lista: [
      'Verificar el siniestro y, si corresponde, atenderlo como incidente.',
      'Contactarte únicamente sobre tu reporte, si dejaste un teléfono.',
      'Construir estadísticas e indicadores. Las cifras públicas y las descargas son siempre agregadas y anónimas.',
      'Mejorar la seguridad vial: identificar puntos críticos y priorizar intervenciones.',
    ],
  },
  {
    titulo: 'Cuánto tiempo los guardamos',
    parrafos: [
      'Los datos de contacto se conservan solo mientras se gestiona el reporte y un plazo razonable para atender reclamaciones. La información del siniestro, sin datos personales, se conserva con fines estadísticos.',
    ],
  },
  {
    titulo: 'Con quién los compartimos',
    parrafos: [
      'No vendemos ni cedemos datos personales. Solo el equipo de gestión autorizado accede a los reportes, con cuentas individuales y registro de auditoría. Los proveedores de infraestructura (alojamiento y base de datos) los tratan por encargo y bajo medidas de seguridad.',
    ],
  },
  {
    titulo: 'Tus derechos',
    parrafos: ['Como titular puedes, en cualquier momento:'],
    lista: [
      'Conocer, actualizar y rectificar tus datos.',
      'Solicitar prueba de la autorización otorgada.',
      'Ser informado sobre el uso que se ha dado a tus datos.',
      'Revocar la autorización o pedir la supresión de tus datos, cuando no exista un deber legal de conservarlos.',
      'Presentar quejas ante la Superintendencia de Industria y Comercio.',
    ],
  },
  {
    titulo: 'Cómo ejercerlos',
    parrafos: [
      'Escríbenos por el canal de contacto del proyecto indicando tu solicitud y, si la tienes, el código de seguimiento de tu reporte (por ejemplo, RV-7KQ2-M9). Responderemos las consultas en máximo diez días hábiles y los reclamos en máximo quince días hábiles, según la ley.',
    ],
  },
  {
    titulo: 'Autorización',
    parrafos: [
      'Al enviar un reporte con datos de contacto aceptas este tratamiento para las finalidades descritas. Puedes reportar sin dejar ningún dato personal.',
    ],
  },
];

export default function Privacidad() {
  return <PaginaTexto anotacion="Ley 1581 de 2012 · Habeas data" titulo="Tus datos," destacado="cuidados" secciones={SECCIONES} actualizado="octubre de 2026" />;
}
