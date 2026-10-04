/**
 * Graficos en SVG/HTML puro (sin librerias): se pintan en el servidor, pesan
 * poco y cada uno trae su tabla equivalente para lectores de pantalla.
 */
import type { Gravedad } from '@/db/esquema';
import { COLOR_MAPA, GRAVEDAD } from '@/lib/etiquetas';
import { DIAS_SEMANA } from '@/lib/tiempo';

const fmt = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 1 });

function TablaOculta({ titulo, columnas, filas }: { titulo: string; columnas: string[]; filas: (string | number)[][] }) {
  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <thead><tr>{columnas.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
      <tbody>{filas.map((f, i) => <tr key={i}>{f.map((v, j) => (j === 0 ? <th key={j} scope="row">{v}</th> : <td key={j}>{typeof v === 'number' ? fmt(v) : v}</td>))}</tr>)}</tbody>
    </table>
  );
}

/** Barras horizontales con etiqueta y valor. */
export function Barras({ titulo, datos, color = 'var(--color-marca)', sufijo = '' }: {
  titulo: string; datos: { etiqueta: string; valor: number; nota?: string }[]; color?: string; sufijo?: string;
}) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <figure>
      <ul className="space-y-2.5" aria-hidden="true">
        {datos.map((d) => (
          <li key={d.etiqueta}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{d.etiqueta}</span>
              <span className="shrink-0 tabular font-semibold">{fmt(d.valor)}{sufijo}{d.nota && <span className="ml-1.5 font-normal text-tinta-2">{d.nota}</span>}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-hundido">
              <div className="h-full rounded-full" style={{ width: `${(d.valor / max) * 100}%`, background: color }} />
            </div>
          </li>
        ))}
      </ul>
      <TablaOculta titulo={titulo} columnas={['Categoría', 'Valor']} filas={datos.map((d) => [d.etiqueta, d.valor])} />
    </figure>
  );
}

/** Serie temporal: area para el total y linea para los graves + fatales. */
export function Serie({ titulo, puntos, alto = 220, etiquetaY2 = 'Graves y fatales' }: {
  titulo: string; puntos: { x: string; y: number; y2?: number }[]; alto?: number; etiquetaY2?: string;
}) {
  if (!puntos.length) return <p className="text-tinta-2">Sin datos en el periodo.</p>;
  const ancho = 720, mx = 36, my = 18;
  const max = Math.max(1, ...puntos.map((p) => p.y));
  const paso = (ancho - mx - 8) / Math.max(1, puntos.length - 1);
  const X = (i: number) => mx + i * paso;
  const Y = (v: number) => alto - my - (v / max) * (alto - my * 2);
  const linea = (k: 'y' | 'y2') => puntos.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[k] ?? 0).toFixed(1)}`).join(' ');
  const area = `${linea('y')} L${X(puntos.length - 1)},${alto - my} L${mx},${alto - my} Z`;
  const marcas = [0, 0.5, 1].map((f) => Math.round(max * f));
  const cadaN = Math.ceil(puntos.length / 8);
  return (
    <figure>
      <svg viewBox={`0 0 ${ancho} ${alto + 18}`} className="h-auto w-full" aria-hidden="true">
        {marcas.map((m) => (
          <g key={m}>
            <line x1={mx} x2={ancho} y1={Y(m)} y2={Y(m)} stroke="#E6E3DC" />
            <text x={mx - 6} y={Y(m) + 4} textAnchor="end" fontSize="11" fill="#6B6880">{m}</text>
          </g>
        ))}
        <path d={area} fill="rgb(36 55 199 / .12)" />
        <path d={linea('y')} fill="none" stroke="#2437C7" strokeWidth="2" />
        {puntos.some((p) => p.y2 != null) && <path d={linea('y2')} fill="none" stroke="#B42318" strokeWidth="2" strokeDasharray="5 4" />}
        {puntos.map((p, i) => (i % cadaN === 0 || i === puntos.length - 1) && (
          <text key={p.x} x={X(i)} y={alto + 10} textAnchor="middle" fontSize="11" fill="#6B6880">{p.x}</text>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-sm text-tinta-2">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-5 bg-marca" /> Total de siniestros</span>
        {puntos.some((p) => p.y2 != null) && <span className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0 w-5 border-t-2 border-dashed border-error" /> {etiquetaY2}</span>}
      </figcaption>
      <TablaOculta titulo={titulo} columnas={['Fecha', 'Total', etiquetaY2]} filas={puntos.map((p) => [p.x, p.y, p.y2 ?? 0])} />
    </figure>
  );
}

/** Matriz hora x dia: donde y cuando se concentra la siniestralidad. */
export function MatrizHoraDia({ matriz }: { matriz: number[][] }) {
  const max = Math.max(1, ...matriz.flat());
  const orden = [1, 2, 3, 4, 5, 6, 0];
  return (
    <div className="overflow-x-auto" tabIndex={0}>
      <table className="w-full min-w-[640px] table-fixed border-separate border-spacing-0.5 text-xs">
        <caption className="sr-only">Siniestros por día de la semana y hora del día</caption>
        <thead>
          <tr>
            <th scope="col" className="w-11"><span className="sr-only">Día</span></th>
            {Array.from({ length: 24 }, (_, h) => <th key={h} scope="col" className="font-mono font-normal text-tinta-3">{h % 3 === 0 ? h : <span className="sr-only">{h}</span>}</th>)}
          </tr>
        </thead>
        <tbody>
          {orden.map((d) => (
            <tr key={d}>
              <th scope="row" className="pr-2 text-left font-semibold text-tinta-2">{DIAS_SEMANA[d].slice(0, 3)}</th>
              {matriz[d].map((v, h) => {
                const t = v / max;
                return (
                  <td key={h} className="h-6 rounded-[3px] text-center" title={`${DIAS_SEMANA[d]} ${h}:00 · ${v}`}
                    style={{ background: t === 0 ? '#F3F1EC' : `rgb(${Math.round(255 - t * 75)} ${Math.round(214 - t * 180)} ${Math.round(140 - t * 120)})` }}>
                    <span className="sr-only">{v}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-2 text-xs text-tinta-2">
        Menos <span aria-hidden="true" className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg,#FFD68C,#B42318)' }} /> Más
      </p>
    </div>
  );
}

/** Barra apilada por gravedad con leyenda. */
export function BarraGravedad({ por }: { por: Record<Gravedad, number> }) {
  const orden: Gravedad[] = ['fatal', 'grave', 'leve', 'solo_danos'];
  const total = orden.reduce((s, g) => s + por[g], 0) || 1;
  return (
    <figure>
      <div className="flex h-4 overflow-hidden rounded-full bg-hundido" aria-hidden="true">
        {orden.map((g) => por[g] > 0 && <div key={g} style={{ width: `${(por[g] / total) * 100}%`, background: COLOR_MAPA[g] }} />)}
      </div>
      <ul className="mt-3 grid gap-y-1.5 text-sm">
        {orden.map((g) => (
          <li key={g} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: COLOR_MAPA[g] }} />{GRAVEDAD[g].texto}</span>
            <span className="tabular font-semibold">{por[g].toLocaleString('es-CO')} <span className="font-normal text-tinta-2">({fmt((por[g] / total) * 100)} %)</span></span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Columnas agrupadas: comparar series (p. ej., meses de varios años). */
export function Columnas({ titulo, categorias, series, alto = 240 }: {
  titulo: string; categorias: string[]; series: { nombre: string; color: string; valores: number[] }[]; alto?: number;
}) {
  const ancho = 720, mx = 36, my = 20;
  const max = Math.max(1, ...series.flatMap((s) => s.valores));
  const grupo = (ancho - mx) / categorias.length;
  const barra = Math.min(22, (grupo - 8) / series.length);
  const Y = (v: number) => alto - my - (v / max) * (alto - my * 2);
  return (
    <figure>
      <svg viewBox={`0 0 ${ancho} ${alto + 16}`} className="h-auto w-full" aria-hidden="true">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={mx} x2={ancho} y1={Y(max * f)} y2={Y(max * f)} stroke="#E6E3DC" />
            <text x={mx - 6} y={Y(max * f) + 4} textAnchor="end" fontSize="11" fill="#6B6880">{Math.round(max * f)}</text>
          </g>
        ))}
        {categorias.map((c, i) => (
          <g key={c}>
            {series.map((s, j) => {
              const x = mx + i * grupo + (grupo - barra * series.length) / 2 + j * barra;
              return <rect key={s.nombre} x={x} y={Y(s.valores[i] ?? 0)} width={barra - 2} height={alto - my - Y(s.valores[i] ?? 0)} rx="2" fill={s.color} />;
            })}
            <text x={mx + i * grupo + grupo / 2} y={alto + 8} textAnchor="middle" fontSize="11" fill="#6B6880">{c}</text>
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-sm text-tinta-2">
        {series.map((s) => <span key={s.nombre} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: s.color }} />{s.nombre}</span>)}
      </figcaption>
      <TablaOculta titulo={titulo} columnas={['Categoría', ...series.map((s) => s.nombre)]} filas={categorias.map((c, i) => [c, ...series.map((s) => s.valores[i] ?? 0)])} />
    </figure>
  );
}
