/**
 * Taxa da plataforma / meio de pagamento.
 *
 * O que a Nuvemshop e o gateway retem de cada venda. NAO e tributo, e a
 * distincao importa: imposto se recolhe em guia e tem regime; taxa e preco de
 * servico, negociavel, e sai direto do valor que cai na conta. Por isso mora
 * em `types/plataforma.ts` e nao em `types/fiscal.ts`, e aparece na tela numa
 * secao propria.
 *
 * A taxa e POR MEIO DE PAGAMENTO porque e assim que ela e cobrada: cartao,
 * Pix e boleto tem precos bem diferentes. Um percentual unico sobre o recebido
 * daria um total parecido e esconderia o que a tela precisa mostrar -- que
 * boleto sai caro duas vezes, pela taxa e pelo nao pagamento.
 */

/**
 * Sobre o que a taxa incide.
 *
 * `bruto`    -- todo pedido criado, pago ou nao.
 * `recebido` -- so os pedidos que viraram dinheiro.
 *
 * A diferenca nao e pequena e muda por meio de pagamento. O boleto e o caso
 * que obriga a escolha existir: o emissor costuma cobrar por boleto REGISTRADO,
 * e na base de demonstracao so 512 dos 1.314 boletos emitidos sao pagos. Cobrar
 * so sobre os pagos subestimaria essa conta em mais de 60%; cobrar sobre todos
 * superestimaria a do cartao, onde a autorizacao falha e nao gera tarifa.
 *
 * Por isso e campo do cadastro, e nao uma regra global: cada linha da fatura
 * tem a sua resposta, e quem tem a fatura na mao decide.
 */
export type BaseDaTaxa = "bruto" | "recebido";

export const ROTULO_BASE_TAXA: Record<BaseDaTaxa, string> = {
  bruto: "Todo pedido criado",
  recebido: "Só os pedidos pagos",
};

export const EXPLICACAO_BASE_TAXA: Record<BaseDaTaxa, string> = {
  bruto:
    "A taxa incide sobre todo pedido criado, tenha sido pago ou não. É o caso típico do boleto, cobrado por registro.",
  recebido:
    "A taxa incide só sobre o que virou dinheiro. É o caso típico de gateway que só tarifa transação aprovada.",
};

export interface TaxaPlataforma {
  /**
   * Metodo de pagamento a que se aplica. E a chave: um registro por metodo.
   * Casa com `Pedido.payment_details.method` (`credit_card`, `pix`, ...).
   */
  metodo: string;
  /** Percentual sobre o valor do pedido. Ex.: 4.99 para 4,99%. */
  percentual: number;
  /**
   * Valor fixo cobrado por transacao, em reais.
   *
   * Existe porque boleto costuma ser cobrado assim -- um valor por boleto
   * emitido, nao um percentual. Num pedido pequeno, esse fixo pesa muito mais
   * que qualquer percentual, e e justamente isso que a tela precisa revelar.
   */
  valorFixo: number;
  /** Sobre que conjunto de pedidos a taxa incide. Ver `BaseDaTaxa`. */
  base: BaseDaTaxa;
  /** Desmarcado tira o metodo da conta, sem apagar o cadastro. */
  ativa: boolean;
  /**
   * A taxa foi conferida contra a fatura real?
   *
   * Comeca `false` e aparece como aviso na tela. Os valores semeados sao
   * ordem de grandeza publica da Nuvemshop, nao o contrato do cliente: o
   * percentual real varia com o plano, com o volume e com a antecipacao de
   * recebiveis. O painel nunca apresenta numero comercial como definitivo --
   * mesma regra que vale para aliquota de imposto.
   */
  confirmadaNaFatura: boolean;
  observacao: string | null;
  atualizadoEm: string;
}

export type EntradaTaxaPlataforma = Omit<TaxaPlataforma, "atualizadoEm">;

/** Custo total de uma transacao daquele metodo, sobre um valor de pedido. */
export function custoDaTransacao(taxa: TaxaPlataforma, valorDoPedido: number): number {
  if (!taxa.ativa) return 0;
  return (taxa.percentual / 100) * valorDoPedido + taxa.valorFixo;
}
