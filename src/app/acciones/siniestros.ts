'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import type { EstadoFormulario } from '@/app/acciones/cuenta';
import { db, esquema as e } from '@/db';
import { CLASES, ESTADOS_SINIESTRO, GRAVEDADES, VEHICULOS } from '@/db/esquema';
import { barrioMasCercano, dentroDeCartagena } from '@/lib/geo';
import { auditar, siguienteCodigo } from '@/lib/registro';
import { exigirRol, PERMISOS } from '@/lib/sesion';
import { fechaLocal } from '@/lib/tiempo';

const ILUMINACIONES = ['dia', 'amanecer_atardecer', 'noche_con_alumbrado', 'noche_sin_alumbrado'] as const;

const opcional = (max: number) => z.string().trim().max(max).transform((v) => v || null);

const esquemaSiniestro = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha.'),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Indica la hora (HH:MM).'),
  lat: z.coerce.number({ message: 'Marca la ubicación en el mapa.' }).finite(),
  lng: z.coerce.number({ message: 'Marca la ubicación en el mapa.' }).finite(),
  direccion: opcional(200),
  barrio: opcional(120),
  gravedad: z.enum(GRAVEDADES, { message: 'Elige la gravedad.' }),
  clase: z.enum(CLASES, { message: 'Elige la clase de siniestro.' }),
  vehiculos: z.array(z.enum(VEHICULOS)).max(8),
  heridos: z.coerce.number().int('Usa un número entero.').min(0, 'No puede ser negativo.').max(99, 'Revisa el número de heridos.'),
  fallecidos: z.coerce.number().int('Usa un número entero.').min(0, 'No puede ser negativo.').max(99, 'Revisa el número de fallecidos.'),
  clima: z.enum(['', 'soleado', 'nublado', 'lluvia', 'lluvia_fuerte']).transform((v) => v || null),
  estadoVia: z.enum(['', 'bueno', 'regular', 'malo', 'mojada', 'obra']).transform((v) => v || null),
  iluminacion: z.enum(['', ...ILUMINACIONES]).transform((v) => v || null),
  diaFestivo: z.boolean(),
  causaProbable: opcional(200),
  descripcion: opcional(2000),
  estado: z.enum(ESTADOS_SINIESTRO),
}).superRefine((d, ctx) => {
  if (!dentroDeCartagena(d.lat, d.lng)) ctx.addIssue({ code: 'custom', path: ['lat'], message: 'La ubicación debe estar dentro de Cartagena.' });
  if (d.gravedad === 'fatal' && d.fallecidos < 1) ctx.addIssue({ code: 'custom', path: ['fallecidos'], message: 'Un siniestro fatal tiene al menos una víctima fatal.' });
  if (d.fallecidos > 0 && d.gravedad !== 'fatal') ctx.addIssue({ code: 'custom', path: ['gravedad'], message: 'Hay víctimas fatales: la gravedad debe ser «Con víctimas fatales».' });
  if ((d.gravedad === 'leve' || d.gravedad === 'grave') && d.heridos < 1) ctx.addIssue({ code: 'custom', path: ['heridos'], message: 'Un siniestro con heridos tiene al menos una persona herida.' });
  if (d.gravedad === 'solo_danos' && (d.heridos > 0 || d.fallecidos > 0)) ctx.addIssue({ code: 'custom', path: ['gravedad'], message: '«Solo daños» no puede tener personas heridas ni fallecidas.' });
  if (d.clase === 'atropello' && !d.vehiculos.includes('peaton')) ctx.addIssue({ code: 'custom', path: ['vehiculos'], message: 'En un atropello marca «Peatón» entre los involucrados.' });
});

function erroresDeCampo(error: z.ZodError) {
  const errores: Record<string, string> = {};
  for (const i of error.issues) errores[String(i.path[0])] ??= i.message;
  return errores;
}

function valoresDe(datos: FormData) {
  const v: Record<string, string> = {};
  for (const [k, x] of datos.entries()) if (typeof x === 'string' && k !== 'vehiculos' && !k.startsWith('$')) v[k] = x;
  v.vehiculos = datos.getAll('vehiculos').map(String).join(',');
  return v;
}

export async function guardarSiniestro(_: EstadoFormulario, datos: FormData): Promise<EstadoFormulario> {
  const u = await exigirRol(PERMISOS.registrar);
  const valores = valoresDe(datos);
  const r = esquemaSiniestro.safeParse({
    ...valores,
    vehiculos: datos.getAll('vehiculos').map(String),
    diaFestivo: datos.get('diaFestivo') === 'on',
    clima: valores.clima ?? '', estadoVia: valores.estadoVia ?? '', iluminacion: valores.iluminacion ?? '',
    direccion: valores.direccion ?? '', barrio: valores.barrio ?? '', causaProbable: valores.causaProbable ?? '', descripcion: valores.descripcion ?? '',
  });
  if (!r.success) return { error: 'Revisa los campos marcados.', errores: erroresDeCampo(r.error), valores };

  const d = r.data;
  const [a, m, dia] = d.fecha.split('-').map(Number);
  const [h, min] = d.hora.split(':').map(Number);
  const ocurridoEn = new Date(fechaLocal(a, m - 1, dia).getTime() + h * 3_600_000 + min * 60_000);
  if (Number.isNaN(ocurridoEn.getTime()) || h > 23 || min > 59) return { error: 'Revisa la fecha y la hora.', errores: { fecha: 'Fecha u hora inválida.' }, valores };
  if (ocurridoEn.getTime() > Date.now() + 5 * 60_000) return { error: 'Revisa la fecha y la hora.', errores: { fecha: 'La fecha no puede estar en el futuro.' }, valores };

  const campos = {
    ocurridoEn, lat: d.lat, lng: d.lng, direccion: d.direccion, barrio: d.barrio ?? barrioMasCercano(d.lat, d.lng).nombre,
    gravedad: d.gravedad, clase: d.clase, vehiculos: d.vehiculos, heridos: d.heridos, fallecidos: d.fallecidos,
    clima: d.clima, estadoVia: d.estadoVia, iluminacion: d.iluminacion, diaFestivo: d.diaFestivo,
    causaProbable: d.causaProbable, descripcion: d.descripcion, estado: d.estado,
  };

  const id = Number(datos.get('id'));
  let destino: number;
  if (Number.isInteger(id) && id > 0) {
    const antes = await db.query.siniestros.findFirst({ where: eq(e.siniestros.id, id) });
    if (!antes) return { error: 'El siniestro ya no existe.', valores };
    await db.update(e.siniestros).set({ ...campos, actualizado: new Date() }).where(eq(e.siniestros.id, id));
    const cambios = Object.fromEntries(Object.entries(campos)
      .filter(([k, v]) => JSON.stringify(v) !== JSON.stringify((antes as Record<string, unknown>)[k]))
      .map(([k, v]) => [k, { antes: (antes as Record<string, unknown>)[k], despues: v }]));
    await auditar(u.id, 'editar', 'siniestro', id, { codigo: antes.codigo, cambios });
    destino = id;
  } else {
    // Codigo consecutivo por año; si dos registros chocan, se reintenta con el siguiente.
    let creado: { id: number; codigo: string } | undefined;
    for (let intento = 0; intento < 3 && !creado; intento++) {
      const codigo = await siguienteCodigo('SV', ocurridoEn);
      [creado] = await db.insert(e.siniestros).values({ ...campos, codigo, fuente: 'manual', registradoPor: u.id }).onConflictDoNothing().returning({ id: e.siniestros.id, codigo: e.siniestros.codigo });
    }
    if (!creado) return { error: 'No se pudo asignar un código. Inténtalo de nuevo.', valores };
    destino = creado.id;
    await auditar(u.id, 'crear', 'siniestro', creado.id, { codigo: creado.codigo });

    // Procedencia: si viene de una noticia o de un reporte ciudadano, quedan vinculados.
    const noticia = Number(datos.get('noticiaId'));
    if (Number.isInteger(noticia) && noticia > 0) {
      await db.update(e.noticias).set({ estado: 'convertida', siniestroId: creado.id }).where(eq(e.noticias.id, noticia));
      await db.update(e.siniestros).set({ fuente: 'externo' }).where(eq(e.siniestros.id, creado.id));
      revalidatePath('/consola/fuentes');
    }
    const reporte = Number(datos.get('reporteId'));
    if (Number.isInteger(reporte) && reporte > 0) {
      await db.update(e.reportes).set({ estado: 'verificado', siniestroId: creado.id, revisadoPor: u.id, revisadoEn: new Date() }).where(eq(e.reportes.id, reporte));
      await db.update(e.siniestros).set({ fuente: 'ciudadano' }).where(eq(e.siniestros.id, creado.id));
      revalidatePath('/consola/reportes');
    }
  }
  revalidatePath('/consola/siniestros');
  revalidatePath('/consola');
  redirect(`/consola/siniestros/${destino}?guardado=1`);
}

export async function eliminarSiniestro(datos: FormData) {
  const u = await exigirRol(['admin']);
  const id = Number(datos.get('id'));
  if (!Number.isInteger(id) || datos.get('confirmo') !== 'on') return;
  const s = await db.query.siniestros.findFirst({ where: eq(e.siniestros.id, id) });
  if (!s) return;
  await db.delete(e.siniestros).where(eq(e.siniestros.id, id));
  await auditar(u.id, 'eliminar', 'siniestro', id, { codigo: s.codigo, gravedad: s.gravedad, ocurridoEn: s.ocurridoEn, fuente: s.fuente });
  revalidatePath('/consola/siniestros');
  redirect('/consola/siniestros?eliminado=1');
}
