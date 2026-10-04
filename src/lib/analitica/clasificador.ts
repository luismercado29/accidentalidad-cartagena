/**
 * Clasificador de noticias y publicaciones: decide si un texto habla de un
 * siniestro vial en Cartagena, estima la gravedad y ubica el barrio mencionado.
 * Reglas transparentes (palabras clave con peso), sin enviar el texto a terceros.
 */
import type { Gravedad } from '@/db/esquema';
import { barrioEnTexto, type Barrio } from '@/lib/geo';

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const EVENTO: [RegExp, number][] = [
  [/\baccidente(s)? de transito\b/, 45],
  [/\bsiniestro(s)? vial(es)?\b/, 45],
  [/\b(choque|chocaron|chocó|choco|colision|colisiono|estrello|estrellaron)\b/, 35],
  [/\b(atropell\w*|arroll\w*)\b/, 40],
  [/\b(volco|volcamiento|volcó)\b/, 35],
  [/\baccidente\b/, 20],
  [/\b(motociclista|motorizado|conductor|pasajero|peaton|parrillero|ciclista)\b/, 12],
  [/\b(moto|motocicleta|bus|buseta|taxi|camion|tractomula|carro|vehiculo)\b/, 8],
  [/\b(via|avenida|calle|carrera|transversal|glorieta|puente)\b/, 5],
];

const RUIDO: [RegExp, number][] = [
  [/\baccidente (laboral|domestico|cerebrovascular|aereo)\b/, -40],
  [/\b(futbol|concierto|farandula|reinado)\b/, -15],
];

/** Cartagena de España (Murcia): mismo nombre, otra ciudad. */
const OTRA_CARTAGENA = /\b(murcia|espana|region de murcia|jimbee|futbol sala|mar menor|guardia civil)\b/;

const CIUDAD = /\b(cartagena|turbaco|bolivar|la heroica|corralito)\b/;

export type Clasificacion = { relevancia: number; gravedad: Gravedad | null; barrio: Barrio | null; esSiniestro: boolean };

export function clasificar(titulo: string, resumen = ''): Clasificacion {
  const t = sinTildes(`${titulo}. ${resumen}`);
  let puntaje = 0;
  for (const [re, p] of EVENTO) if (re.test(t)) puntaje += p;
  for (const [re, p] of RUIDO) if (re.test(t)) puntaje += p;
  const barrio = barrioEnTexto(`${titulo} ${resumen}`);
  if (barrio) puntaje += 15;
  if (OTRA_CARTAGENA.test(t)) puntaje -= 60;
  else if (CIUDAD.test(t)) puntaje += 10;

  let gravedad: Gravedad | null = null;
  if (/\b(muri\w*|muerto|muerta|fallec\w*|sin vida|perdio la vida|murio|deceso|victima fatal|mortal)\b/.test(t)) gravedad = 'fatal';
  else if (/\b(grave(s|mente)?|uci|cuidados intensivos|critico|debate entre la vida)\b/.test(t)) gravedad = 'grave';
  else if (/\b(herid\w*|lesionad\w*|lesiones|trasladad\w* al hospital|clinica|hospital)\b/.test(t)) gravedad = 'leve';
  else if (/\b(danos materiales|solo latas|sin heridos)\b/.test(t)) gravedad = 'solo_danos';

  const relevancia = Math.max(0, Math.min(100, puntaje));
  return { relevancia, gravedad, barrio, esSiniestro: relevancia >= 45 };
}
