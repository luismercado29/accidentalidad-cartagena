'use client';

export default function ErrorGlobal({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CO">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#FBFAF7', color: '#14121F', display: 'grid', placeItems: 'center', minHeight: '100dvh', margin: 0 }}>
        <div role="alert" style={{ textAlign: 'center', padding: 24 }}>
          <h1>Algo salió mal</h1>
          <p>Recarga la página. Si el problema sigue, inténtalo en unos minutos.</p>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: '0 20px', borderRadius: 999, border: 0, background: '#2437C7', color: '#fff', fontWeight: 600 }}>Reintentar</button>
        </div>
      </body>
    </html>
  );
}
