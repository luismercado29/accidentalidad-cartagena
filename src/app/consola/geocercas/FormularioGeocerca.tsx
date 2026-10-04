import { guardarGeocerca } from '@/app/acciones/territorio';
import { BotonEnviar } from '@/components/formulario';
import { EditorPoligono } from '@/components/territorio/EditorPoligono';
import { NIVEL_ALERTA } from '@/lib/etiquetas';

type Geocerca = { id: number; nombre: string; descripcion: string | null; poligono: [number, number][]; nivel: string; color: string; activa: boolean };

/** Formulario de creacion/edicion (componente de servidor con el editor cliente dentro). */
export function FormularioGeocerca({ g, otras }: { g?: Geocerca; otras: { coords: [number, number][]; color: string; nombre: string }[] }) {
  // El poligono se guarda en [lng,lat]; el editor trabaja en [lat,lng]. Se quita el vertice de cierre.
  const inicial = g ? g.poligono.slice(0, -1).map(([lng, lat]) => [lat, lng] as [number, number]) : undefined;
  return (
    <form action={guardarGeocerca} className="space-y-4">
      {g && <input type="hidden" name="id" value={g.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="gc-nombre" className="block font-semibold">Nombre <span aria-hidden="true" className="text-error">*</span></label>
          <input id="gc-nombre" name="nombre" className="campo" required minLength={3} maxLength={120} defaultValue={g?.nombre} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <label htmlFor="gc-desc" className="block font-semibold">Descripción</label>
          <textarea id="gc-desc" name="descripcion" className="campo" rows={2} maxLength={500} defaultValue={g?.descripcion ?? ''} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="gc-nivel" className="block font-semibold">Nivel de alerta</label>
          <select id="gc-nivel" name="nivel" className="campo" defaultValue={g?.nivel ?? 'medio'}>
            {Object.entries(NIVEL_ALERTA).map(([k, v]) => <option key={k} value={k}>{v.texto}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="gc-color" className="block font-semibold">Color en el mapa</label>
          <input id="gc-color" name="color" type="color" className="campo h-11 p-1" defaultValue={g?.color ?? '#B45309'} />
        </div>
      </div>
      <EditorPoligono inicial={inicial} color={g?.color} otras={otras} />
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="activa" defaultChecked={g?.activa ?? true} className="size-5 accent-marca" />
        <span>Activa (genera alertas cuando ocurre un incidente grave dentro)</span>
      </label>
      <BotonEnviar pendiente="Guardando…">{g ? 'Guardar cambios' : 'Crear geocerca'}</BotonEnviar>
    </form>
  );
}
