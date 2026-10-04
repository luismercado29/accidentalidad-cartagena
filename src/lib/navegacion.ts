import type { PERMISOS } from '@/lib/sesion';

export type EnlaceConsola = { href: string; texto: string; icono: string; permiso: keyof typeof PERMISOS | 'equipo'; descripcion: string };

/** Menu de la consola. El icono es el nombre de un componente de lucide-react (ver IconoNav). */
export const SECCIONES_CONSOLA: { titulo: string; enlaces: EnlaceConsola[] }[] = [
  {
    titulo: 'Operación',
    enlaces: [
      { href: '/consola', texto: 'Resumen', icono: 'LayoutDashboard', permiso: 'equipo', descripcion: 'Indicadores del periodo y lo que requiere atención.' },
      { href: '/consola/turno', texto: 'Panel de turno', icono: 'MonitorPlay', permiso: 'operar', descripcion: 'Pantalla en vivo para la sala de control.' },
      { href: '/consola/incidentes', texto: 'Incidentes', icono: 'Siren', permiso: 'operar', descripcion: 'Atención de siniestros en curso, de la apertura al cierre.' },
      { href: '/consola/reportes', texto: 'Reportes ciudadanos', icono: 'Inbox', permiso: 'operar', descripcion: 'Bandeja de reportes por web, QR y WhatsApp.' },
      { href: '/consola/unidades', texto: 'Unidades', icono: 'Truck', permiso: 'operar', descripcion: 'Agentes, grúas y ambulancias disponibles.' },
      { href: '/consola/alertas', texto: 'Alertas por zona', icono: 'BellRing', permiso: 'operar', descripcion: 'Umbrales por zona y alertas disparadas.' },
    ],
  },
  {
    titulo: 'Registro',
    enlaces: [
      { href: '/consola/siniestros', texto: 'Siniestros', icono: 'ClipboardList', permiso: 'registrar', descripcion: 'Registro histórico, búsqueda y exportación.' },
      { href: '/consola/importar', texto: 'Importar datos', icono: 'Upload', permiso: 'registrar', descripcion: 'Carga de históricos desde CSV o Excel.' },
      { href: '/consola/fuentes', texto: 'Fuentes externas', icono: 'Newspaper', permiso: 'operar', descripcion: 'Noticias y publicaciones sobre siniestros.' },
    ],
  },
  {
    titulo: 'Análisis',
    enlaces: [
      { href: '/consola/mapa', texto: 'Mapa de calor', icono: 'Flame', permiso: 'equipo', descripcion: 'Concentración de siniestros por zona.' },
      { href: '/consola/puntos-negros', texto: 'Puntos negros', icono: 'CircleDot', permiso: 'analizar', descripcion: 'Sitios críticos y su intervención.' },
      { href: '/consola/comparativo', texto: 'Comparativo anual', icono: 'ChartColumn', permiso: 'analizar', descripcion: 'Año contra año, mes a mes.' },
      { href: '/consola/prediccion', texto: 'Predicción de riesgo', icono: 'Radar', permiso: 'analizar', descripcion: 'Dónde y cuándo es más probable un siniestro.' },
      { href: '/consola/informes', texto: 'Informes', icono: 'FileText', permiso: 'analizar', descripcion: 'Informe imprimible del periodo.' },
      { href: '/consola/asistente', texto: 'Asistente IA', icono: 'Sparkles', permiso: 'equipo', descripcion: 'Preguntas sobre los datos en lenguaje natural.' },
    ],
  },
  {
    titulo: 'Territorio',
    enlaces: [
      { href: '/consola/geocercas', texto: 'Geocercas', icono: 'Hexagon', permiso: 'configurar', descripcion: 'Zonas especiales y su siniestralidad.' },
      { href: '/consola/camaras', texto: 'Cámaras', icono: 'Cctv', permiso: 'operar', descripcion: 'Cámaras de tránsito y su conexión.' },
      { href: '/consola/novedades', texto: 'Novedades en la vía', icono: 'Construction', permiso: 'operar', descripcion: 'Obras, cierres, semáforos y huecos.' },
      { href: '/consola/qr', texto: 'Códigos QR', icono: 'QrCode', permiso: 'configurar', descripcion: 'Puntos de reporte con código QR.' },
    ],
  },
  {
    titulo: 'Administración',
    enlaces: [
      { href: '/consola/usuarios', texto: 'Usuarios', icono: 'Users', permiso: 'administrar', descripcion: 'Cuentas del equipo y roles.' },
      { href: '/consola/auditoria', texto: 'Auditoría', icono: 'ScrollText', permiso: 'administrar', descripcion: 'Quién hizo qué y cuándo.' },
      { href: '/consola/ajustes', texto: 'Ajustes', icono: 'Settings', permiso: 'administrar', descripcion: 'Modo demostración y datos del sistema.' },
    ],
  },
];

export const ENLACES_PUBLICOS = [
  { href: '/mapa', texto: 'Mapa de calor' },
  { href: '/ruta-segura', texto: 'Ruta segura' },
  { href: '/datos', texto: 'Datos abiertos' },
  { href: '/asistente', texto: 'Asistente' },
];
