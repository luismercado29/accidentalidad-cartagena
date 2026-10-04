import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <main id="contenido" className="grid min-h-dvh place-items-center px-4 py-16 text-center">
      <div>
        <div className="franja mx-auto mb-8 h-3 w-40 rounded-full" aria-hidden="true" />
        <p className="cifra text-[8rem] text-tinta">404</p>
        <h1 className="mt-2 text-3xl font-bold">Esta vía está <span className="serif text-marca">cerrada</span></h1>
        <p className="mt-2 text-tinta-2">No encontramos la página. Puede que el enlace esté mal escrito.</p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/" className="boton boton-primario">Ir al inicio</Link>
          <Link href="/mapa" className="boton boton-secundario">Ver el mapa</Link>
        </div>
      </div>
    </main>
  );
}
