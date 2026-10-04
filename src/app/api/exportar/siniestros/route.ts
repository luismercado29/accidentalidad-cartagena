import { NextResponse } from 'next/server';

import { db, esquema as e } from '@/db';
import { CLASE, GRAVEDAD, VEHICULO } from '@/lib/etiquetas';
import { auditar } from '@/lib/registro';
import { condicionesRegistro, leerFiltrosRegistro, ordenSql } from '@/lib/registro-siniestros';
import { esEquipo, usuarioActual } from '@/lib/sesion';
import { DESFASE_MS } from '@/lib/tiempo';

export const dynamic = 'force-dynamic';

const LIMITE = 100_000;

/**
 * Celda CSV segura: se escapan comillas y, para evitar inyeccion de formulas en
 * Excel o LibreOffice, los textos que empiezan con = + - @ (o tab/retorno) se
 * prefijan con un apostrofo. Los numeros se dejan tal cual.
 */
function celda(v: unknown) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Fecha y hora local de Cartagena: "2025-03-14 18:20" */
const local = (d: Date) => new Date(d.getTime() + DESFASE_MS).toISOString().slice(0, 16).replace('T', ' ');

export async function GET(req: Request) {
  const u = await usuarioActual();
  if (!esEquipo(u)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const f = leerFiltrosRegistro(sp);
  const filas = await db.select().from(e.siniestros).where(condicionesRegistro(f.filtros, f.estado)).orderBy(...ordenSql(f.orden)).limit(LIMITE);

  const encabezado = ['codigo', 'fecha_hora_local', 'latitud', 'longitud', 'barrio', 'direccion', 'gravedad', 'clase', 'vehiculos', 'heridos', 'fallecidos', 'clima', 'estado_via', 'iluminacion', 'dia_festivo', 'causa_probable', 'descripcion', 'fuente', 'estado'];
  const lineas = [encabezado.join(';')];
  for (const s of filas) {
    lineas.push([
      s.codigo, local(s.ocurridoEn), s.lat, s.lng, s.barrio, s.direccion, GRAVEDAD[s.gravedad].texto, CLASE[s.clase],
      s.vehiculos.map((v) => VEHICULO[v]).join(', '), s.heridos, s.fallecidos, s.clima, s.estadoVia, s.iluminacion,
      s.diaFestivo ? 'si' : 'no', s.causaProbable, s.descripcion, s.fuente, s.estado,
    ].map(celda).join(';'));
  }

  await auditar(u!.id, 'exportar', 'siniestros', null, { filas: filas.length, periodo: f.periodo.etiqueta, estado: f.estado, filtros: sp });

  const nombre = `siniestros-${f.periodo.clave}-${new Date().toISOString().slice(0, 10)}.csv`;
  // BOM para que Excel reconozca UTF-8 (tildes y ñ).
  return new NextResponse(`﻿${lineas.join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  });
}
