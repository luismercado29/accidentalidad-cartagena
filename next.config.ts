import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite (Postgres en WebAssembly, solo para desarrollo local) no se empaqueta.
  serverExternalPackages: ['@electric-sql/pglite'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        // La geolocalizacion se usa para reportar un siniestro y para la ruta segura.
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(self)' },
      ],
    }];
  },
};

export default config;
