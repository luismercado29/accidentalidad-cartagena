/** Plantilla editorial para paginas de texto (accesibilidad, privacidad). */
export function PaginaTexto({ anotacion, titulo, destacado, secciones, actualizado }: {
  anotacion: string; titulo: string; destacado: string; actualizado: string;
  secciones: { titulo: string; parrafos?: string[]; lista?: string[] }[];
}) {
  return (
    <article className="contenedor grid gap-10 py-14 lg:grid-cols-[1fr_2fr] lg:py-20">
      <header>
        <p className="anotacion text-tinta-3">{anotacion}</p>
        <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{titulo} <span className="serif text-marca">{destacado}</span>.</h1>
        <p className="anotacion mt-6 text-tinta-3">Actualizado: {actualizado}</p>
      </header>
      <div className="max-w-[70ch] space-y-10 text-lg">
        {secciones.map((s, i) => (
          <section key={s.titulo} aria-labelledby={`s-${i}`}>
            <h2 id={`s-${i}`} className="flex items-baseline gap-4 text-2xl font-bold">
              <span className="anotacion text-tinta-3" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>{s.titulo}
            </h2>
            {s.parrafos?.map((p) => <p key={p} className="mt-3 text-tinta-2">{p}</p>)}
            {s.lista && (
              <ul className="mt-3 list-disc space-y-1.5 pl-6 text-tinta-2 marker:text-marca">
                {s.lista.map((l) => <li key={l}>{l}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
