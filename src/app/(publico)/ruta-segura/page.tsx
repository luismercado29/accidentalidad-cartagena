import { PlanificadorRuta } from './PlanificadorRuta';

export const metadata = { title: 'Ruta segura', description: 'Compara rutas en Cartagena según el historial de siniestros viales y elige la más segura para tu hora de viaje.' };

export default function RutaSegura() {
  return (
    <div className="contenedor py-10">
      <header className="mb-8 max-w-3xl">
        <p className="anotacion text-tinta-3">Rutas evaluadas con el historial de siniestros</p>
        <h1 className="titular mt-3">Llega, pero llega <span className="serif text-marca">bien</span>.</h1>
        <p className="mt-4 text-lg text-tinta-2">
          Elige origen y destino. Comparamos las rutas posibles contra tres años de siniestros registrados en Cartagena y te
          mostramos la más segura, los tramos peligrosos y qué hacer en ellos.
        </p>
      </header>
      <PlanificadorRuta />
    </div>
  );
}
