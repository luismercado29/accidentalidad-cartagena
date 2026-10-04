import { and, count, desc, eq, type SQL } from 'drizzle-orm';
import { BellRing, Check } from 'lucide-react';
import Link from 'next/link';

import { alternarZona, atenderAlerta, eliminarZona, guardarZona } from '@/app/acciones/operacion';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BotonEnviar } from '@/components/formulario';
import { Mapa } from '@/components/mapa/Mapa';
import { FormAccion } from '@/components/operacion/FormAccion';
import { SelectorUbicacion } from '@/components/operacion/SelectorUbicacion';
import { Aviso, Encabezado, Insignia, Kpi, Panel, Vacio } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, enPeriodo } from '@/lib/consultas';
import { NIVEL_ALERTA } from '@/lib/etiquetas';
import { PERMISOS, puede, requerirRol } from '@/lib/sesion';
import { diaISO, formatoFechaHora, paramsPeriodo, resolverPeriodo } from '@/lib/tiempo';

export const metadata = { title: 'Alertas por zona' };

type SP = Record<string, string | string[] | undefined>;

export default async function Alertas({ searchParams }: { searchParams: Promise<SP> }) {
  const usuario = await requerirRol(PERMISOS.operar);
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, '7d');
  const ver = (Array.isArray(sp.ver) ? sp.ver[0] : sp.ver) === 'todas' ? 'todas' : 'pendientes';
  const configurar = puede(usuario, 'configurar');
  const eliminada = (Array.isArray(sp.eliminada) ? sp.eliminada[0] : sp.eliminada)?.slice(0, 120);

  const donde = and(...([enPeriodo(e.alertas.creado, periodo), ver === 'pendientes' ? eq(e.alertas.atendida, false) : undefined] as (SQL | undefined)[]));
  const [lista, zonas, porZona, [pendientes], [enPeriodoTotal], anios] = await Promise.all([
    db.select({ alerta: e.alertas, zona: e.zonasAlerta.nombre, geocerca: e.geocercas.nombre, atendio: e.usuarios.nombre })
      .from(e.alertas)
      .leftJoin(e.zonasAlerta, eq(e.zonasAlerta.id, e.alertas.zonaId))
      .leftJoin(e.geocercas, eq(e.geocercas.id, e.alertas.geocercaId))
      .leftJoin(e.usuarios, eq(e.usuarios.id, e.alertas.atendidaPor))
      .where(donde).orderBy(desc(e.alertas.creado)).limit(100),
    db.select().from(e.zonasAlerta).orderBy(e.zonasAlerta.nombre),
    db.select({ zonaId: e.alertas.zonaId, n: count() }).from(e.alertas).where(enPeriodo(e.alertas.creado, periodo)).groupBy(e.alertas.zonaId),
    db.select({ n: count() }).from(e.alertas).where(eq(e.alertas.atendida, false)),
    db.select({ n: count() }).from(e.alertas).where(enPeriodo(e.alertas.creado, periodo)),
    aniosDisponibles(),
  ]);
  const conteo = new Map(porZona.map((z) => [z.zonaId, z.n]));
  const enlaceVer = (v: string) => { const u = paramsPeriodo(sp); if (v === 'todas') u.set('ver', 'todas'); return `/consola/alertas?${u.toString()}`; };

  return (
    <div className="space-y-6">
      <Encabezado anotacion={`Vigilancia · ${periodo.etiqueta}`} titulo="Alertas" destacado="por zona"
        descripcion="Avisan cuando una zona acumula más eventos de lo normal en poco tiempo, o cuando un incidente grave cae dentro de una geocerca crítica."
        acciones={<FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />} />

      {eliminada && <Aviso tono="exito">Zona «{eliminada}» eliminada.</Aviso>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi etiqueta="Sin atender (todas las fechas)" valor={pendientes.n} icono={BellRing} tono={pendientes.n ? 'grave' : 'normal'} />
        <Kpi etiqueta="Disparadas en el periodo" valor={enPeriodoTotal.n} />
        <Kpi etiqueta="Zonas vigiladas" valor={zonas.filter((z) => z.activa).length} detalle={`${zonas.length} configuradas`} />
      </div>

      <Panel titulo="¿Cómo funciona el umbral?">
        <ol className="grid gap-4 text-sm sm:grid-cols-3">
          <li><span className="cifra block text-4xl text-marca">01</span>Cada zona es un círculo: un punto central y un radio en metros.</li>
          <li><span className="cifra block text-4xl text-marca">02</span>El sistema cuenta los reportes ciudadanos y los incidentes que caen dentro del círculo durante la ventana de tiempo (por ejemplo, los últimos 60 minutos).</li>
          <li><span className="cifra block text-4xl text-marca">03</span>Si el conteo llega al umbral, se dispara una alerta alta (crítica si duplica el umbral) y se avisa al equipo. Solo se dispara una vez por ventana.</li>
        </ol>
      </Panel>

      <Panel titulo="Alertas disparadas"
        acciones={
          <nav aria-label="Filtrar alertas" className="flex gap-1">
            {[['pendientes', 'Sin atender'], ['todas', 'Todas']].map(([v, t]) => (
              <Link key={v} href={enlaceVer(v)} aria-current={ver === v ? 'page' : undefined}
                className={`boton boton-chico ${ver === v ? 'boton-primario' : 'boton-secundario'}`}>{t}</Link>
            ))}
          </nav>
        }>
        {lista.length === 0 ? <Vacio titulo={ver === 'pendientes' ? 'No hay alertas sin atender en este periodo' : 'No hubo alertas en este periodo'} icono={BellRing} /> : (
          <ul className="divide-y divide-borde">
            {lista.map(({ alerta: a, zona, geocerca, atendio }) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <Insignia tono={NIVEL_ALERTA[a.nivel].tono}>{NIVEL_ALERTA[a.nivel].texto}</Insignia>
                    <span className="font-semibold">{a.titulo}</span>
                  </p>
                  <p className="text-sm text-tinta-2">{a.detalle}</p>
                  <p className="anotacion mt-1 text-tinta-3">{formatoFechaHora(a.creado)} · {zona ? `Zona: ${zona}` : geocerca ? `Geocerca: ${geocerca}` : 'Sin zona'}</p>
                  {a.atendida && <p className="mt-1 flex items-center gap-1 text-sm text-exito"><Check className="size-4" aria-hidden="true" />Atendida por {atendio ?? 'el equipo'}{a.nota ? `: ${a.nota}` : ''}</p>}
                </div>
                {!a.atendida && (
                  <FormAccion accion={atenderAlerta} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <label className="text-sm font-semibold text-tinta-2">Nota (opcional)
                      <input name="nota" maxLength={500} className="campo mt-1 min-h-10 py-1.5 font-normal text-tinta" placeholder="Se envió un agente a la zona" />
                    </label>
                    <BotonEnviar className="boton boton-secundario boton-chico min-h-10" pendiente="…">Marcar atendida<span className="sr-only">: {a.titulo}</span></BotonEnviar>
                  </FormAccion>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
        <Panel titulo="Mapa de zonas" descripcion="Azul: zona activa · gris: pausada.">
          <Mapa etiqueta="Mapa de zonas de alerta" alto="24rem" ajustar
            capas={[{ tipo: 'circulos', items: zonas.map((z) => ({ lat: z.lat, lng: z.lng, radioM: z.radioM, color: z.activa ? '#2437C7' : '#6B6880', ventana: { titulo: z.nombre, lineas: [`Umbral: ${z.umbral} eventos en ${z.ventanaMin} min`, `Radio: ${z.radioM} m`, z.activa ? 'Activa' : 'Pausada'] } })) }]} />
        </Panel>

        <Panel titulo="Zonas configuradas" descripcion={configurar ? 'Abre una zona para editar sus parámetros.' : 'Solo supervisión y administración pueden cambiarlas.'}>
          {zonas.length === 0 ? <Vacio titulo="No hay zonas configuradas" /> : (
            <ul className="divide-y divide-borde">
              {zonas.map((z) => (
                <li key={z.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="flex flex-wrap items-center gap-2 font-semibold">{z.nombre} <Insignia tono={z.activa ? 'ok' : 'neutro'}>{z.activa ? 'Activa' : 'Pausada'}</Insignia></p>
                      <p className="text-sm text-tinta-2">{z.umbral} eventos en {z.ventanaMin} min · radio {z.radioM} m · {conteo.get(z.id) ?? 0} alertas en el periodo{z.contacto ? ` · contacto: ${z.contacto}` : ''}</p>
                    </div>
                    {configurar && (
                      <div className="flex gap-2">
                        <FormAccion accion={alternarZona}>
                          <input type="hidden" name="id" value={z.id} />
                          <BotonEnviar className="boton boton-secundario boton-chico" pendiente="…">{z.activa ? 'Pausar' : 'Activar'}<span className="sr-only"> {z.nombre}</span></BotonEnviar>
                        </FormAccion>
                        <FormAccion accion={eliminarZona}>
                          <input type="hidden" name="id" value={z.id} />
                          <BotonEnviar className="boton boton-fantasma boton-chico text-error" pendiente="…">Eliminar<span className="sr-only"> {z.nombre}</span></BotonEnviar>
                        </FormAccion>
                      </div>
                    )}
                  </div>
                  {configurar && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm font-semibold text-marca">Editar parámetros<span className="sr-only"> de {z.nombre}</span></summary>
                      <FormAccion accion={guardarZona} className="mt-3 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="id" value={z.id} />
                        <label className="text-sm font-semibold sm:col-span-3">Nombre<input name="nombre" defaultValue={z.nombre} maxLength={120} className="campo mt-1 min-h-10 font-normal" /></label>
                        <label className="text-sm font-semibold">Latitud<input name="lat" type="number" step="0.000001" defaultValue={z.lat} className="campo mt-1 min-h-10 font-normal" /></label>
                        <label className="text-sm font-semibold">Longitud<input name="lng" type="number" step="0.000001" defaultValue={z.lng} className="campo mt-1 min-h-10 font-normal" /></label>
                        <label className="text-sm font-semibold">Radio (m)<input name="radioM" type="number" min={50} max={5000} defaultValue={z.radioM} className="campo mt-1 min-h-10 font-normal" /></label>
                        <label className="text-sm font-semibold">Umbral (eventos)<input name="umbral" type="number" min={1} max={50} defaultValue={z.umbral} className="campo mt-1 min-h-10 font-normal" /></label>
                        <label className="text-sm font-semibold">Ventana (min)<input name="ventanaMin" type="number" min={5} max={1440} defaultValue={z.ventanaMin} className="campo mt-1 min-h-10 font-normal" /></label>
                        <label className="text-sm font-semibold">Contacto<input name="contacto" defaultValue={z.contacto ?? ''} maxLength={200} className="campo mt-1 min-h-10 font-normal" /></label>
                        <span className="sm:col-span-3"><BotonEnviar className="boton boton-primario boton-chico" pendiente="Guardando…">Guardar zona</BotonEnviar></span>
                      </FormAccion>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {configurar && (
        <Panel titulo="Nueva zona de alerta">
          <FormAccion accion={guardarZona} limpiar className="grid gap-5 lg:grid-cols-[1fr_1.3fr]">
            <div className="space-y-3">
              <label className="block font-semibold">Nombre<input name="nombre" required maxLength={120} className="campo mt-1 font-normal" placeholder="Glorieta de Ternera" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block font-semibold">Umbral (eventos)<input name="umbral" type="number" min={1} max={50} defaultValue={3} className="campo mt-1 font-normal" /></label>
                <label className="block font-semibold">Ventana (minutos)<input name="ventanaMin" type="number" min={5} max={1440} defaultValue={60} className="campo mt-1 font-normal" /></label>
              </div>
              <label className="block font-semibold">Contacto de la persona a cargo<input name="contacto" maxLength={200} className="campo mt-1 font-normal" placeholder="Supervisor de zona, teléfono o correo" /></label>
              <BotonEnviar pendiente="Creando…">Crear zona</BotonEnviar>
            </div>
            <SelectorUbicacion etiqueta="Centro de la zona" radioM={500} alto="18rem"
              capas={[{ tipo: 'circulos', items: zonas.map((z) => ({ lat: z.lat, lng: z.lng, radioM: z.radioM, color: '#6B6880', relleno: 0.08 })) }]} />
          </FormAccion>
        </Panel>
      )}
    </div>
  );
}
