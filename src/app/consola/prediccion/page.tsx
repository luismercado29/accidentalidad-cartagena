import { eq } from 'drizzle-orm';
import { CloudRain, Gauge, Radar, Target } from 'lucide-react';

import { Mapa } from '@/components/mapa/Mapa';
import { Encabezado, Insignia, Kpi, Panel, numero } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { curvaDiaria, pronosticar, type Pronostico } from '@/lib/analitica/riesgo';
import { UNIDAD, type Tono } from '@/lib/etiquetas';
import { coordenadas, distanciaM } from '@/lib/geo';
import { PERMISOS, requerirRol } from '@/lib/sesion';
import { DIAS_SEMANA, diaISO, fechaLocal, formatoFechaHora, parsearDia, partesLocales } from '@/lib/tiempo';

import { modeloRiesgo } from './modelo';

export const metadata = { title: 'Predicción de riesgo' };

const NIVEL: Record<Pronostico['nivel'], { texto: string; color: string; tono: Tono }> = {
  muy_alto: { texto: 'Muy alto', color: '#7A1010', tono: 'peligro' },
  alto: { texto: 'Alto', color: '#E5531A', tono: 'aviso' },
  medio: { texto: 'Medio', color: '#E0A100', tono: 'info' },
  bajo: { texto: 'Bajo', color: '#8E8AA3', tono: 'neutro' },
};

const veces = (f: number) => `${numero(f, 1)} veces`;

/** Curva de siniestros esperados por hora, con la hora elegida resaltada. */
function CurvaHoras({ curva, hora }: { curva: { hora: number; esperados: number }[]; hora: number }) {
  const max = Math.max(...curva.map((c) => c.esperados), 0.01);
  const ancho = 720, alto = 200, mx = 40, my = 16;
  const barra = (ancho - mx) / 24;
  const Y = (v: number) => alto - my - (v / max) * (alto - my * 2);
  return (
    <figure>
      <svg viewBox={`0 0 ${ancho} ${alto + 16}`} className="h-auto w-full" aria-hidden="true">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={mx} x2={ancho} y1={Y(max * f)} y2={Y(max * f)} stroke="#E6E3DC" />
            <text x={mx - 6} y={Y(max * f) + 4} textAnchor="end" fontSize="11" fill="#6B6880">{numero(max * f, 1)}</text>
          </g>
        ))}
        {curva.map((c) => (
          <g key={c.hora}>
            <rect x={mx + c.hora * barra + 2} y={Y(c.esperados)} width={barra - 4} height={alto - my - Y(c.esperados)} rx="2"
              fill={c.hora === hora ? '#121019' : '#2437C7'} opacity={c.hora === hora ? 1 : 0.55} />
            {c.hora % 3 === 0 && <text x={mx + c.hora * barra + barra / 2} y={alto + 8} textAnchor="middle" fontSize="11" fill="#6B6880">{c.hora}h</text>}
          </g>
        ))}
      </svg>
      <figcaption className="mt-2 text-sm text-tinta-2">Barra oscura: la hora elegida. Valores en siniestros esperados en toda la ciudad.</figcaption>
      <table className="sr-only">
        <caption>Siniestros esperados por hora del día</caption>
        <thead><tr><th scope="col">Hora</th><th scope="col">Esperados</th></tr></thead>
        <tbody>{curva.map((c) => <tr key={c.hora}><th scope="row">{c.hora}:00</th><td>{numero(c.esperados, 2)}</td></tr>)}</tbody>
      </table>
    </figure>
  );
}

export default async function Prediccion({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [, sp] = await Promise.all([requerirRol(PERMISOS.analizar), searchParams]);
  const ahora = new Date();
  const hoy = partesLocales(ahora);
  const dia = parsearDia(typeof sp.fecha === 'string' ? sp.fecha : undefined) ?? fechaLocal(hoy.anio, hoy.mes, hoy.dia);
  const horaPedida = Number(sp.hora);
  const hora = Number.isInteger(horaPedida) && horaPedida >= 0 && horaPedida <= 23 ? horaPedida : hoy.hora;
  const lluvia = sp.lluvia === '1';
  const d = partesLocales(dia);
  const momento = fechaLocal(d.anio, d.mes, d.dia, hora);

  const [{ modelo, validacion, entrenadoEn, datos }, unidades] = await Promise.all([
    modeloRiesgo(),
    db.select().from(e.unidades).where(eq(e.unidades.estado, 'disponible')),
  ]);

  const pronostico = pronosticar(modelo, momento, lluvia);
  const esperadosHora = pronostico.reduce((s, c) => s + c.lambda, 0);
  const curva = curvaDiaria(modelo, momento, lluvia);
  const esperadosDia = curva.reduce((s, c) => s + c.esperados, 0);
  const top = pronostico.slice(0, 15);
  const enMapa = pronostico.filter((c) => c.nivel !== 'bajo').slice(0, 200);

  // Recomendacion: riesgo acumulado de las proximas 3 horas por celda, sitios separados al menos 800 m.
  const acumulado = new Map<string, Pronostico & { suma: number }>();
  for (let i = 0; i < 3; i++) {
    for (const c of pronosticar(modelo, new Date(momento.getTime() + i * 3_600_000), lluvia)) {
      const a = acumulado.get(c.clave);
      if (a) a.suma += c.lambda; else acumulado.set(c.clave, { ...c, suma: c.lambda });
    }
  }
  const sitios: (Pronostico & { suma: number })[] = [];
  for (const c of [...acumulado.values()].sort((a, b) => b.suma - a.suma)) {
    if (sitios.every((s) => distanciaM(s.lat, s.lng, c.lat, c.lng) >= 800)) sitios.push(c);
    if (sitios.length === 5) break;
  }
  const libres = [...unidades];
  const recomendaciones = sitios.map((s) => {
    const preferido = s.total && s.graves / s.total > 0.25 ? ['ambulancia', 'motorizado'] : ['motorizado', 'agente', 'patrulla'];
    libres.sort((a, b) => {
      const pa = preferido.includes(a.tipo) ? 0 : 1, pb = preferido.includes(b.tipo) ? 0 : 1;
      return pa - pb || (a.lat == null ? 1e9 : distanciaM(s.lat, s.lng, a.lat, a.lng!)) - (b.lat == null ? 1e9 : distanciaM(s.lat, s.lng, b.lat, b.lng!));
    });
    const unidad = libres.shift();
    return { sitio: s, unidad, distancia: unidad?.lat != null ? distanciaM(s.lat, s.lng, unidad.lat, unidad.lng!) : null, tipo: preferido[0] };
  });

  const fHora = modelo.fHora[hora], fDia = modelo.fDia[d.diaSemana];
  const horasOpciones = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={`Modelo entrenado ${formatoFechaHora(entrenadoEn)} · ${datos.length.toLocaleString('es-CO')} siniestros de 3 años`}
        titulo="Predicción de"
        destacado="riesgo"
        descripcion="Dónde y cuándo es más probable que ocurra un siniestro, según el historial. Úsala para ubicar unidades y planear controles."
      />

      <Panel titulo="Escenario" descripcion="Por defecto, la hora actual en Cartagena.">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-sm font-semibold text-tinta-2">Fecha</span>
            <input type="date" name="fecha" defaultValue={diaISO(dia)} className="campo mt-1 min-h-10 py-1.5" />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-tinta-2">Hora</span>
            <select name="hora" defaultValue={hora} className="campo mt-1 min-h-10 py-1.5">
              {horasOpciones.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </label>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-borde-fuerte bg-superficie px-4">
            <input type="checkbox" name="lluvia" value="1" defaultChecked={lluvia} className="size-4 accent-marca" />
            <CloudRain className="size-4" aria-hidden="true" />Está lloviendo
          </label>
          <button type="submit" className="boton boton-primario boton-chico min-h-10">Calcular</button>
        </form>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta={`Esperados ${String(hora).padStart(2, '0')}:00–${String((hora + 1) % 24).padStart(2, '0')}:00`} icono={Gauge} valor={numero(esperadosHora, 2)}
          detalle="Siniestros esperados en toda la ciudad en esa hora." />
        <Kpi etiqueta={`Esperados el ${DIAS_SEMANA[d.diaSemana].toLowerCase()}`} icono={Radar} valor={numero(esperadosDia, 1)} detalle="Suma de las 24 horas del día elegido." />
        <Kpi etiqueta="Intensidad de la hora" icono={Target} valor={numero(fHora * fDia * (lluvia ? modelo.fLluvia : 1), 2)} unidad="×"
          detalle="Frente a una hora promedio (1 = normal)." />
        <Kpi etiqueta="Precisión (PAI)" valor={validacion ? numero(validacion.pai, 1) : '—'} unidad={validacion ? '×' : undefined}
          detalle={validacion ? `${numero(validacion.tasa * 100, 0)} % de los siniestros de las últimas 8 semanas cayó en el 10 % de zonas más riesgosas.` : 'Datos insuficientes para validar.'} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Panel titulo="Mapa de riesgo" descripcion={`${formatoFechaHora(momento)}${lluvia ? ' · con lluvia' : ''}. Zonas de ~400 m; solo se muestran niveles medio o superior.`}>
          <Mapa etiqueta="Mapa de riesgo por zona" alto="28rem"
            capas={[{
              tipo: 'circulos',
              items: enMapa.map((c) => ({
                lat: c.lat, lng: c.lng, radioM: 200, color: NIVEL[c.nivel].color, relleno: c.nivel === 'muy_alto' ? 0.45 : 0.25,
                ventana: { titulo: `${c.barrio} · riesgo ${NIVEL[c.nivel].texto.toLowerCase()}`, lineas: [`Probabilidad en la hora: ${numero(c.probabilidad * 100, 1)} %`, `${numero(c.relativo, 1)} veces el promedio`, `${c.total} siniestros en el historial`] },
              })),
            }]} />
          <ul className="mt-3 flex flex-wrap gap-4 text-sm text-tinta-2">
            {(['muy_alto', 'alto', 'medio'] as const).map((n) => (
              <li key={n} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: NIVEL[n].color }} />Riesgo {NIVEL[n].texto.toLowerCase()}</li>
            ))}
          </ul>
        </Panel>

        <Panel titulo="¿Qué pesa en este escenario?" descripcion="Factores del modelo, en lenguaje simple.">
          <ul className="space-y-4">
            <li>
              <p className="font-semibold">La hora ({String(hora).padStart(2, '0')}:00)</p>
              <p className="text-tinta-2">{fHora >= 1 ? `A esta hora ocurren ${veces(fHora)} más siniestros que en una hora promedio.` : `A esta hora ocurren menos siniestros que en una hora promedio (${veces(fHora)}).`}</p>
            </li>
            <li>
              <p className="font-semibold">El día ({DIAS_SEMANA[d.diaSemana]})</p>
              <p className="text-tinta-2">{fDia >= 1 ? `Los ${DIAS_SEMANA[d.diaSemana].toLowerCase()} tienen ${veces(fDia)} la siniestralidad de un día promedio.` : `Los ${DIAS_SEMANA[d.diaSemana].toLowerCase()} son más tranquilos que un día promedio (${veces(fDia)}).`}</p>
            </li>
            <li>
              <p className="font-semibold">La lluvia</p>
              <p className="text-tinta-2">Con lluvia el riesgo se multiplica por {numero(modelo.fLluvia, 2)}. {lluvia ? 'Está incluido en este escenario.' : 'No está incluido; marca «Está lloviendo» para verlo.'}</p>
            </li>
            <li>
              <p className="font-semibold">El lugar</p>
              <p className="text-tinta-2">Cada zona aporta su historial; los siniestros recientes pesan más (la importancia se reduce a la mitad cada 6 meses).</p>
            </li>
          </ul>
        </Panel>
      </div>

      <Panel titulo="Recomendación operativa" descripcion={`Dónde ubicar unidades entre las ${String(hora).padStart(2, '0')}:00 y las ${String((hora + 3) % 24).padStart(2, '0')}:00. Sitios separados al menos 800 m; unidad disponible más cercana.`}>
        <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recomendaciones.map((r, i) => (
            <li key={r.sitio.clave} className="rounded-xl border border-borde p-4">
              <p className="flex items-center gap-2"><span className="cifra text-3xl text-tinta-3">{String(i + 1).padStart(2, '0')}</span>
                <span className="font-semibold">{r.sitio.barrio}</span> <Insignia tono={NIVEL[r.sitio.nivel].tono}>{NIVEL[r.sitio.nivel].texto}</Insignia></p>
              <p className="anotacion mt-1 text-tinta-3">{coordenadas(r.sitio.lat, r.sitio.lng)}</p>
              <p className="mt-2 text-sm text-tinta-2">{numero(r.sitio.suma, 2)} siniestros esperados en 3 h · tipo sugerido: {UNIDAD[r.tipo]}</p>
              <p className="mt-1 text-sm font-semibold">
                {r.unidad ? <>Enviar: {r.unidad.nombre} ({UNIDAD[r.unidad.tipo]}){r.distancia != null && ` · a ${numero(r.distancia / 1000, 1)} km`}</> : 'Sin unidades disponibles.'}
              </p>
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel titulo="Siniestros esperados por hora" descripcion={`${DIAS_SEMANA[d.diaSemana]}${lluvia ? ', con lluvia' : ''}`}>
          <CurvaHoras curva={curva} hora={hora} />
        </Panel>
        <Panel titulo="Validación del modelo" descripcion="Prueba honesta: se entrena sin las últimas 8 semanas y se mide sobre ellas.">
          {validacion ? (
            <div className="space-y-3 text-tinta-2">
              <p>
                De los <strong className="text-tinta">{validacion.prueba}</strong> siniestros de las últimas 8 semanas,{' '}
                <strong className="text-tinta">{validacion.aciertos}</strong> ({numero(validacion.tasa * 100, 1)} %) ocurrieron en el 10 % de zonas que el modelo marcaba como más riesgosas
                (de {validacion.celdas} zonas con historial).
              </p>
              <p>
                El <strong className="text-tinta">PAI</strong> (índice de precisión predictiva) es {numero(validacion.pai, 2)}: el modelo concentra {numero(validacion.pai, 1)} veces
                más siniestros que si se eligieran zonas al azar. {validacion.pai >= 2 ? 'Es una concentración útil para planear operativos.' : 'La concentración es moderada; úsalo con criterio.'}
              </p>
            </div>
          ) : <p className="text-tinta-2">No hay suficientes datos recientes para validar.</p>}
        </Panel>
      </div>

      <Panel titulo="Zonas de mayor riesgo" descripcion={`Top 15 para ${formatoFechaHora(momento)}`}>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="tabla">
            <caption className="sr-only">Zonas de mayor riesgo en el escenario elegido</caption>
            <thead>
              <tr>
                <th scope="col" className="num">#</th><th scope="col">Zona</th><th scope="col">Nivel</th>
                <th scope="col" className="num">Probabilidad en la hora</th><th scope="col" className="num">Riesgo relativo</th>
                <th scope="col" className="num">Historial</th><th scope="col" className="num">Graves y fatales</th>
              </tr>
            </thead>
            <tbody>
              {top.map((c, i) => (
                <tr key={c.clave}>
                  <td className="num font-semibold">{i + 1}</td>
                  <td><span className="font-semibold">{c.barrio}</span><span className="anotacion block text-tinta-3">{coordenadas(c.lat, c.lng)}</span></td>
                  <td><Insignia tono={NIVEL[c.nivel].tono}>{NIVEL[c.nivel].texto}</Insignia></td>
                  <td className="num">{numero(c.probabilidad * 100, 2)} %</td>
                  <td className="num">{numero(c.relativo, 1)}×</td>
                  <td className="num">{c.total}</td>
                  <td className="num">{c.graves}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel titulo="Cómo funciona">
        <p className="max-w-3xl text-tinta-2">
          Modelo de conteos (Poisson): para cada zona de ~400 m se estima cuántos siniestros ocurren por hora según su historial, y se ajusta por la hora del día,
          el día de la semana y la lluvia. La probabilidad de al menos un siniestro en la hora es 1 − e<sup>−λ</sup>. Es un modelo explicable: no adivina, resume
          patrones del historial verificado de los últimos 3 años y se reentrena cada 10 minutos.
        </p>
      </Panel>
    </div>
  );
}
