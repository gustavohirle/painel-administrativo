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
import type { CustoProduto, Influencer } from "@/types/dominio";
import type { AliquotaEstado, Imposto } from "@/types/fiscal";
import { ESTADOS } from "@/types/estados";
import {
  chaveProduto,
  type ComponenteKit,
  type ContagemEstoque,
  type Produto,
} from "@/types/produto";
import type { Usuario } from "@/types/usuario";
import { criarHashSenha } from "@/lib/auth";

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
      rbt12Manual: null,
      ativo: true,
      observacao: "Contrato anual, renovacao em janeiro.",
    },
    {
      id: "influencer-luma",
      nome: "Bianca Reis",
      marca: "Luma Cosmeticos",
      percentual: 30,
      baseComissao: "bruto",
      // A maior das cinco: ~R$ 9 mi/ano.
      regime: "lucro_presumido",
      anexoSimples: "II",
      uf: "GO",
      rbt12Manual: null,
      ativo: true,
      observacao: null,
    },
    {
      id: "influencer-verte",
      nome: "Camila Prado",
      marca: "Verte Natural",
      percentual: 25,
      baseComissao: "recebido",
      // ~R$ 2,8 mi/ano: cabe no Simples, dentro do sublimite de ICMS.
      regime: "simples_nacional",
      anexoSimples: "II",
      uf: "GO",
      rbt12Manual: null,
      ativo: true,
      observacao: "Percentual menor e base sobre o recebido, negociados na renovacao.",
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
      rbt12Manual: null,
      ativo: true,
      observacao: "Publico jovem, muito boleto.",
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
 * cadastrado aqui: a repartição vem da tabela oficial do Anexo II e aparece na
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
      nome: "ICMS Substituicao Tributaria",
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
        "Incide quando a fabrica vende para revenda e assume a condicao de " +
        "substituta. Na venda direta ao consumidor final pela loja, que e o " +
        "caso deste painel, normalmente nao se aplica. A aliquota efetiva " +
        "depende da MVA do produto e da UF de destino -- peca ao contador.",
    },
    {
      id: "imposto-fundeinfra",
      nome: "Fundo de Infraestrutura de Goias",
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
        "Contribuicao estadual de Goias, ligada a operacoes com beneficio " +
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
        "Aliquota legal do regime cumulativo. No Simples o PIS ja esta dentro " +
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
      observacao: "Aliquota legal do regime cumulativo.",
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
        "15% sobre a base presumida de 8% da receita, que e a presuncao da " +
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
        "10% sobre a parte da base presumida que exceder R$ 20 mil no mes. " +
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
      nome: "ICMS proprio",
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
        "ESTIMATIVA, TROQUE PELA EFETIVA DO CONTADOR. Nao existe aliquota " +
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
        "A aliquota depende do NCM de cada produto na tabela TIPI e varia " +
        "bastante dentro de cosmeticos -- boa parte fica em zero, perfumaria " +
        "pode passar de 20%. Informe por produto conforme o NCM. No Simples o " +
        "IPI ja esta dentro da guia unica.",
    },

    // ------------------------------------------------------- LUCRO REAL
    {
      id: "imposto-pis-nao-cumulativo",
      nome: "PIS/Pasep nao cumulativo",
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
        "Aliquota cheia. No regime nao cumulativo ha credito sobre insumos, " +
        "que este painel nao modela -- o valor devido e menor. Informe a " +
        "aliquota efetiva liquida de creditos antes de ativar.",
    },
    {
      id: "imposto-cofins-nao-cumulativa",
      nome: "COFINS nao cumulativa",
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
        "Aliquota cheia, sem os creditos sobre insumos. Mesma ressalva do PIS " +
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
 * 2023 e 2025, algumas ja embutem fundo de combate a pobreza e outras nao --
 * a tela avisa "a confirmar" em cada um ate alguem conferir com o contador.
 */
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
