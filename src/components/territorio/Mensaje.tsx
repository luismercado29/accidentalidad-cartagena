import { Aviso } from '@/components/ui';

type SP = Record<string, string | string[] | undefined>;
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Muestra el resultado de una accion que redirigio con ?ok= o ?error=. */
export function Mensaje({ sp }: { sp: SP }) {
  const ok = uno(sp.ok)?.slice(0, 200);
  const error = uno(sp.error)?.slice(0, 200);
  if (!ok && !error) return null;
  return error ? <Aviso tono="error">{error}</Aviso> : <Aviso tono="exito">{ok}</Aviso>;
}

export const param = (sp: SP, k: string) => uno(sp[k]);
