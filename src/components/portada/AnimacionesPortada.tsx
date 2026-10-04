'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

/**
 * Animaciones de la portada publica de Pulso Vial (estilo editorial):
 *  - titulares que aparecen linea a linea (SplitText mantiene el texto completo
 *    para lectores de pantalla: aria-label en el padre, piezas ocultas),
 *  - secciones que se revelan al hacer scroll (ScrollTrigger),
 *  - el mapa del heroe con parallax suave,
 *  - scroll suave con Lenis.
 * Nada de esto corre con "Reducir movimiento" (ajuste propio o del sistema).
 */
export function AnimacionesPortada({ children }: { children: React.ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const reducir = document.documentElement.classList.contains('reducir-movimiento')
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducir) return;
    raiz.current?.classList.add('js-anim');

    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Titular principal: linea por linea con mascara.
    const titular = raiz.current?.querySelector('[data-anim="titular"]');
    if (titular) {
      const split = SplitText.create(titular, { type: 'lines', mask: 'lines', aria: 'auto' });
      gsap.from(split.lines, { yPercent: 110, duration: 1.1, ease: 'expo.out', stagger: 0.09, delay: 0.1 });
    }
    gsap.from('[data-anim="entrada"]', { y: 24, opacity: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08, delay: 0.45 });
    gsap.from('[data-anim="portada"]', { y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', delay: 0.25 });

    // Parallax suave de las piezas del heroe.
    gsap.utils.toArray<HTMLElement>('[data-anim="portada"]').forEach((el, i) => {
      gsap.to(el, { yPercent: -6 - i * 4, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
    });

    // Titulares de seccion: palabras que suben.
    gsap.utils.toArray<HTMLElement>('[data-anim="titulo-seccion"]').forEach((el) => {
      const split = SplitText.create(el, { type: 'words', mask: 'words', aria: 'auto' });
      gsap.from(split.words, { yPercent: 100, duration: 0.9, ease: 'expo.out', stagger: 0.04, scrollTrigger: { trigger: el, start: 'top 85%' } });
    });

    // Bloques que se revelan.
    ScrollTrigger.batch('.revelar', {
      start: 'top 88%',
      onEnter: (els) => gsap.fromTo(els, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1, overwrite: true }),
    });

    // Numeros editoriales de "que puedes hacer" que crecen al pasar.
    gsap.utils.toArray<HTMLElement>('[data-anim="numero"]').forEach((el) => {
      gsap.from(el, { scale: 0.6, opacity: 0, duration: 1, ease: 'back.out(1.6)', scrollTrigger: { trigger: el, start: 'top 85%' } });
    });

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      raiz.current?.classList.remove('js-anim');
    };
  }, { scope: raiz });

  return <div ref={raiz}>{children}</div>;
}
