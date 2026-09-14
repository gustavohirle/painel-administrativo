/**
 * Ordem de fabricacao: o pedido que sai do marketing e vai para a fabrica.
 *
 * O problema que resolve: quem gerencia as campanhas dos influencers precisa
 * de estoque pronto numa data de lancamento, e hoje isso se combina por
 * mensagem. Quando falta produto no dia, ninguem sabe se o pedido foi feito, se
 * chegou, se foi aceito, nem para quando. A ordem existe para virar PROVA:
 * quem pediu, o que pediu, para quando, quem aceitou, e quando aceitou.
 *
 * Por isso ela nao e um cadastro editavel como os outros. Uma vez aprovada,
 * congela: o PDF assinado e gravado em bytes e nada mais a altera. Um cadastro
 * que muda depois de assinado nao prova nada.
 *
 * DECISAO: a ordem NAO baixa nem reserva estoque.
 *
 * O saldo do painel e `ultima contagem - vendido desde a contagem` (secao
 * 5.12), uma funcao pura e idempotente. Descontar uma ordem dali criaria um
 * segundo mecanismo mexendo no mesmo numero, e o estoque passaria a depender
 * de quantas vezes a pagina rodou. A ordem aparece ao lado do saldo, como
 * informacao para quem decide -- nao dentro dele.
 */

import type { ChaveProduto } from "@/types/produto";

/**
 * Estados possiveis. So `aguardando` aceita decisao; o resto e final.
 *
 * Nao existe "em fabricacao" nem "entregue": o painel nao acompanha o chao de
 * fabrica, e um estado que ninguem atualiza vira mentira na tela.
 */
export type SituacaoOrdem = "aguardando" | "aprovada" | "recusada" | "cancelada";

export const ROTULO_SITUACAO: Record<SituacaoOrdem, string> = {
  aguardando: "Aguardando aprovação",
  aprovada: "Aprovada e assinada",
  recusada: "Recusada",
  cancelada: "Cancelada por quem pediu",
};

export const EXPLICACAO_SITUACAO: Record<SituacaoOrdem, string> = {
  aguardando:
    "O link foi gerado e ainda não foi assinado pelo responsável pela fabricação.",
  aprovada:
    "Assinada pelos dois lados. O PDF está guardado e não pode mais ser alterado.",
  recusada: "O responsável pela fabricação recusou e registrou o motivo.",
  cancelada: "Quem pediu cancelou antes de a fábrica responder.",
};

/** Papel de quem assina. Sao dois, e um documento so vale com os dois. */
export type PapelAssinatura = "solicitante" | "aprovador";

export const ROTULO_PAPEL: Record<PapelAssinatura, string> = {
  solicitante: "Pediu a fabricação",
  aprovador: "Recebeu e aprovou a fabricação",
};

/**
 * Uma assinatura.
 *
 * `tracos` guarda o desenho como VETOR, nao como imagem: cada traco e uma
 * sequencia [x0, y0, x1, y1, ...] em coordenadas normalizadas de 0 a 1 dentro
 * do quadro de assinatura. Isso mantem o registro em poucos KB, sobrevive ao
 * JSON do modo demonstracao e vai direto para o PDF como polilinha -- sem
 * precisar embutir imagem, que e justamente o que obrigaria a trazer uma
 * biblioteca de PDF.
 */
/**
 * Proporcao largura/altura do quadro de assinatura. UM numero, usado nos dois
 * lados.
 *
 * O quadro na tela e a moldura no PDF tem que ter a MESMA proporcao, senao a
 * assinatura sai esticada no papel -- os tracos sao normalizados de 0 a 1 em
 * cada eixo, entao um quadro 3:1 desenhado dentro de uma moldura 2:1 achata a
 * letra. Fixar a proporcao aqui, e usar esta constante no CSS do quadro e na
 * montagem do documento, elimina o problema em vez de corrigi-lo.
 */
export const PROPORCAO_ASSINATURA = 3;

export interface AssinaturaOrdem {
  nome: string;
  papel: PapelAssinatura;
  tracos: number[][];
  /** ISO 8601, com fuso. E a data que sai impressa no documento. */
  assinadoEm: string;
  /**
   * Endereco de rede de quem assinou.
   *
   * Nao e identidade -- e um dado de circunstancia, do mesmo naipe do horario.
   * Fica no documento porque ajuda a reconstituir o que aconteceu, nao porque
   * prove quem e a pessoa.
   */
  ip: string | null;
  agente: string | null;
}

export interface ItemOrdem {
  /** Chave do cadastro de produtos -- "produtoId:varianteId". */
  chave: ChaveProduto;
  /** Nome COPIADO no momento do pedido. Renomear o produto depois nao muda o
   *  que foi assinado: o documento precisa dizer o que estava escrito nele. */
  nome: string;
  sku: string | null;
  quantidade: number;
}

/** Quantos itens cabem numa ordem. Acima disso e uma lista, nao um pedido. */
export const MAXIMO_DE_ITENS = 20;

/** Teto por linha. Existe para barrar o zero a mais digitado sem querer. */
export const QUANTIDADE_MAXIMA = 1_000_000;

/**
 * O PDF assinado, congelado.
 *
 * `sha256` e o hash dos BYTES do arquivo -- serve para conferir que o PDF
 * baixado hoje e o mesmo que foi gerado na assinatura. `hashConteudo` e o hash
 * dos DADOS que geraram o documento, e sai impresso dentro dele: um nao pode
 * conter o outro, porque o arquivo nao consegue carregar o proprio hash.
 */
export interface DocumentoOrdem {
  base64: string;
  sha256: string;
  hashConteudo: string;
  geradoEm: string;
  bytes: number;
}

export interface OrdemFabricacao {
  id: string;
  /** "OF-2026-0007". Sequencial por ano, e o que se fala no telefone. */
  numero: string;

  itens: ItemOrdem[];
  /** Data em que o produto precisa estar pronto. "aaaa-mm-dd". */
  dataLancamento: string;
  /** Campanha, influencer, praca -- o contexto que a fabrica precisa. */
  observacao: string | null;

  situacao: SituacaoOrdem;

  solicitante: AssinaturaOrdem;
  aprovador: AssinaturaOrdem | null;
  motivoRecusa: string | null;

  /**
   * Token do link de assinatura. 32 bytes aleatorios em base64url.
   *
   * O link E a credencial: quem o tem assina. E uma escolha deliberada --
   * o responsavel pela fabricacao nao tem conta no painel, e exigir que
   * tivesse trocaria uma assinatura em trinta segundos no celular por um
   * cadastro que ninguem faz. 256 bits nao se adivinham; o que protege e
   * nao espalhar o link.
   */
  token: string;

  criadoEm: string;
  /** Quando a ordem saiu de `aguardando`. `null` enquanto esta aberta. */
  fechadoEm: string | null;

  documento: DocumentoOrdem | null;
}

/** O que a tela envia para criar. O resto o servidor decide. */
export interface EntradaOrdem {
  itens: ItemOrdem[];
  dataLancamento: string;
  observacao: string | null;
  solicitante: AssinaturaOrdem;
}

export function ordemEstaAberta(ordem: OrdemFabricacao): boolean {
  return ordem.situacao === "aguardando";
}

/** Soma das unidades pedidas. Vai no rodape da tabela e na lista. */
export function unidadesDaOrdem(ordem: OrdemFabricacao): number {
  return ordem.itens.reduce((total, item) => total + item.quantidade, 0);
}
