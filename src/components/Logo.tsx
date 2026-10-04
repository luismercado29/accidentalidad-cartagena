/** Marca: rombo de señal preventiva con una linea de pulso. */
export function Logo({ claro = false, compacto = false }: { claro?: boolean; compacto?: boolean }) {
  return (
    <span className={`flex items-center gap-2.5 text-[1.4rem] font-bold tracking-tight ${claro ? 'text-white' : 'text-tinta'}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" fill="none">
        <rect x="4.7" y="4.7" width="22.6" height="22.6" rx="4" transform="rotate(45 16 16)" fill="#FFC21A" stroke="#121019" strokeWidth="1.6" />
        <path d="M7.5 16.5h5l2-5 3 10 2.2-6.5 1.3 1.5h3.5" stroke="#121019" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compacto && <span className="max-[359px]:sr-only">Pulso <span className="serif text-[1.12em]">Vial</span></span>}
    </span>
  );
}
