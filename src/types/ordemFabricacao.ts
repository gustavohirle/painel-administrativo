/**
 * Ordem de fabricacao: o processo que vai do pedido do marketing ate o estoque
 * da Criar, passo a passo, com assinatura em cada um.
 *
 * O problema que resolve, nas palavras do dono: decidir quando fabricar, saber
 * se vai ficar pronto a tempo, e saber quando um produto esta acabando. Hoje
 * isso se combina por mensagem, e quando falta produto no dia do lancamento
 * ninguem sabe em que pe estava -- se a fabrica aceitou, se tinha embalagem, se
 * chegou a ser contado.
 *
 * Sao DUAS empresas: a Demazon fabrica e vende para a Criar; a Criar faz as
 * parcerias com influencers e vende. Por isso o processo atravessa as duas, e
 * termina quando o estoque chega na Criar -- que e o estoque que abastece as
 * lojas Nuvemshop do painel.
 *
 * DECISAO: a ordem NAO baixa nem reserva estoque, mas ALIMENTA a contagem.
 *
 * O saldo do painel e `ultima contagem - vendido desde a contagem` (secao
 * 5.12), uma funcao pura e idempotente. Reservar unidades ali criaria um
 * segundo mecanismo mexendo no mesmo numero. O que a ordem faz e outra coisa,
 * e e legitima: quando o estoquista CONTA numa etapa, aquilo vira uma contagem
 * de verdade, com data -- exatamente o que ele digitaria na aba Estoque. Um
 * lancamento, nao dois.
 */

import type { ChaveProduto } from "@/types/produto";

// ---------------------------------------------------------------------------
// As etapas
// ---------------------------------------------------------------------------

/**
 * As seis etapas, na ordem em que acontecem.
 *
 * Nao existe "em fabricacao" como estado solto: cada etapa so termina quando
 * alguem ASSINA que terminou. Estado que ninguem atualiza vira mentira na
 * tela, e era esse o defeito do processo por mensagem.
 */
export type EtapaOrdem =
  | "abertura"
  | "conferencia"
  | "fabricacao"
  | "contagem"
  | "envio"
  | "recebimento";

export const ETAPAS: readonly EtapaOrdem[] = [
  "abertura",
  "conferencia",
  "fabricacao",
  "contagem",
  "envio",
  "recebimento",
] as const;

export const ROTULO_ETAPA: Record<EtapaOrdem, string> = {
  abertura: "Pedido",
  conferencia: "Conferência de insumos",
  fabricacao: "Fabricação",
  contagem: "Contagem na Demazon",
  envio: "Envio para a Criar",
  recebimento: "Recebimento na Criar",
};

/** Quem faz, em uma linha. Vai embaixo do nome na linha do tempo. */
export const QUEM_FAZ_A_ETAPA: Record<EtapaOrdem, string> = {
  abertura: "Administrador",
  conferencia: "Conferência",
  fabricacao: "Fabricação",
  contagem: "Estoque Demazon",
  envio: "Estoque Demazon",
  recebimento: "Estoque Criar",
};

export const EXPLICACAO_ETAPA: Record<EtapaOrdem, string> = {
  abertura:
    "Quem cuida das campanhas escolhe os produtos, a quantidade e a data em que precisa estar pronto.",
  conferencia:
    "A produção confere se há embalagem, tampa, caixa e matéria-prima — e diz se dá para entregar na data pedida.",
  fabricacao:
    "O encarregado assina quando terminou, com a data e a quantidade que saiu de fato.",
  contagem:
    "O estoquista da Demazon conta o que foi fabricado antes de despachar.",
  envio: "O estoque sai da Demazon para a Criar.",
  recebimento:
    "O estoquista da Criar confere e conta o que chegou. Aqui a contagem entra no estoque do painel.",
};

export function proximaEtapa(etapa: EtapaOrdem): EtapaOrdem | null {
  const i = ETAPAS.indexOf(etapa);
  return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1]! : null;
}

export function indiceDaEtapa(etapa: EtapaOrdem): number {
  return ETAPAS.indexOf(etapa);
}

// ---------------------------------------------------------------------------
// Situacao da ordem
// ---------------------------------------------------------------------------

/**
 * `revisao` e a etapa que o dono nao pediu e o processo exige.
 *
 * A conferencia pergunta "da para fabricar ate a data?". Se a resposta for
 * NAO e a ordem seguisse assim mesmo, a pergunta seria decoracao. Quando a
 * fabrica nao cumpre a data, a ordem VOLTA para quem abriu, com a data que a
 * fabrica consegue, e ele aceita a nova data ou cancela. E o unico ponto em
 * que o processo anda para tras, e e de proposito.
 */
export type SituacaoOrdem =
  | "andamento"
  | "revisao"
  | "concluida"
  | "cancelada";

export const ROTULO_SITUACAO: Record<SituacaoOrdem, string> = {
  andamento: "Em andamento",
  revisao: "Aguardando o administrador",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const EXPLICACAO_SITUACAO: Record<SituacaoOrdem, string> = {
  andamento: "Está com o responsável pela etapa atual.",
  revisao:
    "A produção não consegue entregar na data pedida. Voltou para quem abriu aceitar a nova data ou cancelar.",
  concluida: "O estoque chegou na Criar e foi contado. O documento está assinado por todos.",
  cancelada: "Encerrada antes do fim, com o motivo registrado.",
};

// ---------------------------------------------------------------------------
// A conferencia de insumos
// ---------------------------------------------------------------------------

/**
 * As cinco perguntas da conferencia, ditadas pelo dono.
 *
 * Sao perguntas de SIM ou NAO sobre o que existe no chao de fabrica agora --
 * nao sobre o que esta cadastrado no painel. Por isso nenhuma delas e
 * calculada: quem responde e quem esta olhando a prateleira.
 */
export type ItemDeConferencia =
  | "embalagem"
  | "tampa"
  | "tampaCorreta"
  | "caixa"
  | "materiaPrima";

export const ITENS_DE_CONFERENCIA: readonly ItemDeConferencia[] = [
  "embalagem",
  "tampa",
  "tampaCorreta",
  "caixa",
  "materiaPrima",
] as const;

export const PERGUNTA_DE_CONFERENCIA: Record<ItemDeConferencia, string> = {
  embalagem: "Tem embalagem?",
  tampa: "Tem a tampa/válvula?",
  tampaCorreta: "A tampa/válvula estão corretas para essa embalagem?",
  caixa: "Temos a caixa do produto?",
  materiaPrima: "Temos a matéria-prima para fabricar?",
};

export interface DadosConferencia {
  /** Uma resposta por pergunta. Todas precisam estar marcadas para seguir. */
  respostas: Record<ItemDeConferencia, boolean>;
  /** "Consigo fabricar até a data pedida?" */
  cumpreAData: boolean;
  /** Quando NAO cumpre: a data que a fabrica consegue. "aaaa-mm-dd". */
  dataPossivel: string | null;
}

/** Quantidades apuradas numa etapa, por chave de produto. */
export type QuantidadePorItem = Record<string, number>;

export interface DadosFabricacao {
  /** Dia em que a fabricacao terminou. "aaaa-mm-dd". */
  dataFabricacao: string;
  /** Quanto saiu de fato, por item. Pode diferir do que foi pedido. */
  quantidades: QuantidadePorItem;
}

export interface DadosContagem {
  dataContagem: string;
  quantidades: QuantidadePorItem;
}

export interface DadosEnvio {
  dataEnvio: string;
  /** Transportadora, placa, nota -- o que identifica a carga. */
  referencia: string | null;
}

export interface DadosRecebimento {
  dataRecebimento: string;
  quantidades: QuantidadePorItem;
}

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/**
 * Proporcao largura/altura do quadro de assinatura. UM numero, usado nos dois
 * lados.
 *
 * O quadro na tela e a moldura no PDF tem que ter a MESMA proporcao, senao a
 * assinatura sai esticada no papel -- os tracos sao normalizados de 0 a 1 em
 * cada eixo, entao um quadro 3:1 desenhado dentro de uma moldura 2:1 achata a
 * letra. Fixar a proporcao aqui elimina o problema em vez de corrigi-lo.
 */
export const PROPORCAO_ASSINATURA = 3;

/**
 * Uma assinatura.
 *
 * `tracos` guarda o desenho como VETOR, nao como imagem: cada traco e uma
 * sequencia [x0, y0, x1, y1, ...] em coordenadas normalizadas de 0 a 1 dentro
 * do quadro. Isso mantem o registro em poucos KB, sobrevive ao JSON do modo
 * demonstracao e vai direto para o PDF como polilinha -- sem embutir imagem,
 * que e justamente o que obrigaria a trazer uma biblioteca de PDF.
 */
export interface AssinaturaOrdem {
  nome: string;
  tracos: number[][];
  /** ISO 8601, com fuso. E a data que sai impressa no documento. */
  assinadoEm: string;
  /**
   * Endereco de rede de quem assinou.
   *
   * Nao e identidade -- e dado de circunstancia, do mesmo naipe do horario.
   * Fica no documento porque ajuda a reconstituir o que aconteceu, nao porque
   * prove quem e a pessoa.
   */
  ip: string | null;
  agente: string | null;
}

// ---------------------------------------------------------------------------
// Um passo cumprido
// ---------------------------------------------------------------------------

/**
 * Uma etapa cumprida e assinada.
 *
 * Os campos por etapa sao opcionais porque um passo so carrega os dados da
 * SUA etapa. Quem garante que o passo de fabricacao tem `fabricacao` e a
 * validacao em `lib/ordens.ts`, e ha teste -- um tipo com uniao discriminada
 * ficaria mais bonito e atravessaria pior o JSON do banco e do modo
 * demonstracao, que e por onde este registro viaja.
 */
export interface PassoDaOrdem {
  etapa: EtapaOrdem;
  /** Quem assinou, no cadastro de usuarios. */
  usuarioId: string;
  assinatura: AssinaturaOrdem;
  observacao: string | null;

  conferencia?: DadosConferencia;
  fabricacao?: DadosFabricacao;
  contagem?: DadosContagem;
  envio?: DadosEnvio;
  recebimento?: DadosRecebimento;
}

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

export interface ItemOrdem {
  /** Chave do cadastro de produtos -- "produtoId:varianteId". */
  chave: ChaveProduto;
  /**
   * Nome COPIADO no momento do pedido. Renomear o produto depois nao muda o
   * que foi assinado: o documento precisa dizer o que estava escrito nele.
   */
  nome: string;
  sku: string | null;
  quantidade: number;
}

/** Quantos itens cabem numa ordem. Acima disso e uma lista, nao um pedido. */
export const MAXIMO_DE_ITENS = 20;

/** Teto por linha. Existe para barrar o zero a mais digitado sem querer. */
export const QUANTIDADE_MAXIMA = 1_000_000;

// ---------------------------------------------------------------------------
// O documento
// ---------------------------------------------------------------------------

/**
 * O PDF assinado, congelado.
 *
 * `sha256` e o hash dos BYTES do arquivo -- serve para conferir que o PDF
 * baixado hoje e o mesmo que foi gerado no fim do processo. `hashConteudo` e o
 * hash dos DADOS que geraram o documento, e sai impresso dentro dele: um nao
 * pode conter o outro, porque o arquivo nao consegue carregar o proprio hash.
 */
export interface DocumentoOrdem {
  base64: string;
  sha256: string;
  hashConteudo: string;
  geradoEm: string;
  bytes: number;
}

// ---------------------------------------------------------------------------
// A ordem
// ---------------------------------------------------------------------------

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
  /**
   * Etapa que esta esperando alguem. `null` quando a ordem acabou.
   *
   * Em `revisao` ela aponta para `conferencia`: e de la que a ordem volta a
   * andar depois que o administrador aceita a nova data.
   */
  etapaAtual: EtapaOrdem | null;

  /** Os passos ja cumpridos, em ordem de acontecimento. */
  passos: PassoDaOrdem[];

  /** Quem abriu. E quem recebe o aviso quando o estoque chega na Criar. */
  abertaPor: string;

  /** Preenchido quando alguem cancela. */
  motivoCancelamento: string | null;

  criadoEm: string;
  /** Quando a ordem saiu de andamento. `null` enquanto esta correndo. */
  fechadoEm: string | null;

  documento: DocumentoOrdem | null;
}

/** O que a tela envia para abrir uma ordem. O resto o servidor decide. */
export interface EntradaOrdem {
  itens: ItemOrdem[];
  dataLancamento: string;
  observacao: string | null;
  abertaPor: string;
  assinatura: AssinaturaOrdem;
}

// ---------------------------------------------------------------------------
// Leituras
// ---------------------------------------------------------------------------

export function ordemEstaAberta(ordem: OrdemFabricacao): boolean {
  return ordem.situacao === "andamento" || ordem.situacao === "revisao";
}

/** Soma das unidades pedidas. Vai no rodape da tabela e na lista. */
export function unidadesDaOrdem(ordem: OrdemFabricacao): number {
  return ordem.itens.reduce((total, item) => total + item.quantidade, 0);
}

export function passoDaEtapa(
  ordem: OrdemFabricacao,
  etapa: EtapaOrdem,
): PassoDaOrdem | null {
  // O ULTIMO passo da etapa: em `revisao` a conferencia acontece duas vezes, e
  // o que vale e o que fez a ordem andar.
  for (let i = ordem.passos.length - 1; i >= 0; i -= 1) {
    if (ordem.passos[i]!.etapa === etapa) return ordem.passos[i]!;
  }
  return null;
}

/**
 * Quanto foi fabricado, contado ou recebido de um item.
 *
 * Cai para a quantidade PEDIDA quando a etapa ainda nao aconteceu: e o que a
 * tela tem para mostrar antes de alguem contar.
 */
export function quantidadeDoItem(
  passo: PassoDaOrdem | null,
  item: ItemOrdem,
): number {
  const dados = passo?.fabricacao ?? passo?.contagem ?? passo?.recebimento;
  const registrada = dados?.quantidades[item.chave];
  return typeof registrada === "number" ? registrada : item.quantidade;
}
