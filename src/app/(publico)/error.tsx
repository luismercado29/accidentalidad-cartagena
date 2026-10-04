'use client';

import { ErrorVista } from '@/components/ErrorVista';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="contenedor"><ErrorVista error={error} reset={reset} /></div>;
}
