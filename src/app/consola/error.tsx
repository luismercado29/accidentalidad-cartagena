'use client';

import { ErrorVista } from '@/components/ErrorVista';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorVista error={error} reset={reset} volver="/consola" />;
}
