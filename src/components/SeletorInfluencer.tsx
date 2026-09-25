import Link from "next/link";

import { moeda, percentual, razaoSegura } from "@/lib/format";

export interface CartaoDeInfluencer {
  id: string;
  nome: string;
  marca: string;
  ativo: boolean;
  /** "30% sobre o faturamento bruto", pronto para exibir. */
  contrato: string;
  /** Faturamento bruto da marca no mes: todo pedido criado, com frete. */
  receitaBruta: number;
  /** Comissao do contrato no mes. */
  comissao: number;
  /** Despesas do mes, com a parte dele nas compartilhadas. */
  despesas: number;
}

interface SeletorInfluencerProps {
  influencers: CartaoDeInfluencer[];
  selecionadoId: string | null;
  mes: string;
}

/**
 * Escolha do influencer.
 *
 * Cartoes com link, e nao um <select>: o nome sozinho nao ajuda a escolher, e
 * o cartao ja responde a primeira pergunta antes do clique. Sao poucos
 * contratos; cabem na tela e no celular empilham.
 *
 * O cartao mostra TRES numeros, nao um (23/09/2026). Ate aqui era so o custo
 * -- comissao e despesas somadas --, e um custo sem a receita ao lado nao diz
 * se e caro ou barato: R$ 50 mil e pouco em cima de R$ 800 mil e muito em cima
 * de R$ 100 mil. E comissao e despesa somadas escondiam qual das duas mexer.
 * Por isso: receita bruta da marca, comissao e despesas, lado a lado.
 *
 * Embaixo das despesas vai quanto elas pesam na receita bruta da marca
 * (25/09/2026, pedido do dono). E a conta que ele fazia de cabeca entre os dois
 * numeros do cartao, e a divisao usa exatamente esses dois: o percentual se
 * confere olhando o proprio cartao.
 *
 * A escolha mora na URL (?influencer=), como os filtros do relatorio: o
 * detalhe de um influencer vira um link que da para mandar, e o seletor de mes
 * do cabecalho preserva a escolha ao trocar de mes.
 */
export function SeletorInfluencer({ influencers, selecionadoId, mes }: SeletorInfluencerProps) {
  const endereco = (id: string | null) => {
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    if (id) params.set("influencer", id);
    const consulta = params.toString();
    const caminho = consulta ? `/influencers?${consulta}` : "/influencers";
    /*
     * Escolher um influencer leva direto a grade (#custos). No celular os
     * cartoes empilham, e sem a ancora a pagina recarregava no topo com a
     * grade escondida seis cartoes abaixo -- o toque parecia nao ter feito nada.
     */
    return id ? `${caminho}#custos` : caminho;
  };

  const classe = (ativo: boolean) =>
    `block rounded-xl border px-4 py-3 transition-colors ${
      ativo
        ? "border-tinta bg-fundo ring-1 ring-tinta"
        : "border-borda bg-superficie hover:border-borda-forte"
    }`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <Link
        href={endereco(null)}
        aria-current={selecionadoId === null ? "page" : undefined}
        className={classe(selecionadoId === null)}
      >
        <p className="font-semibold text-tinta">Visão geral</p>
        <p className="mt-0.5 text-sm text-tinta-media">
          Todos os contratos, o total do mês e o cadastro de contratos.
        </p>
      </Link>

      {influencers.map((influencer) => {
        const escolhido = influencer.id === selecionadoId;

        return (
          <Link
            key={influencer.id}
            href={endereco(influencer.id)}
            aria-current={escolhido ? "page" : undefined}
            className={classe(escolhido)}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold text-tinta">{influencer.nome}</p>
              {!influencer.ativo && (
                <span className="rounded-full border border-borda-forte px-2 py-0.5 text-xs font-semibold text-tinta-fraca">
                  inativo
                </span>
              )}
            </div>
            <p className="text-sm text-tinta-media">{influencer.marca}</p>
            <p className="mt-2 text-xs text-tinta-fraca">{influencer.contrato}</p>

            {/* A receita bruta e o numero grande: e a escala contra a qual os
                outros dois se leem. */}
            <p className="numerico mt-2 text-lg font-semibold text-tinta">
              {moeda(influencer.receitaBruta)}
            </p>
            <p className="text-xs text-tinta-fraca">receita bruta da marca</p>

            <dl className="mt-2 flex gap-4 border-t border-borda pt-2">
              <div>
                <dt className="text-xs text-tinta-fraca">comissão</dt>
                <dd className="numerico text-sm font-semibold text-tinta-media">
                  {moeda(influencer.comissao)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-tinta-fraca">despesas</dt>
                <dd className="numerico text-sm font-semibold text-tinta-media">
                  {moeda(influencer.despesas)}
                </dd>
                {/* Sem venda no mes nao ha contra o que medir: um "0,0%" ali
                    diria que a despesa nao pesa nada. */}
                <dd className="numerico text-xs text-tinta-fraca">
                  {influencer.receitaBruta > 0
                    ? `${percentual(razaoSegura(influencer.despesas, influencer.receitaBruta))} da receita bruta`
                    : "sem venda no mês"}
                </dd>
              </div>
            </dl>
          </Link>
        );
      })}
    </div>
  );
}
