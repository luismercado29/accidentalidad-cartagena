import { asc } from 'drizzle-orm';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { eliminarCamara, guardarCamara } from '@/app/acciones/territorio';
import { FiltroTiempo } from '@/components/FiltroTiempo';
import { BotonEnviar } from '@/components/formulario';
import { Mapa } from '@/components/mapa/Mapa';
import { Mensaje, param } from '@/components/territorio/Mensaje';
import { ReproductorCamara } from '@/components/territorio/ReproductorCamara';
import { SelectorPunto } from '@/components/territorio/SelectorPunto';
import { Aviso, Encabezado, Insignia, Panel } from '@/components/ui';
import { db, esquema as e } from '@/db';
import { aniosDisponibles, puntosMapa } from '@/lib/consultas';
import { COLOR_MAPA } from '@/lib/etiquetas';
import { distanciaM } from '@/lib/geo';
import { puede, requerirRol, PERMISOS } from '@/lib/sesion';
import { diaISO, paramsPeriodo, resolverPeriodo } from '@/lib/tiempo';

export const metadata = { title: 'Cámaras' };

const RADIO_M = 300;
const TIPOS = { hls: 'Video HLS (.m3u8)', mjpeg: 'MJPEG (flujo de imágenes)', imagen: 'Imagen que se actualiza', embed: 'Visor externo (iframe)' } as const;

export default async function Camaras({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [u, sp] = await Promise.all([requerirRol(PERMISOS.operar), searchParams]);
  const periodo = resolverPeriodo(sp, '90d');
  const [camaras, puntos, anios] = await Promise.all([
    db.select().from(e.camaras).orderBy(asc(e.camaras.nombre)),
    puntosMapa({ periodo }),
    aniosDisponibles(),
  ]);
  const config = puede(u, 'configurar');
  const editarId = Number(param(sp, 'editar')) || null;
  const editando = editarId ? camaras.find((c) => c.id === editarId) : undefined;
  const mostrarFormulario = config && (param(sp, 'nueva') === '1' || !!editando);
  const cerca = new Map(camaras.map((c) => {
    const ps = puntos.filter((p) => Math.abs(p.lat - c.lat) < 0.004 && Math.abs(p.lng - c.lng) < 0.004 && distanciaM(c.lat, c.lng, p.lat, p.lng) <= RADIO_M);
    return [c.id, { total: ps.length, graves: ps.filter((p) => p.gravedad === 'grave' || p.gravedad === 'fatal').length, puntos: ps }];
  }));
  const conectadas = camaras.filter((c) => c.activa && c.urlStream).length;
  const qs = paramsPeriodo(sp).toString();

  return (
    <div className="space-y-6">
      <Encabezado
        anotacion={`Territorio · ${periodo.etiqueta}`}
        titulo="Cámaras" destacado="de tránsito"
        descripcion={`${camaras.length} cámaras registradas · ${conectadas} con señal configurada. Siniestros a menos de ${RADIO_M} m de cada cámara en el periodo.`}
        acciones={<>
          <FiltroTiempo actual={periodo.clave} etiqueta={periodo.etiqueta} anios={anios} desde={periodo.desde ? diaISO(periodo.desde) : undefined} hasta={diaISO(new Date(periodo.hasta.getTime() - 1))} />
          {config && <Link href={`/consola/camaras?nueva=1${qs ? `&${qs}` : ''}#formulario`} className="boton boton-primario"><Plus className="size-4" aria-hidden="true" />Registrar cámara</Link>}
        </>}
      />
      <Mensaje sp={sp} />
      <Aviso tono="info">
        La conexión con la red de cámaras de la ciudad es una integración prevista: cada cámara queda registrada con su ubicación y,
        cuando se habilite el acceso, basta con pegar la dirección segura (https) del video. Se admiten HLS, MJPEG, imágenes periódicas y visores externos.
      </Aviso>

      {mostrarFormulario && (
        <Panel titulo={editando ? `Editar «${editando.nombre}»` : 'Registrar cámara'} className="scroll-mt-24">
          <form id="formulario" action={guardarCamara} className="grid gap-4 lg:grid-cols-2">
            {editando && <input type="hidden" name="id" value={editando.id} />}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="cam-nombre" className="block font-semibold">Nombre <span aria-hidden="true" className="text-error">*</span></label>
                <input id="cam-nombre" name="nombre" className="campo" required minLength={3} maxLength={120} defaultValue={editando?.nombre} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cam-tipo" className="block font-semibold">Tipo de señal</label>
                <select id="cam-tipo" name="tipo" className="campo" defaultValue={editando?.tipo ?? 'hls'}>
                  {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cam-url" className="block font-semibold">Dirección del video (https)</label>
                <input id="cam-url" name="urlStream" type="url" className="campo font-mono text-sm" maxLength={500} placeholder="https://…" defaultValue={editando?.urlStream ?? ''} aria-describedby="cam-url-ayuda" />
                <p id="cam-url-ayuda" className="text-sm text-tinta-2">Déjala vacía si la conexión aún está pendiente.</p>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="cam-desc" className="block font-semibold">Descripción</label>
                <textarea id="cam-desc" name="descripcion" className="campo" rows={2} maxLength={500} defaultValue={editando?.descripcion ?? ''} />
              </div>
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" name="activa" defaultChecked={editando?.activa ?? true} className="size-5 accent-marca" /> Activa
              </label>
              <div className="flex flex-wrap gap-2">
                <BotonEnviar pendiente="Guardando…">{editando ? 'Guardar cambios' : 'Registrar'}</BotonEnviar>
                <Link href="/consola/camaras" className="boton boton-secundario">Cancelar</Link>
              </div>
            </div>
            <SelectorPunto lat={editando?.lat} lng={editando?.lng} icono="camara" color="#2437C7" />
          </form>
          {editando && (
            <form action={eliminarCamara} className="mt-4 border-t border-borde pt-4">
              <input type="hidden" name="id" value={editando.id} />
              <button type="submit" className="boton boton-peligro boton-chico"><Trash2 className="size-4" aria-hidden="true" />Eliminar cámara</button>
            </form>
          )}
        </Panel>
      )}

      <section aria-label="Mosaico de cámaras" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {camaras.map((c) => {
          const n = cerca.get(c.id)!;
          return (
            <article key={c.id} className="tarjeta overflow-hidden">
              {c.activa ? <ReproductorCamara nombre={c.nombre} url={c.urlStream} tipo={c.tipo} /> : (
                <div className="grid aspect-video place-items-center bg-hundido text-tinta-2">Cámara desactivada</div>
              )}
              <div className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-bold">{c.nombre}</h2>
                  {config && <Link href={`/consola/camaras?editar=${c.id}${qs ? `&${qs}` : ''}#formulario`} className="boton boton-fantasma boton-chico px-2" aria-label={`Editar ${c.nombre}`}><Pencil className="size-4" aria-hidden="true" /></Link>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Insignia tono={!c.activa ? 'neutro' : c.urlStream ? 'ok' : 'aviso'}>{!c.activa ? 'Inactiva' : c.urlStream ? 'Señal configurada' : 'Conexión pendiente'}</Insignia>
                  <Insignia tono={n.graves ? 'peligro' : 'neutro'} punto={false}>{n.total} siniestros cerca · {n.graves} graves o fatales</Insignia>
                </div>
                {c.descripcion && <p className="text-sm text-tinta-2">{c.descripcion}</p>}
                <p className="anotacion text-tinta-3">{c.lat.toFixed(4)}° N · {Math.abs(c.lng).toFixed(4)}° O</p>
              </div>
            </article>
          );
        })}
      </section>

      <Panel titulo="Mapa de cámaras" descripcion={`Siniestros a menos de ${RADIO_M} m de alguna cámara · ${periodo.etiqueta.toLowerCase()}`}>
        <Mapa etiqueta="Mapa de cámaras de tránsito y siniestros cercanos" alto="28rem" ajustar
          capas={[
            { tipo: 'circulos', items: camaras.map((c) => ({ lat: c.lat, lng: c.lng, radioM: RADIO_M, color: '#2437C7', relleno: 0.06 })) },
            { tipo: 'puntos', items: [...cerca.values()].flatMap((x) => x.puntos).map((p) => ({ lat: p.lat, lng: p.lng, color: COLOR_MAPA[p.gravedad], radio: 4 })) },
            { tipo: 'marcadores', items: camaras.map((c) => ({ lat: c.lat, lng: c.lng, icono: 'camara' as const, color: c.urlStream ? '#2437C7' : '#121019', etiqueta: c.nombre, ventana: { titulo: c.nombre, lineas: [`${cerca.get(c.id)!.total} siniestros cerca`, c.urlStream ? 'Señal configurada' : 'Conexión pendiente'] } })) },
          ]} />
      </Panel>
    </div>
  );
}
