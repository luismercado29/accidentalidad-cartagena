'use client';

import { CircleSlash, Cctv, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

type Tipo = 'hls' | 'mjpeg' | 'imagen' | 'embed';

/**
 * Reproductor de una camara de transito.
 * - HLS: nativo en Safari; en el resto, hls.js cargado bajo demanda.
 * - MJPEG: <img> (el navegador mantiene el flujo).
 * - Imagen fija: <img> que se refresca cada 10 s.
 * - Embed: iframe aislado (sandbox) para visores de terceros.
 * Sin URL: «conexion pendiente» (integracion futura con la red de camaras de la ciudad).
 */
export function ReproductorCamara({ nombre, url, tipo }: { nombre: string; url: string | null; tipo: Tipo }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);
  const [marca, setMarca] = useState(0);

  useEffect(() => {
    if (!url || tipo !== 'hls' || !video.current) return;
    const v = video.current;
    let hls: { destroy: () => void } | null = null;
    let vivo = true;
    setError(false);
    if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = url;
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (!vivo) return;
        if (!Hls.isSupported()) { setError(true); return; }
        const h = new Hls({ lowLatencyMode: true });
        h.on(Hls.Events.ERROR, (_ev, datos) => { if (datos.fatal) setError(true); });
        h.loadSource(url);
        h.attachMedia(v);
        hls = h;
      }).catch(() => setError(true));
    }
    return () => { vivo = false; hls?.destroy(); };
  }, [url, tipo]);

  useEffect(() => {
    if (!url || tipo !== 'imagen') return;
    const t = setInterval(() => setMarca(Date.now()), 10_000);
    return () => clearInterval(t);
  }, [url, tipo]);

  if (!url) {
    return (
      <div className="grid aspect-video place-items-center bg-noche p-4 text-center text-white/80">
        <div>
          <Cctv className="mx-auto size-8 text-senal" aria-hidden="true" />
          <p className="mt-2 font-semibold text-white">Conexión pendiente</p>
          <p className="text-sm">Lista para enlazarse con la red de cámaras de la ciudad.</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div role="status" className="grid aspect-video place-items-center bg-noche p-4 text-center text-white/80">
        <div>
          <CircleSlash className="mx-auto size-8 text-senal" aria-hidden="true" />
          <p className="mt-2 font-semibold text-white">Sin señal</p>
          <button type="button" className="boton boton-claro boton-chico mt-3" onClick={() => { setError(false); setMarca(Date.now()); }}>
            <RefreshCw className="size-4" aria-hidden="true" />Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (tipo === 'hls') {
    return <video ref={video} className="aspect-video w-full bg-noche" muted autoPlay playsInline controls aria-label={`Video en vivo: ${nombre}`} onError={() => setError(true)} />;
  }
  if (tipo === 'embed') {
    return <iframe src={url} title={`Cámara: ${nombre}`} className="aspect-video w-full bg-noche" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" allow="autoplay" loading="lazy" />;
  }
  const src = tipo === 'imagen' && marca ? `${url}${url.includes('?') ? '&' : '?'}t=${marca}` : url;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={`Imagen de la cámara ${nombre}`} className="aspect-video w-full bg-noche object-cover" onError={() => setError(true)} />;
}
