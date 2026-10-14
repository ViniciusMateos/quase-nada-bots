import React from 'react';

/**
 * Variante WEB do SplashGate: sem splash. No navegador o app já abre direto — o splash animado
 * (cachorro + anel) é coisa do app nativo. Só renderiza o conteúdo.
 */
export function SplashGate({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
