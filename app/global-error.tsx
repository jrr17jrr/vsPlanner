"use client";

import { useEffect } from "react";

/**
 * Único boundary que cobre o ROOT layout (`app/layout.tsx`) em si —
 * `app/error.tsx` cobre tudo abaixo dele, mas nunca o próprio
 * app/layout.tsx. Precisa declarar `<html>`/`<body>` porque substitui o
 * root layout inteiro quando ativado (ver docs do Next.js).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global]", error);
  }, [error]);

  return (
    <html lang="pt-BR" className="dark">
      <body style={{ background: "#0a0d12", color: "#f5f5f5" }}>
        <div
          style={{
            display: "flex",
            height: "100dvh",
            width: "100%",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "0 1rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "1.125rem", fontWeight: 600 }}>Algo deu errado</p>
          <p style={{ maxWidth: 380, fontSize: "0.875rem", color: "#a1a1aa" }}>
            Houve uma falha ao carregar o VSPlanner. Tente de novo — se persistir, avise o administrador.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              borderRadius: 6,
              background: "#00e1ff",
              color: "#0a0d12",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
