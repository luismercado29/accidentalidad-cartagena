import { cookies } from 'next/headers';

import { Cabecera } from '@/components/Cabecera';
import { Pie } from '@/components/Pie';
import { COOKIE_ACCESIBILIDAD, leerCookie, normalizarPreferencias } from '@/lib/accesibilidad';
import { usuarioActual } from '@/lib/sesion';

export default async function LayoutPublico({ children }: { children: React.ReactNode }) {
  const [usuario, almacen] = await Promise.all([usuarioActual(), cookies()]);
  const preferencias = usuario && Object.keys(usuario.accesibilidad).length
    ? normalizarPreferencias(usuario.accesibilidad)
    : leerCookie(almacen.get(COOKIE_ACCESIBILIDAD)?.value);
  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecera usuario={usuario} preferencias={preferencias} />
      <main id="contenido" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      <Pie />
    </div>
  );
}
