'use client';

import { CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { importarLote, type ResultadoLote } from '@/app/acciones/importar';
import { Aviso } from '@/components/ui';
import { GRAVEDAD } from '@/lib/etiquetas';
import { CAMPOS, detectarColumnas, MAX_FILAS, parsearCsv, PLANTILLA_CSV, procesarFila, type Celda, type ClaveCampo, type Mapeo } from '@/lib/importacion';

const TAM_LOTE = 500;
const MAX_BYTES = 15 * 1024 * 1024;

export function Importador() {
  const id = useId();
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState('');
  const [encabezados, setEncabezados] = useState<string[]>([]);
  const [filas, setFilas] = useState<Celda[][]>([]);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [error, setError] = useState('');
  const [leyendo, setLeyendo] = useState(false);
  const [progreso, setProgreso] = useState<{ hecho: number; total: number } | null>(null);
  const [resultado, setResultado] = useState<(ResultadoLote & { erroresPrevios: number }) | null>(null);

  const procesadas = useMemo(() => filas.map((f) => procesarFila(f, mapeo)), [filas, mapeo]);
  const validas = procesadas.filter((p) => p.fila).length;
  const faltan = CAMPOS.filter((c) => c.requerido && mapeo[c.clave] == null);

  async function leer(f: File) {
    setError(''); setResultado(null); setFilas([]); setEncabezados([]);
    if (f.size > MAX_BYTES) { setError('El archivo supera 15 MB. Divídelo en partes más pequeñas.'); return; }
    setLeyendo(true);
    try {
      let datos: Celda[][];
      if (/\.(xlsx|xlsm)$/i.test(f.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        datos = (await readSheet(f)) as unknown as Celda[][];
      } else if (/\.(csv|txt)$/i.test(f.name)) {
        datos = parsearCsv(await f.text());
      } else {
        setError('Formato no soportado. Usa un archivo .csv o .xlsx.');
        return;
      }
      const [cab, ...resto] = datos;
      if (!cab || resto.length === 0) { setError('El archivo no tiene filas de datos.'); return; }
      if (resto.length > MAX_FILAS) { setError(`El archivo tiene ${resto.length.toLocaleString('es-CO')} filas; el máximo por carga es ${MAX_FILAS.toLocaleString('es-CO')}. Divídelo en varias cargas.`); return; }
      const nombres = cab.map((c, i) => (c == null || c === '' ? `Columna ${i + 1}` : String(c)));
      setArchivo(f.name);
      setEncabezados(nombres);
      setFilas(resto);
      setMapeo(detectarColumnas(nombres));
    } catch (err) {
      console.error(err);
      setError('No se pudo leer el archivo. Verifica que no esté dañado o protegido con contraseña.');
    } finally {
      setLeyendo(false);
    }
  }

  async function importar() {
    const listas = procesadas.flatMap((p) => (p.fila ? [p.fila] : []));
    const total = { insertados: 0, duplicados: 0, invalidos: 0 };
    setProgreso({ hecho: 0, total: listas.length });
    try {
      for (let i = 0; i < listas.length; i += TAM_LOTE) {
        const r = await importarLote(listas.slice(i, i + TAM_LOTE), archivo, i / TAM_LOTE + 1);
        if (r.error) throw new Error(r.error);
        total.insertados += r.insertados; total.duplicados += r.duplicados; total.invalidos += r.invalidos;
        setProgreso({ hecho: Math.min(listas.length, i + TAM_LOTE), total: listas.length });
      }
      setResultado({ ...total, erroresPrevios: procesadas.length - listas.length });
    } catch (err) {
      setError(`La importación se detuvo: ${(err as Error).message}. Lo ya guardado (${total.insertados}) se conserva; puedes volver a cargar el archivo: los duplicados se omiten.`);
    } finally {
      setProgreso(null);
    }
  }

  function reiniciar() {
    setArchivo(''); setFilas([]); setEncabezados([]); setMapeo({}); setResultado(null); setError('');
    if (entrada.current) entrada.current.value = '';
  }

  const plantilla = `data:text/csv;charset=utf-8,${encodeURIComponent(`﻿${PLANTILLA_CSV}\r\n`)}`;
  const enCurso = progreso != null;

  return (
    <div className="space-y-6">
      <section className="tarjeta p-5" aria-labelledby={`${id}-paso1`}>
        <h2 id={`${id}-paso1`} className="text-lg font-bold">1. Elige el archivo</h2>
        <p className="mt-1 text-sm text-tinta-2">CSV (separado por coma, punto y coma o tabulador) o Excel (.xlsx). Primera fila con encabezados. Hasta {MAX_FILAS.toLocaleString('es-CO')} filas por carga.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="boton boton-primario" disabled={enCurso || leyendo} onClick={() => entrada.current?.click()}>
            <Upload className="size-4" aria-hidden="true" />Seleccionar archivo
          </button>
          <input ref={entrada} id={`${id}-archivo`} type="file" accept=".csv,.txt,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            hidden disabled={enCurso} onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void leer(f); }} />
          <a href={plantilla} download="plantilla-siniestros.csv" className="boton boton-secundario"><Download className="size-4" aria-hidden="true" />Descargar plantilla CSV</a>
          {archivo && <span className="flex items-center gap-2 text-sm"><FileSpreadsheet className="size-4 text-tinta-2" aria-hidden="true" /><strong>{archivo}</strong> · {filas.length.toLocaleString('es-CO')} filas</span>}
        </div>
        <p role="status" aria-live="polite" className="mt-2 text-sm text-tinta-2">{leyendo ? 'Leyendo archivo…' : ''}</p>
        {error && <div className="mt-3"><Aviso tono="error">{error}</Aviso></div>}
      </section>

      {encabezados.length > 0 && !resultado && (
        <>
          <section className="tarjeta p-5" aria-labelledby={`${id}-paso2`}>
            <h2 id={`${id}-paso2`} className="text-lg font-bold">2. Revisa qué columna corresponde a cada dato</h2>
            <p className="mt-1 text-sm text-tinta-2">Lo detectamos por el nombre de cada encabezado. Corrige lo que haga falta; los marcados con * son obligatorios.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CAMPOS.map((c) => (
                <div key={c.clave}>
                  <label htmlFor={`${id}-m-${c.clave}`} className="block text-sm font-semibold">{c.texto}{c.requerido && <span aria-hidden="true" className="text-error"> *</span>}</label>
                  <select id={`${id}-m-${c.clave}`} className="campo mt-1" value={mapeo[c.clave] ?? ''}
                    aria-invalid={c.requerido && mapeo[c.clave] == null ? true : undefined}
                    onChange={(ev) => setMapeo((m) => ({ ...m, [c.clave as ClaveCampo]: ev.target.value === '' ? undefined : Number(ev.target.value) }))}>
                    <option value="">{c.clave === 'hora' ? 'Incluida en la fecha / no hay' : 'No importar'}</option>
                    {encabezados.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {faltan.length > 0 && <div className="mt-4"><Aviso tono="aviso">Falta asignar: {faltan.map((c) => c.texto).join(', ')}.</Aviso></div>}
          </section>

          <section className="tarjeta overflow-hidden" aria-labelledby={`${id}-paso3`}>
            <div className="flex flex-wrap items-end justify-between gap-3 p-5">
              <div>
                <h2 id={`${id}-paso3`} className="text-lg font-bold">3. Vista previa</h2>
                <p className="mt-1 text-sm text-tinta-2">Primeras 20 filas tal como se guardarán. Las filas con errores se omiten.</p>
              </div>
              <p className="text-sm" role="status">
                <strong className="text-exito">{validas.toLocaleString('es-CO')} válidas</strong> · <strong className={procesadas.length - validas ? 'text-error' : ''}>{(procesadas.length - validas).toLocaleString('es-CO')} con errores</strong>
              </p>
            </div>
            <div className="overflow-x-auto" tabIndex={0}>
              <table className="tabla min-w-[900px]">
                <caption className="sr-only">Vista previa de las primeras 20 filas</caption>
                <thead><tr><th scope="col" className="num">Fila</th><th scope="col">Fecha y hora</th><th scope="col">Ubicación</th><th scope="col">Gravedad</th><th scope="col">Vehículos</th><th scope="col">Víctimas</th><th scope="col">Resultado</th></tr></thead>
                <tbody>
                  {procesadas.slice(0, 20).map((p, i) => (
                    <tr key={i}>
                      <td className="num font-normal">{i + 2}</td>
                      {p.fila ? (
                        <>
                          <td className="tabular whitespace-nowrap">{new Date(p.fila.ocurridoEn).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' })}</td>
                          <td>{p.fila.barrio}<span className="block font-mono text-xs text-tinta-2">{p.fila.lat.toFixed(4)}, {p.fila.lng.toFixed(4)}</span></td>
                          <td>{GRAVEDAD[p.fila.gravedad].corto}</td>
                          <td>{p.fila.vehiculos.join(', ') || '—'}</td>
                          <td className="tabular">{p.fila.heridos} her. · {p.fila.fallecidos} fall.</td>
                          <td><span className="flex items-center gap-1 text-exito"><CheckCircle2 className="size-4" aria-hidden="true" />Lista</span></td>
                        </>
                      ) : (
                        <td colSpan={6} className="text-error"><strong>Error:</strong> {p.errores.join('; ')}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-borde p-5">
              <button type="button" className="boton boton-primario" disabled={enCurso || validas === 0 || faltan.length > 0} onClick={importar}>
                <Upload className="size-4" aria-hidden="true" />Importar {validas.toLocaleString('es-CO')} siniestros
              </button>
              <button type="button" className="boton boton-fantasma" disabled={enCurso} onClick={reiniciar}><RotateCcw className="size-4" aria-hidden="true" />Elegir otro archivo</button>
              {progreso && (
                <div className="min-w-60 flex-1">
                  <div role="progressbar" aria-label="Progreso de la importación" aria-valuemin={0} aria-valuemax={progreso.total} aria-valuenow={progreso.hecho} className="h-2 overflow-hidden rounded-full bg-hundido">
                    <div className="h-full bg-marca transition-all" style={{ width: `${(progreso.hecho / Math.max(1, progreso.total)) * 100}%` }} />
                  </div>
                  <p className="mt-1 text-sm text-tinta-2" aria-live="polite">Guardando {progreso.hecho.toLocaleString('es-CO')} de {progreso.total.toLocaleString('es-CO')}…</p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {resultado && (
        <section className="tarjeta p-5" aria-labelledby={`${id}-fin`}>
          <h2 id={`${id}-fin`} className="text-lg font-bold">Importación terminada</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['Insertados', resultado.insertados, 'text-exito'], ['Duplicados omitidos', resultado.duplicados, 'text-tinta'], ['Con errores (archivo)', resultado.erroresPrevios, 'text-error'], ['Rechazados al validar', resultado.invalidos, 'text-error']].map(([t, n, c]) => (
              <div key={t as string} className="rounded-xl bg-hundido px-4 py-3"><dt className="text-sm font-semibold text-tinta-2">{t}</dt><dd className={`cifra mt-1 text-3xl ${c}`}>{(n as number).toLocaleString('es-CO')}</dd></div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href="/consola/siniestros?fuente=importado&periodo=todo" className="boton boton-primario">Ver lo importado</a>
            <button type="button" className="boton boton-secundario" onClick={reiniciar}>Importar otro archivo</button>
          </div>
        </section>
      )}
    </div>
  );
}
