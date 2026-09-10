import type { ReactNode } from "react";

interface CartaoProps {
  titulo: string;
  /** Uma linha explicando o que o bloco responde, sem jargao. */
  descricao?: string;
  acao?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Moldura padrao de todo bloco do painel. */
export function Cartao({
  titulo,
  descricao,
  acao,
  children,
  className = "",
}: CartaoProps) {
  return (
    <section
      className={`rounded-xl border border-borda bg-superficie shadow-[0_1px_2px_rgba(16,24,40,0.05)] ${className}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-borda px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-tinta">
            {titulo}
          </h2>
          {descricao && (
            <p className="mt-0.5 text-sm text-tinta-media">{descricao}</p>
          )}
        </div>
        {acao}
      </header>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

interface NumeroDestaqueProps {
  rotulo: string;
  valor: string;
  /** Contexto abaixo do numero: "14,2% do faturamento", por exemplo. */
  apoio?: string;
  cor?: string;
  tamanho?: "medio" | "grande";
}

/** Numero grande, legivel a distancia. Nada de 12px como protagonista. */
export function NumeroDestaque({
  rotulo,
  valor,
  apoio,
  cor = "var(--color-tinta)",
  tamanho = "medio",
}: NumeroDestaqueProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
        {rotulo}
      </p>
      <p
        className={`numerico mt-1 font-semibold tracking-tight ${
          tamanho === "grande"
            ? "text-4xl xl:text-5xl"
            : "text-2xl xl:text-3xl"
        }`}
        style={{ color: cor }}
      >
        {valor}
      </p>
      {apoio && <p className="mt-1 text-sm text-tinta-media">{apoio}</p>}
    </div>
  );
}
