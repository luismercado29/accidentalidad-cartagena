import { count, sql } from 'drizzle-orm';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

import { FiltroTiempo } from '@/components/FiltroTiempo';
import { Columnas } from '@/components/graficos';
import { Encabezado, Kpi, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, condicionesSiniestros, porVehiculo, ranking, resumen } from '@/lib/consultas';
import { CLASE, GRAVEDAD, VEHICULO } from '@/lib/etiquetas';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { diaISO, fechaLocal, formatoFecha, mismoPeriodoAnioAnterior, partesLocales, resolverPeriodo, variacion, type Periodo } from '@/lib/tiempo';

export const metadata = { title: 'Comparativo anual' };

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORES = ['#2437C7', '#B45309', '#15803D', '#7A1010'];
const FRANJAS = [
  { clave: 'madrugada', texto: 'Madrugada (0–5 h)', desde: 0, hasta: 5 },
  { clave: 'manana', texto: 'Mañana (6–11 h)', desde: 6, hasta: 11 },
  { clave: 'tarde', texto: 'Tarde (12–17 h)', desde: 12, hasta: 17 },
  { clave: 'noche', texto: 'Noche (18–23 h)', desde: 18, hasta: 23 },
];

type Sp = Record<string, string | string[] | undefined>;
const uno = (sp: Sp, k: string) => { const v = sp[k]; return Array.isArray(v) ? v[0] : v; };

/** Variacion en texto con flecha; subir es malo en siniestralidad. */
function Variacion({ actual, base }: { actual: number; base: number }) {
  const v = variacion(actual, base);
  if (v == null) return <span className="text-tinta-2">{actual > 0 ? 'nuevo' : '—'}</span>;
  const Icono = v > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${v > 0 ? 'text-error' : v < 0 ? 'text-exito' : 'text-tinta-2'}`}>
      {v !== 0 && <Icono className="size-4" aria-hidden="true" />}{v > 0 ? '+' : ''}{v} %
    </span>
  );
}

function TablaVariacion({ titulo, filas, nombres }: { titulo: string; filas: { etiqueta: string; valores: number[] }[]; nombres: string[] }) {
  return (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="tabla">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">Categoría</th>
            {nombres.map((n) => <th key={n} scope="col" className="num">{n}</th>)}
            <th scope="col" className="num">Variación {nombres[0]} vs {nombres[1]}</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.etiqueta}>
              <th scope="row" className="font-medium">{f.etiqueta}</th>
              {f.valores.map((v, i) => <td key={i} className="num">{v.toLocaleString('es-CO')}</td>)}
              <td className="num"><Variacion actual={f.valores[0]} base={f.valores[1]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function porMes(p: Periodo) {
  const mes = sql<number>`extract(month from ${e.siniestros.ocurridoEn} at time zone 'America/Bogota')::int`;
  const filas = await db.select({ mes, n: count() }).from(e.siniestros).where(condicionesSiniestros({ periodo: p })).groupBy(mes);
  const res = new Array(12).fill(0);
  for (const f of filas) res[Number(f.mes) - 1] = f.n;
  return res as number[];
}

async function porFranja(p: Periodo) {
  const hora = sql<number>`extract(hour from ${e.siniestros.ocurridoEn} at time zone 'America/Bogota')::int`;
  const filas = await db.select({ hora, n: count() }).from(e.siniestros).where(condicionesSiniestros({ periodo: p })).groupBy(hora);
  return FRANJAS.map((f) => filas.filter((x) => Number(x.hora) >= f.desde && Number(x.hora) <= f.hasta).reduce((a, x) => a + x.n, 0));
}

export default async function Comparativo({ searchParams }: { searchParams: Promise<Sp> }) {
  const [, sp] = await Promise.all([requerirRol(PERMISOS.analizar), searchParams]);
  const disponibles = await aniosDisponibles();
  const hoy = partesLocales(new Date());

  // Los años llegan como ?a=2026&a=2025 (casillas) o ?anios=2026,2025 (atajos).
  const marcados = Array.isArray(sp.a) ? sp.a : sp.a ? [sp.a] : (uno(sp, 'anios') ?? '').split(',');
  const pedidos = marcados.map(Number).filter((a) => disponibles.includes(a));
  const anios = (pedidos.length >= 2 ? [...new Set(pedidos)] : disponibles.slice(0, 2)).sort((a, b) => b - a).slice(0, 4);
  const completo = uno(sp, 'tramo') === 'completo';

  // Mismo tramo del año: del 1 de enero al mismo dia de hoy en cada año (evita comparar un año a medias con uno completo).
  const periodos: Periodo[] = anios.map((a) => {
    const hasta = completo ? fechaLocal(a + 1, 0, 1) : fechaLocal(a, hoy.mes, hoy.dia + 1);
    return { clave: 'rango', desde: fechaLocal(a, 0, 1), hasta, etiqueta: String(a) };
  });
  const nombres = anios.map(String);
  const tramoTexto = completo ? 'Años completos' : `Del 1 de enero al ${hoy.dia} de ${MESES_CORTOS[hoy.mes].toLowerCase()} de cada año`;

  const [resumenes, meses, barrios, clases, vehiculos, franjas] = await Promise.all([
    Promise.all(periodos.map((p) => resumen({ periodo: p }))),
    Promise.all(periodos.map(porMes)),
    Promise.all(periodos.slice(0, 2).map((p) => ranking({ periodo: p }, 'barrio', 200))),
    Promise.all(periodos.map((p) => ranking({ periodo: p }, 'clase', 20))),
    Promise.all(periodos.map((p) => porVehiculo({ periodo: p }))),
    Promise.all(periodos.map(porFranja)),
  ]);

  const mesesVisibles = completo ? 12 : hoy.mes + 1;

  // Barrios: cambios absolutos entre el año mas reciente y el anterior.
  const mapa0 = new Map(barrios[0].map((b) => [b.clave, b.n]));
  const mapa1 = new Map(barrios[1]?.map((b) => [b.clave, b.n]) ?? []);
  const cambios = [...new Set([...mapa0.keys(), ...mapa1.keys()])]
    .map((b) => ({ barrio: b, actual: mapa0.get(b) ?? 0, base: mapa1.get(b) ?? 0 }))
    .map((x) => ({ ...x, delta: x.actual - x.base }))
    .filter((x) => x.actual + x.base >= 5);
  const suben = [...cambios].sort((a, b) => b.delta - a.delta).filter((x) => x.delta > 0).slice(0, 6);
  const bajan = [...cambios].sort((a, b) => a.delta - b.delta).filter((x) => x.delta < 0).slice(0, 6);

  // Seccion 2: periodo elegido vs el mismo del año anterior.
  const periodo = resolverPeriodo(sp, 'mes');
  const pasado = mismoPeriodoAnioAnterior(periodo);
  const [act, prev] = await Promise.all([resumen({ periodo }), pasado ? resumen({ periodo: pasado }) : null]);

  const urlAnios = (lista: number[]) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string' && k !== 'anios' && k !== 'a') u.set(k, v);
    u.set('anios', lista.join(','));
    return `?${u.toString()}`;
  };

  return (
    <div className="space-y-6">
      <Encabezado anotacion={tramoTexto} titulo="Comparativo" destacado="año contra año"
        descripcion="Compara la siniestralidad entre años, mes a mes y por categoría. Por defecto se compara el mismo tramo de cada año para no sesgar el resultado." />

      <Panel titulo="Años a comparar" descripcion="Elige de 2 a 4 años. El primero de la lista se compara contra el segundo.">
        <form method="get" className="flex flex-wrap items-end gap-4">
          {Object.entries(sp).filter(([k]) => !['anios', 'tramo', 'a'].includes(k)).map(([k, v]) => typeof v === 'string' && <input key={k} type="hidden" name={k} value={v} />)}
          <fieldset>
            <legend className="text-sm font-semibold text-tinta-2">Años</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {disponibles.map((a) => (
                <label key={a} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-borde-fuerte bg-superficie px-3.5">
                  <input type="checkbox" name="a" value={a} defaultChecked={anios.includes(a)} className="size-4 accent-marca" />{a}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-sm font-semibold text-tinta-2">Tramo</span>
            <select name="tramo" defaultValue={completo ? 'completo' : 'ytd'} className="campo mt-1 min-h-10 py-1.5">
              <option value="ytd">Mismo tramo del año hasta hoy</option>
              <option value="completo">Años completos</option>
            </select>
          </label>
          <button type="submit" className="boton boton-primario boton-chico min-h-10">Comparar</button>
        </form>
        <p className="mt-3 text-sm text-tinta-2">
          Atajos: {disponibles.slice(0, -1).map((a, i) => (
            <a key={a} href={urlAnios([a, disponibles[i + 1]])} className="mr-3 font-semibold text-marca underline underline-offset-4">{a} vs {disponibles[i + 1]}</a>
          ))}
          {disponibles.length >= 3 && <a href={urlAnios(disponibles.slice(0, 4))} className="font-semibold text-marca underline underline-offset-4">Todos</a>}
        </p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta={`Siniestros ${nombres[0]}`} valor={resumenes[0].total} variacion={resumenes[1] ? variacion(resumenes[0].total, resumenes[1].total) : undefined} />
        <Kpi etiqueta={`Fatales ${nombres[0]}`} tono="fatal" valor={resumenes[0].porGravedad.fatal} variacion={resumenes[1] ? variacion(resumenes[0].porGravedad.fatal, resumenes[1].porGravedad.fatal) : undefined} />
        <Kpi etiqueta={`Fallecidos ${nombres[0]}`} tono="fatal" valor={resumenes[0].fallecidos} variacion={resumenes[1] ? variacion(resumenes[0].fallecidos, resumenes[1].fallecidos) : undefined} />
        <Kpi etiqueta={`Heridos ${nombres[0]}`} tono="grave" valor={resumenes[0].heridos} variacion={resumenes[1] ? variacion(resumenes[0].heridos, resumenes[1].heridos) : undefined} />
      </div>

      <Panel titulo="Siniestros por mes" descripcion={tramoTexto}>
        <Columnas titulo="Siniestros por mes y año" categorias={MESES_CORTOS.slice(0, mesesVisibles)}
          series={anios.map((a, i) => ({ nombre: String(a), color: COLORES[i], valores: meses[i].slice(0, mesesVisibles) }))} />
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel titulo="Por gravedad">
          <TablaVariacion titulo="Siniestros por gravedad y año" nombres={nombres}
            filas={(['fatal', 'grave', 'leve', 'solo_danos'] as const).map((g) => ({ etiqueta: GRAVEDAD[g].texto, valores: resumenes.map((r) => r.porGravedad[g]) }))
              .concat([{ etiqueta: 'Total', valores: resumenes.map((r) => r.total) }])} />
        </Panel>
        <Panel titulo="Por franja horaria" descripcion="Hora local">
          <TablaVariacion titulo="Siniestros por franja horaria y año" nombres={nombres}
            filas={FRANJAS.map((f, i) => ({ etiqueta: f.texto, valores: franjas.map((x) => x[i]) }))} />
        </Panel>
        <Panel titulo="Por clase de siniestro">
          <TablaVariacion titulo="Siniestros por clase y año" nombres={nombres}
            filas={Object.keys(CLASE).map((c) => ({ etiqueta: CLASE[c as keyof typeof CLASE], valores: clases.map((x) => x.find((r) => r.clave === c)?.n ?? 0) }))
              .filter((f) => f.valores.some((v) => v > 0))} />
        </Panel>
        <Panel titulo="Por vehículo involucrado" descripcion="Un siniestro puede involucrar varios vehículos.">
          <TablaVariacion titulo="Vehículos involucrados por año" nombres={nombres}
            filas={Object.keys(VEHICULO).map((v) => ({ etiqueta: VEHICULO[v as keyof typeof VEHICULO], valores: vehiculos.map((x) => x.find((r) => r.vehiculo === v)?.n ?? 0) }))
              .filter((f) => f.valores.some((x) => x > 0))} />
        </Panel>
      </div>

      {barrios[1] && (
        <div className="grid gap-6 xl:grid-cols-2">
          {[{ titulo: `Barrios donde más subió (${nombres[0]} vs ${nombres[1]})`, lista: suben }, { titulo: `Barrios donde más bajó (${nombres[0]} vs ${nombres[1]})`, lista: bajan }].map((b) => (
            <Panel key={b.titulo} titulo={b.titulo} descripcion="Solo barrios con al menos 5 siniestros en los dos años.">
              {b.lista.length === 0 ? <p className="text-tinta-2">Sin cambios destacables.</p> : (
                <table className="tabla">
                  <caption className="sr-only">{b.titulo}</caption>
                  <thead><tr><th scope="col">Barrio</th><th scope="col" className="num">{nombres[0]}</th><th scope="col" className="num">{nombres[1]}</th><th scope="col" className="num">Cambio</th></tr></thead>
                  <tbody>
                    {b.lista.map((x) => (
                      <tr key={x.barrio}>
                        <th scope="row" className="font-medium">{x.barrio}</th>
                        <td className="num">{x.actual}</td><td className="num">{x.base}</td>
                        <td className="num"><span className={`font-semibold ${x.delta > 0 ? 'text-error' : 'text-exito'}`}>{x.delta > 0 ? '+' : ''}{x.delta}</span> <span className="text-sm"><Variacion actual={x.actual} base={x.base} /></span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          ))}
        </div>
      )}

      <Panel titulo="Este periodo frente al mismo periodo del año anterior"
        descripcion={pasado ? `${periodo.etiqueta} (${formatoFecha(periodo.desde!)} – ${formatoFecha(new Date(periodo.hasta.getTime() - 1))}) frente a ${formatoFecha(pasado.desde!)} – ${formatoFecha(new Date(pasado.hasta.getTime() - 1))}` : 'Elige un periodo con fecha de inicio.'}
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={disponibles} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />}>
        {!prev ? <p className="text-tinta-2">«Todo el historial» no tiene un periodo equivalente el año anterior.</p> : (
          <TablaVariacion titulo="Periodo actual frente al mismo periodo del año anterior" nombres={['Este periodo', 'Año anterior']}
            filas={[
              { etiqueta: 'Siniestros', valores: [act.total, prev.total] },
              { etiqueta: GRAVEDAD.fatal.texto, valores: [act.porGravedad.fatal, prev.porGravedad.fatal] },
              { etiqueta: GRAVEDAD.grave.texto, valores: [act.porGravedad.grave, prev.porGravedad.grave] },
              { etiqueta: GRAVEDAD.leve.texto, valores: [act.porGravedad.leve, prev.porGravedad.leve] },
              { etiqueta: GRAVEDAD.solo_danos.texto, valores: [act.porGravedad.solo_danos, prev.porGravedad.solo_danos] },
              { etiqueta: 'Personas fallecidas', valores: [act.fallecidos, prev.fallecidos] },
              { etiqueta: 'Personas heridas', valores: [act.heridos, prev.heridos] },
            ]} />
        )}
      </Panel>
    </div>
  );
}
