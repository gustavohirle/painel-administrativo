/**
 * Cadastros iniciais da demonstracao.
 *
 * Tudo aqui e ficticio e editavel. O objetivo e que `npm run dev` mostre um
 * painel cheio, nao um formulario vazio -- e que cada cadastro exista com o
 * mesmo formato que teria em producao.
 */

import { MARCAS } from "@/data/catalogo";
import { baseDemonstracao } from "@/data/geradorPedidos";
import { novoId } from "@/data/repositorio";
import { unidadesConsumidas } from "@/lib/estoque";
import { idsSugeridosPorRegime, indexarProdutos } from "@/lib/impostos";
import { chaveMes, filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import type { CustoProduto, DespesaInfluencer, Influencer } from "@/types/dominio";
import type { AliquotaEstado, Imposto } from "@/types/fiscal";
import { ESTADOS } from "@/types/estados";
import {
  chaveProduto,
  type ComponenteKit,
  type ContagemEstoque,
  type Produto,
} from "@/types/produto";
import type { Usuario } from "@/types/usuario";
import type { TaxaPlataforma } from "@/types/plataforma";
import { criarHashSenha } from "@/lib/auth";
import { gerarDocumento } from "@/lib/ordens";
import type {
  AssinaturaOrdem,
  ItemOrdem,
  OrdemFabricacao,
} from "@/types/ordemFabricacao";

const AGORA = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Custo de fabricacao
// ---------------------------------------------------------------------------

/**
 * Proporcao tipica de uma industria de cosmeticos para quebrar um custo
 * unitario fechado nos quatro componentes do cadastro. So serve para semear.
 */
const COMPOSICAO_CUSTO = {
  materiaPrima: 0.55,
  embalagem: 0.18,
  maoDeObra: 0.17,
  indireto: 0.1,
} as const;

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100;
}

function skuDaVariante(sku: string, rotulo: string): string {
  return `${sku}-${rotulo.replace(/\s+/g, "").toUpperCase()}`;
}

/**
 * Produtos deixados DE PROPOSITO sem ficha de custo.
 *
 * Nao e descuido: e o gancho de venda. O painel mostra quantos produtos estao
 * sem custo e quanta receita eles representam, e da para cadastrar um ao vivo
 * na reuniao e ver o lucro se mexer.
 */
export const PRODUTOS_SEM_CUSTO_NA_DEMO = new Set([1005, 3005]);

export function custosIniciais(): CustoProduto[] {
  const agora = AGORA();
  const fichas: CustoProduto[] = [];

  for (const marca of MARCAS) {
    for (const produto of marca.produtos) {
      if (PRODUTOS_SEM_CUSTO_NA_DEMO.has(produto.id)) continue;
      // Kits nao ganham ficha propria: o custo deles sai da soma dos
      // componentes. E justamente o que a tela de custos precisa demonstrar.
      if (COMPOSICAO_DOS_KITS.has(produto.id)) continue;

      for (const variante of produto.variantes) {
        fichas.push({
          id: `custo-${variante.id}`,
          produtoId: produto.id,
          varianteId: variante.id,
          sku: skuDaVariante(produto.sku, variante.rotulo),
          nome: `${produto.nome} ${variante.rotulo}`,
          custoMateriaPrima: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.materiaPrima,
          ),
          custoEmbalagem: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.embalagem,
          ),
          custoMaoDeObra: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.maoDeObra,
          ),
          custoIndireto: arredondar(
            variante.custoFabricacao * COMPOSICAO_CUSTO.indireto,
          ),
          atualizadoEm: agora,
        });
      }
    }
  }

  return fichas;
}

// ---------------------------------------------------------------------------
// Comissoes
// ---------------------------------------------------------------------------

/**
 * Um influencer por marca, e so um -- produto nao pertence a dois.
 *
 * Cada um traz o proprio REGIME TRIBUTARIO, e e isso que torna o cenario
 * coerente: as duas marcas menores cabem no Simples Nacional; as tres maiores
 * passariam do teto de R$ 4,8 mi/ano e estao no Lucro Presumido. Consolidar
 * tudo num regime so daria um numero que nao corresponde a nenhuma delas.
 */
export function influencersIniciais(): Influencer[] {
  const agora = AGORA();

  const base: Array<Omit<Influencer, "atualizadoEm">> = [
    {
      id: "influencer-aurora",
      nome: "Marina Costa",
      marca: "Aurora Beleza",
      percentual: 30,
      baseComissao: "bruto",
      // ~R$ 7,2 mi/ano de receita: nao cabe no teto do Simples.
      regime: "lucro_presumido",
      anexoSimples: "II",
      uf: "GO",
      cnpj: null,
      inicioAtividade: null,
      rbt12Manual: null,
      ativo: true,
      observacao: "Contrato anual, renovação em janeiro.",
    },
    {
      id: "influencer-luma",
      nome: "Bianca Reis",
      marca: "Luma Cosméticos",
      percentual: 30,
      baseComissao: "bruto",
      // A maior das cinco: ~R$ 9 mi/ano.
      regime: "lucro_presumido",
      anexoSimples: "II",
      uf: "GO",
      cnpj: null,
      inicioAtividade: null,
      rbt12Manual: null,
      ativo: true,
      observacao: null,
    },
    {
      id: "influencer-verte",
      nome: "Camila Prado",
      marca: "Verte Natural",
      percentual: 25,
      baseComissao: "bruto",
      // ~R$ 2,8 mi/ano: cabe no Simples, dentro do sublimite de ICMS.
      regime: "simples_nacional",
      anexoSimples: "II",
      uf: "GO",
      cnpj: null,
      inicioAtividade: null,
      rbt12Manual: null,
      ativo: true,
      observacao: "Percentual menor, negociado na renovação.",
    },
    {
      id: "influencer-nitro",
      nome: "Rodrigo Salles",
      marca: "Nitro Hair",
      percentual: 30,
      baseComissao: "bruto",
      // ~R$ 2,7 mi/ano: tambem cabe no Simples.
      regime: "simples_nacional",
      anexoSimples: "II",
      uf: "GO",
      cnpj: null,
      inicioAtividade: null,
      rbt12Manual: null,
      ativo: true,
      observacao: "Público jovem, muito boleto.",
    },
    {
      id: "influencer-petra",
      nome: "Helena Duarte",
      marca: "Petra Skin",
      percentual: 30,
      baseComissao: "bruto",
      // Ticket alto, ~R$ 8 mi/ano.
      regime: "lucro_presumido",
      anexoSimples: "II",
      uf: "GO",
      cnpj: null,
      inicioAtividade: null,
      rbt12Manual: null,
      ativo: true,
      observacao: null,
    },
  ];

  return base.map((influencer) => ({ ...influencer, atualizadoEm: agora }));
}

// ---------------------------------------------------------------------------
// Impostos
// ---------------------------------------------------------------------------

/**
 * Impostos recolhidos POR FORA da guia unica.
 *
 * O que esta DENTRO do DAS (IRPJ, CSLL, PIS, COFINS, CPP, IPI e ICMS) nao e
 * cadastrado aqui: a reparticao vem da tabela oficial do Anexo II e aparece na
 * apuracao. Cadastra-los tambem faria o painel somar o mesmo tributo duas vezes.
 *
 * Todos comecam INATIVOS, e essa e a leitura correta para uma industria no
 * Simples que vende direto ao consumidor final pela loja. Cada um traz na
 * observacao a condicao em que passa a valer. Ative com o contador ao lado.
 */
export function impostosIniciais(): Imposto[] {
  const agora = AGORA();

  const base: Array<Omit<Imposto, "id" | "atualizadoEm"> & { id: string }> = [
    // ----------------------------------------------------------- SIMPLES
    {
      id: "imposto-icms-st",
      nome: "ICMS Substituição Tributária",
      sigla: "ICMS-ST",
      esfera: "estadual",
      baseIncidencia: "receita",
      aliquota: 0,
      regimes: ["simples_nacional", "lucro_presumido", "lucro_real"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: true,
      ativo: false,
      confirmadoPeloContador: false,
      observacao:
        "Incide quando a fábrica vende para revenda e assume a condição de " +
        "substituta. Na venda direta ao consumidor final pela loja, que e o " +
        "caso deste painel, normalmente nao se aplica. A aliquota efetiva " +
        "depende da MVA do produto e da UF de destino -- peca ao contador.",
    },
    {
      id: "imposto-fundeinfra",
      nome: "Fundo de Infraestrutura de Goiás",
      sigla: "FUNDEINFRA",
      esfera: "estadual",
      baseIncidencia: "receita",
      aliquota: 0,
      regimes: ["simples_nacional", "lucro_presumido", "lucro_real"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: false,
      confirmadoPeloContador: false,
      observacao:
        "Contribuição estadual de Goiás, ligada a operações com benefício " +
        "fiscal. Confirme com o contador se a operacao da fabrica esta " +
        "alcancada antes de ativar.",
    },

    // -------------------------------------------------- LUCRO PRESUMIDO
    {
      id: "imposto-pis-cumulativo",
      nome: "PIS/Pasep cumulativo",
      sigla: "PIS",
      esfera: "federal",
      baseIncidencia: "receita",
      aliquota: 0.65,
      regimes: ["lucro_presumido"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: true,
      confirmadoPeloContador: true,
      observacao:
        "Alíquota legal do regime cumulativo. No Simples o PIS já esta dentro " +
        "da guia unica, por isso ele nao aparece la.",
    },
    {
      id: "imposto-cofins-cumulativo",
      nome: "COFINS cumulativa",
      sigla: "COFINS",
      esfera: "federal",
      baseIncidencia: "receita",
      aliquota: 3,
      regimes: ["lucro_presumido"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: true,
      confirmadoPeloContador: true,
      observacao: "Alíquota legal do regime cumulativo.",
    },
    {
      id: "imposto-irpj",
      nome: "IRPJ sobre lucro presumido",
      sigla: "IRPJ",
      esfera: "federal",
      baseIncidencia: "lucro",
      aliquota: 15,
      regimes: ["lucro_presumido"],
      // Industria presume 8% da receita como lucro.
      percentualPresuncao: 8,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: true,
      confirmadoPeloContador: true,
      observacao:
        "15% sobre a base presumida de 8% da receita, que e a presunção da " +
        "atividade industrial.",
    },
    {
      id: "imposto-irpj-adicional",
      nome: "Adicional de IRPJ",
      sigla: "IRPJ ad.",
      esfera: "federal",
      baseIncidencia: "lucro",
      aliquota: 10,
      regimes: ["lucro_presumido"],
      percentualPresuncao: 8,
      // So incide sobre o que passa de R$ 20 mil por mes da base presumida.
      deducaoMensal: 20_000,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: true,
      confirmadoPeloContador: true,
      observacao:
        "10% sobre a parte da base presumida que exceder R$ 20 mil no mês. " +
        "Sem a deducao mensal, seria cobrado desde o primeiro real.",
    },
    {
      id: "imposto-csll",
      nome: "CSLL sobre lucro presumido",
      sigla: "CSLL",
      esfera: "federal",
      baseIncidencia: "lucro",
      aliquota: 9,
      regimes: ["lucro_presumido"],
      // Presuncao de CSLL para industria e 12%, diferente da do IRPJ.
      percentualPresuncao: 12,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: true,
      confirmadoPeloContador: true,
      observacao: "9% sobre a base presumida de 12% da receita.",
    },
    {
      id: "imposto-icms",
      nome: "ICMS próprio",
      sigla: "ICMS",
      esfera: "estadual",
      baseIncidencia: "receita",
      // Estimativa de ponto de partida, NAO apuracao -- ver a observacao.
      aliquota: 10,
      regimes: ["lucro_presumido", "lucro_real"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: true,
      ativo: true,
      confirmadoPeloContador: false,
      observacao:
        "ESTIMATIVA, TROQUE PELA EFETIVA DO CONTADOR. Não existe alíquota " +
        "unica que sirva: a venda interna de Goias, a interestadual e o DIFAL " +
        "tem aliquotas diferentes, e o valor devido e liquido dos creditos de " +
        "materia-prima, que este painel nao modela. Os 10% sao a ordem de " +
        "grandeza tipica de uma industria de cosmeticos vendendo direto ao " +
        "consumidor -- o numero certo vem da apuracao.",
    },
    {
      id: "imposto-ipi",
      nome: "Imposto sobre Produtos Industrializados",
      sigla: "IPI",
      esfera: "federal",
      baseIncidencia: "receita",
      // Zero e o ponto de partida honesto: boa parte dos NCM de cosmetico e
      // isenta ou tributada a zero. Perfumaria pode ser bem mais alta.
      aliquota: 0,
      regimes: ["lucro_presumido", "lucro_real"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: true,
      ativo: true,
      confirmadoPeloContador: false,
      observacao:
        "A alíquota depende do NCM de cada produto na tabela TIPI e varia " +
        "bastante dentro de cosmeticos -- boa parte fica em zero, perfumaria " +
        "pode passar de 20%. Informe por produto conforme o NCM. No Simples o " +
        "IPI ja esta dentro da guia unica.",
    },

    // ------------------------------------------------------- LUCRO REAL
    {
      id: "imposto-pis-nao-cumulativo",
      nome: "PIS/Pasep não cumulativo",
      sigla: "PIS n/c",
      esfera: "federal",
      baseIncidencia: "receita",
      aliquota: 1.65,
      regimes: ["lucro_real"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: false,
      confirmadoPeloContador: false,
      observacao:
        "Alíquota cheia. No regime não cumulativo ha crédito sobre insumos, " +
        "que este painel nao modela -- o valor devido e menor. Informe a " +
        "aliquota efetiva liquida de creditos antes de ativar.",
    },
    {
      id: "imposto-cofins-nao-cumulativa",
      nome: "COFINS não cumulativa",
      sigla: "COFINS n/c",
      esfera: "federal",
      baseIncidencia: "receita",
      aliquota: 7.6,
      regimes: ["lucro_real"],
      percentualPresuncao: null,
      deducaoMensal: null,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: false,
      confirmadoPeloContador: false,
      observacao:
        "Alíquota cheia, sem os créditos sobre insumos. Mesma ressalva do PIS " +
        "nao cumulativo.",
    },
  ];

  return base.map((imposto) => ({ ...imposto, atualizadoEm: agora }));
}

// ---------------------------------------------------------------------------
// DIFAL: aliquota interna de cada estado
// ---------------------------------------------------------------------------

/**
 * Um registro por estado, semeado com a tabela de `types/estados.ts`.
 *
 * Nenhum nasce confirmado. Varios estados mexeram nas suas aliquotas entre
 * 2023 e 2025, algumas ja embutem fundo de combate à pobreza e outras nao --
 * a tela avisa "a confirmar" em cada um ate alguem conferir com o contador.
 */
/**
 * Taxas de plataforma semeadas, por meio de pagamento.
 *
 * Ordem de grandeza publica da Nuvemshop / Nuvem Pago, NAO o contrato do
 * cliente: o percentual real muda com o plano, com o volume e com a
 * antecipacao de recebiveis. Por isso todas nascem com
 * `confirmadaNaFatura: false` e a tela avisa -- mesma regra do ICMS.
 *
 * O boleto e o caso interessante: percentual baixo e um fixo por transacao.
 * Num pedido de R$ 40 esse fixo sozinho passa de 8%, o que nenhuma leitura de
 * "1% de taxa" revelaria.
 */
export function taxasPlataformaIniciais(): TaxaPlataforma[] {
  const agora = AGORA();

  /*
   * Todas nascem com base `bruto` -- a taxa da Nuvemshop e cobrada sobre o
   * pedido criado. Trocar para `recebido` e decisao de quem le a fatura: ha
   * gateway que so tarifa transacao aprovada, e ai a diferenca e grande.
   */
  const base: Array<
    Omit<TaxaPlataforma, "atualizadoEm" | "ativa" | "confirmadaNaFatura" | "base">
  > = [
    { metodo: "credit_card", percentual: 4.99, valorFixo: 0, observacao: "Cartão a vista, sem antecipação." },
    { metodo: "debit_card", percentual: 3.49, valorFixo: 0, observacao: null },
    { metodo: "pix", percentual: 1.99, valorFixo: 0, observacao: null },
    { metodo: "boleto", percentual: 1.99, valorFixo: 3.49, observacao: "O fixo por boleto pesa mais que o percentual em pedido pequeno." },
    { metodo: "wire_transfer", percentual: 0, valorFixo: 0, observacao: "Transferencia direta não passa pelo gateway." },
    { metodo: "other", percentual: 2.99, valorFixo: 0, observacao: null },
  ];

  return base.map((t) => ({
    ...t,
    base: "bruto" as const,
    ativa: true,
    confirmadaNaFatura: false,
    atualizadoEm: agora,
  }));
}

export function aliquotasEstaduaisIniciais(): AliquotaEstado[] {
  const agora = AGORA();

  return ESTADOS.map((estado) => ({
    uf: estado.uf,
    nome: estado.nome,
    aliquotaInterna: estado.aliquotaInterna,
    ativo: true,
    confirmadoPeloContador: false,
    observacao: null,
    atualizadoEm: agora,
  }));
}

// ---------------------------------------------------------------------------
// Produtos e kits
// ---------------------------------------------------------------------------

/**
 * Composicao dos kits, por variante.
 *
 * A Nuvemshop entrega o kit como UM produto, com product_id proprio. Este
 * mapa e o que permite baixar o estoque dos componentes certos e somar o
 * custo de fabricacao real do kit.
 */
const COMPOSICAO_DOS_KITS = new Map<number, Map<number, Array<[number, number, number]>>>([
  [
    1001, // Kit Reconstrucao Aurora
    new Map([
      // [produtoId, varianteId, quantidade]
      [100101, [[1002, 100201, 1], [1003, 100301, 1], [1004, 100401, 1]]],
      [100102, [[1002, 100202, 1], [1003, 100302, 1], [1004, 100402, 1]]],
    ]),
  ],
  [
    2005, // Kit Rotina Luma
    new Map([[200501, [[2001, 200101, 1], [2002, 200201, 1], [2004, 200401, 1]]]]),
  ],
  [
    4005, // Kit Barba Nitro
    new Map([[400501, [[4002, 400201, 1], [4003, 400301, 1], [4001, 400101, 1]]]]),
  ],
  [
    5005, // Kit Ritual Petra
    new Map([[500501, [[5001, 500101, 1], [5002, 500201, 1], [5003, 500301, 1]]]]),
  ],
]);

/** NCM por produto. Define IPI e enquadramento em ICMS-ST. */
const NCM_POR_PRODUTO: Record<number, string> = {
  1001: "3305.90.00", 1002: "3305.10.00", 1003: "3305.90.00",
  1004: "3305.90.00", 1005: "3305.90.00",
  2001: "3304.99.90", 2002: "3304.99.90", 2003: "3304.99.90",
  2004: "3304.99.90", 2005: "3304.99.90",
  3001: "3401.11.00", 3002: "3304.99.90", 3003: "3307.20.10",
  3004: "3305.10.00", 3005: "3304.99.90",
  4001: "3305.90.00", 4002: "3305.90.00", 4003: "3305.10.00",
  4004: "3305.90.00", 4005: "3305.90.00",
  5001: "3304.99.90", 5002: "3304.99.90", 5003: "3304.99.90",
  5004: "3304.99.90", 5005: "3304.99.90",
};

/** Nome legivel de uma variante, para copiar dentro do componente do kit. */
function nomeDaVariante(produtoId: number, varianteId: number): string {
  for (const marca of MARCAS) {
    for (const produto of marca.produtos) {
      if (produto.id !== produtoId) continue;
      const variante = produto.variantes.find((v) => v.id === varianteId);
      if (variante) return `${produto.nome} ${variante.rotulo}`;
    }
  }
  return `Produto ${produtoId}`;
}

/**
 * Produtos, cada um vinculado ao influencer dono da sua marca.
 *
 * Os impostos ja vem marcados a partir do REGIME desse influencer: um produto
 * da Aurora (Lucro Presumido) nasce com PIS, COFINS, IRPJ e CSLL marcados; um
 * da Verte (Simples) nasce so com os tributos que existem fora da guia unica.
 * Continua tudo editavel -- o cadastro sugere, quem entende decide.
 */
export function produtosIniciais(
  impostos: Imposto[],
  influencers: Influencer[],
): Produto[] {
  const agora = AGORA();

  const donoDaMarca = new Map(influencers.map((i) => [i.marca, i]));

  const lista: Produto[] = [];

  for (const marca of MARCAS) {
    const dono = donoDaMarca.get(marca.nome) ?? null;
    const impostosDoDono = dono
      ? idsSugeridosPorRegime(impostos, dono.regime)
      : [];

    for (const produto of marca.produtos) {
      const variantesDoKit = COMPOSICAO_DOS_KITS.get(produto.id);

      for (const variante of produto.variantes) {
        const composicao = variantesDoKit?.get(variante.id);

        const componentes: ComponenteKit[] = (composicao ?? []).map(
          ([produtoId, varianteId, quantidade]) => ({
            chave: chaveProduto(produtoId, varianteId),
            nome: nomeDaVariante(produtoId, varianteId),
            quantidade,
          }),
        );

        lista.push({
          id: `produto-${variante.id}`,
          chave: chaveProduto(produto.id, variante.id),
          produtoId: produto.id,
          varianteId: variante.id,
          nome: `${produto.nome} ${variante.rotulo}`,
          sku: skuDaVariante(produto.sku, variante.rotulo),
          ncm: NCM_POR_PRODUTO[produto.id] ?? null,
          origem: "nuvemshop",
          marca: marca.nome,
          influencerId: dono?.id ?? null,
          impostosIds: impostosDoDono,
          ehKit: componentes.length > 0,
          componentes,
          ativo: true,
          observacao: null,
          atualizadoEm: agora,
        });
      }
    }
  }

  return lista;
}

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------

/** Dias que a contagem inicial fica no passado. */
const DIAS_DESDE_A_CONTAGEM = 45;

/**
 * Cobertura desejada HOJE, em meses de venda, por posicao na lista.
 *
 * A contagem e calculada de tras para frente: `quantidade = o que ja saiu
 * desde a data da contagem + cobertura desejada`. Assim o saldo de hoje cai
 * exatamente no valor pretendido, sem depender de quantos dias do mes ja
 * passaram nem do ritmo de cada item.
 *
 * O ciclo tem 14 posicoes para diluir os casos ruins: sobre 42 itens, nascem
 * 3 furados, 3 criticos, 6 apertados e 30 tranquilos -- a cara de um estoque
 * real bem tocado, com alguns problemas.
 */
const COBERTURA_DESEJADA_EM_MESES = [
  -0.04, 1.4, 2.2, 0.15, 2.8, 1.8, 3.2, 0.5, 2.0, 1.2, 2.6, 0.6, 3.5, 1.6,
];

/**
 * Contagem inicial, dimensionada pelo ritmo de venda de cada item.
 *
 * Quantidade fixa nao funciona aqui: os itens vendem entre dezenas e milhares
 * de unidades por mes, e um numero unico deixaria metade do catalogo negativo
 * e a outra metade com estoque para anos.
 */
export function contagensIniciais(produtos: Produto[]): ContagemEstoque[] {
  const registrado = AGORA();
  const dataContagem = new Date(
    Date.now() - DIAS_DESDE_A_CONTAGEM * 24 * 3600_000,
  ).toISOString();

  const { pedidos } = baseDemonstracao();
  const indice = indexarProdutos(produtos);
  const meses = mesesDisponiveis(pedidos);
  const ultimoMes = meses[0] ?? chaveMes(new Date().toISOString());

  // Ritmo de venda do mes mais recente, ja com os kits decompostos.
  const vendasMensais = unidadesConsumidas(filtrarPorMes(pedidos, ultimoMes), indice);
  // E o que saiu desde a data da contagem -- a mesma conta que o painel faz.
  const saidaDesdeAContagem = unidadesConsumidas(pedidos, indice, dataContagem);

  // Componentes (nao-kits) sao os que tem estoque. Kits sao montados sob demanda.
  const componentes = produtos.filter((p) => !p.ehKit);

  return componentes.map((produto, posicao) => {
    const porMes = vendasMensais.get(produto.chave) ?? 0;
    const jaSaiu = saidaDesdeAContagem.get(produto.chave) ?? 0;
    const cobertura =
      COBERTURA_DESEJADA_EM_MESES[posicao % COBERTURA_DESEJADA_EM_MESES.length]!;

    // Piso de 40 unidades para item de giro baixo nao nascer zerado.
    const quantidade = Math.max(40, Math.round(jaSaiu + porMes * cobertura));

    return {
      id: `contagem-${produto.chave.replace(":", "-")}`,
      chave: produto.chave,
      nome: produto.nome,
      quantidade,
      dataContagem,
      responsavel: "Fernanda Lima",
      observacao:
        posicao % COBERTURA_DESEJADA_EM_MESES.length === 0
          ? "Contagem parcial, conferir lote novo."
          : null,
      registradoEm: registrado,
    };
  });
}

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

/** Credenciais da demonstracao. A tela de login mostra as duas em modo demo. */
export const CREDENCIAIS_DEMO = [
  { usuario: "dono", senha: "dono123", perfil: "dono" as const },
  { usuario: "estoque", senha: "estoque123", perfil: "estoque" as const },
];

export async function usuariosIniciais(): Promise<Usuario[]> {
  const agora = AGORA();

  const base = [
    {
      id: "usuario-dono",
      nome: "Roberto Nunes",
      usuario: "dono",
      senha: "dono123",
      perfil: "dono" as const,
    },
    {
      id: "usuario-estoque",
      nome: "Fernanda Lima",
      usuario: "estoque",
      senha: "estoque123",
      perfil: "estoque" as const,
    },
  ];

  return Promise.all(
    base.map(async ({ senha, ...dados }) => ({
      ...dados,
      ...(await criarHashSenha(senha)),
      ativo: true,
      criadoEm: agora,
      atualizadoEm: agora,
    })),
  );
}

export { novoId };

// ---------------------------------------------------------------------------
// Ordens de fabricacao
// ---------------------------------------------------------------------------

/** Dia relativo a hoje, em "aaaa-mm-dd". A demonstracao nunca parece velha. */
function diaRelativo(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

function instanteRelativo(dias: number, hora: number, minuto: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  d.setHours(hora, minuto, 0, 0);
  return d.toISOString();
}

/**
 * Rabisco deterministico, para as assinaturas semeadas parecerem assinatura.
 *
 * Sao duas polilinhas em coordenadas de 0 a 1 -- o mesmo formato que sai do
 * quadro de assinatura do navegador. Geradas por seno em vez de sorteadas
 * porque o painel inteiro e deterministico: os mesmos numeros toda vez que
 * abre (secao 6).
 */
function rabisco(semente: number): number[][] {
  // Varias voltas por unidade de largura e o que faz o olho ler "cursiva" em
  // vez de "grafico". Duas frequencias somadas, uma grande e uma pequena,
  // evitam a regularidade de onda que denuncia a formula.
  const corpo: number[] = [];
  for (let i = 0; i <= 110; i++) {
    const t = i / 110;
    corpo.push(
      0.05 + t * 0.84,
      0.52 -
        Math.sin(t * Math.PI * 6.5 + semente) * 0.3 * (1 - t * 0.25) -
        Math.sin(t * Math.PI * 15 + semente * 3) * 0.09 -
        Math.sin(t * Math.PI * 2 + semente) * 0.08,
    );
  }

  // O segundo traco e a rubrica por baixo, que quase toda assinatura tem.
  const corte: number[] = [];
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    corte.push(0.08 + t * 0.8, 0.88 - t * 0.16 - Math.sin(t * Math.PI) * 0.07);
  }

  return [corpo, corte];
}

function assinaturaSemeada(
  nome: string,
  assinadoEm: string,
  semente: number,
  ip: string,
): AssinaturaOrdem {
  return {
    nome,
    tracos: rabisco(semente),
    assinadoEm,
    ip,
    agente: "Mozilla/5.0 (Linux; Android 14) demonstracao",
  };
}

/**
 * Tres ordens semeadas, uma em cada trecho do processo.
 *
 * A tela precisa das tres para se explicar sozinha: uma esperando a
 * conferencia (a linha do tempo quase vazia), uma no meio do caminho, e uma
 * concluida -- que e a unica com PDF para baixar. Com uma so, metade da tela
 * nao teria o que mostrar.
 */
export function ordensIniciais(produtos: Produto[]): OrdemFabricacao[] {
  const disponiveis = produtos.filter((p) => !p.ehKit && p.ativo);
  const item = (indice: number, quantidade: number): ItemOrdem | null => {
    const produto = disponiveis[indice];
    if (!produto) return null;
    return { chave: produto.chave, nome: produto.nome, sku: produto.sku, quantidade };
  };

  const naFila = [item(0, 2400), item(1, 1200)].filter((i): i is ItemOrdem => i !== null);
  const noMeio = [item(2, 5000)].filter((i): i is ItemOrdem => i !== null);
  const pronta = [item(3, 800), item(4, 1500)].filter((i): i is ItemOrdem => i !== null);

  // Sem produto cadastrado nao ha ordem que faca sentido.
  if (naFila.length === 0 || noMeio.length === 0 || pronta.length === 0) return [];

  const ano = new Date().getFullYear();
  const quantidades = (itens: ItemOrdem[], fator = 1): Record<string, number> =>
    Object.fromEntries(itens.map((i) => [i.chave, Math.round(i.quantidade * fator)]));

  const TODAS_SIM = {
    embalagem: true,
    tampa: true,
    tampaCorreta: true,
    caixa: true,
    materiaPrima: true,
  };

  const esperando: OrdemFabricacao = {
    id: "ordem-demo-conferencia",
    numero: `OF-${ano}-0001`,
    itens: naFila,
    dataLancamento: diaRelativo(26),
    observacao:
      "Lançamento da campanha de primavera. O influencer grava no dia 20, precisa do produto na mão antes.",
    situacao: "andamento",
    etapaAtual: "conferencia",
    passos: [
      {
        etapa: "abertura",
        usuarioId: "usuario-dono",
        assinatura: assinaturaSemeada(
          "Marina Alves",
          instanteRelativo(-3, 14, 22),
          0.7,
          "189.4.22.7",
        ),
        observacao: null,
      },
    ],
    abertaPor: "usuario-dono",
    motivoCancelamento: null,
    criadoEm: instanteRelativo(-3, 14, 22),
    fechadoEm: null,
    documento: null,
  };

  /*
   * A do meio parou na contagem, e com a fabricacao ABAIXO do pedido.
   *
   * 4.850 de 5.000 nao e descuido de semeadura: e o caso que a tela precisa
   * saber mostrar, porque e onde a confianca no processo se decide. Pediu
   * 5.000, saiu 4.850, e isso tem que aparecer sem ninguem procurar.
   */
  const andando: OrdemFabricacao = {
    id: "ordem-demo-andamento",
    numero: `OF-${ano}-0002`,
    itens: noMeio,
    dataLancamento: diaRelativo(9),
    observacao: "Reposição para o combo de lançamento.",
    situacao: "andamento",
    etapaAtual: "contagem",
    passos: [
      {
        etapa: "abertura",
        usuarioId: "usuario-dono",
        assinatura: assinaturaSemeada("Marina Alves", instanteRelativo(-19, 9, 5), 0.7, "189.4.22.7"),
        observacao: null,
      },
      {
        etapa: "conferencia",
        usuarioId: "usuario-estoque",
        assinatura: assinaturaSemeada(
          "Carlos Mendes",
          instanteRelativo(-18, 8, 12),
          2.1,
          "177.223.44.178",
        ),
        observacao: null,
        conferencia: { respostas: { ...TODAS_SIM }, cumpreAData: true, dataPossivel: null },
      },
      {
        etapa: "fabricacao",
        usuarioId: "usuario-estoque",
        assinatura: assinaturaSemeada(
          "Carlos Mendes",
          instanteRelativo(-4, 17, 30),
          3.4,
          "177.223.44.178",
        ),
        observacao: "Sobrou pouca matéria-prima no fim do lote.",
        fabricacao: { dataFabricacao: diaRelativo(-4), quantidades: quantidades(noMeio, 0.97) },
      },
    ],
    abertaPor: "usuario-dono",
    motivoCancelamento: null,
    criadoEm: instanteRelativo(-19, 9, 5),
    fechadoEm: null,
    documento: null,
  };

  const concluida: OrdemFabricacao = {
    id: "ordem-demo-concluida",
    numero: `OF-${ano}-0003`,
    itens: pronta,
    dataLancamento: diaRelativo(-6),
    observacao: "Kit de inverno, entregue no prazo.",
    situacao: "concluida",
    etapaAtual: null,
    passos: [
      {
        etapa: "abertura",
        usuarioId: "usuario-dono",
        assinatura: assinaturaSemeada(
          "Marina Alves",
          instanteRelativo(-40, 10, 15),
          0.7,
          "189.4.22.7",
        ),
        observacao: null,
      },
      {
        etapa: "conferencia",
        usuarioId: "usuario-estoque",
        assinatura: assinaturaSemeada(
          "Carlos Mendes",
          instanteRelativo(-39, 9, 0),
          2.1,
          "177.223.44.178",
        ),
        observacao: null,
        conferencia: { respostas: { ...TODAS_SIM }, cumpreAData: true, dataPossivel: null },
      },
      {
        etapa: "fabricacao",
        usuarioId: "usuario-estoque",
        assinatura: assinaturaSemeada(
          "Rubens Dias",
          instanteRelativo(-22, 16, 5),
          4.8,
          "177.223.44.178",
        ),
        observacao: null,
        fabricacao: { dataFabricacao: diaRelativo(-22), quantidades: quantidades(pronta) },
      },
      {
        etapa: "contagem",
        usuarioId: "usuario-estoque",
        assinatura: assinaturaSemeada(
          "Rubens Dias",
          instanteRelativo(-21, 8, 40),
          5.2,
          "177.223.44.178",
        ),
        observacao: null,
        contagem: { dataContagem: diaRelativo(-21), quantidades: quantidades(pronta) },
      },
      {
        etapa: "envio",
        usuarioId: "usuario-estoque",
        assinatura: assinaturaSemeada(
          "Rubens Dias",
          instanteRelativo(-20, 11, 10),
          5.9,
          "177.223.44.178",
        ),
        observacao: null,
        envio: { dataEnvio: diaRelativo(-20), referencia: "Transportadora Sul -- NF 4471" },
      },
      {
        etapa: "recebimento",
        usuarioId: "usuario-estoque",
        assinatura: assinaturaSemeada(
          "Joana Prado",
          instanteRelativo(-18, 14, 25),
          6.6,
          "189.4.22.7",
        ),
        observacao: null,
        recebimento: { dataRecebimento: diaRelativo(-18), quantidades: quantidades(pronta) },
      },
    ],
    abertaPor: "usuario-dono",
    motivoCancelamento: null,
    criadoEm: instanteRelativo(-40, 10, 15),
    fechadoEm: instanteRelativo(-18, 14, 25),
    documento: null,
  };

  // O PDF e gerado agora, uma vez, e gravado com a ordem -- exatamente o que
  // acontece quando a ordem fecha de verdade. Semear sem o documento deixaria
  // o botao "Baixar PDF" sem arquivo na demonstracao.
  concluida.documento = gerarDocumento(concluida, {
    demonstracao: true,
    geradoEm: new Date(concluida.fechadoEm ?? Date.now()),
  });

  return [esperando, andando, concluida];
}

// ---------------------------------------------------------------------------
// Despesas de influencer
// ---------------------------------------------------------------------------

/**
 * "aaaa-mm-dd" de um dia do mes corrente, ou de meses atras, em hora local.
 *
 * Relativo ao calendario pelo mesmo motivo das ordens: a base de pedidos
 * acompanha o mes atual, e uma despesa com data fixa cairia fora dela quando a
 * demonstracao fosse aberta em outro mes.
 */
function diaDoMes(mesesAtras: number, dia: number): string {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, dia);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
}

/** Despesa operacional do mes, compartilhada entre os influencers. */
export const OPERACIONAL_MENSAL = 60_000;

/** Meses da base de demonstracao que recebem o operacional semeado. */
const MESES_DA_BASE = 6;

/**
 * Despesas semeadas: so o OPERACIONAL, R$ 60 mil por mes, compartilhado.
 *
 * Um registro por mes da base, gravado uma vez com o valor total e sem dono. A
 * parte de cada influencer sai de `ratearDespesas`, pelo faturamento bruto da
 * marca no mes. As despesas avulsas de exemplo sairam a pedido do cliente: na
 * grade de cada influencer fica a comissao e a parte dele no operacional.
 *
 * Um registro por mes, e nao recorrencia automatica: a regra continua sendo
 * "o que esta na grade e o que foi cadastrado" (secao 5.16).
 */
export function despesasInfluencerIniciais(): DespesaInfluencer[] {
  const agora = AGORA();

  return Array.from({ length: MESES_DA_BASE }, (_, mesesAtras) => {
    const data = diaDoMes(mesesAtras, 1);
    return {
      id: `despesa-operacional-${data.slice(0, 7)}`,
      influencerId: null,
      data,
      categoria: "outros" as const,
      descricao: "Operacional",
      valor: OPERACIONAL_MENSAL,
      atualizadoEm: agora,
    };
  });
}
