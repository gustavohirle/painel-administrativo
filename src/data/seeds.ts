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
import { indexarProdutos } from "@/lib/impostos";
import { chaveMes, filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import type { CustoProduto, Influencer } from "@/types/dominio";
import type { ConfiguracaoFiscal, Imposto } from "@/types/fiscal";
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

export function influencersIniciais(): Influencer[] {
  const agora = AGORA();

  const base: Array<Omit<Influencer, "id" | "atualizadoEm">> = [
    {
      nome: "Marina Costa",
      marca: "Aurora Beleza",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: "Contrato anual, renovacao em janeiro.",
    },
    {
      nome: "Bianca Reis",
      marca: "Luma Cosmeticos",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: null,
    },
    {
      nome: "Camila Prado",
      marca: "Verte Natural",
      percentual: 25,
      baseComissao: "bruto",
      ativo: true,
      observacao: "Percentual menor negociado na renovacao.",
    },
    {
      nome: "Rodrigo Salles",
      marca: "Nitro Hair",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: "Publico jovem, muito boleto.",
    },
    {
      nome: "Helena Duarte",
      marca: "Petra Skin",
      percentual: 30,
      baseComissao: "bruto",
      ativo: true,
      observacao: null,
    },
    {
      nome: "Tais Moreira",
      marca: "Aurora Beleza",
      percentual: 12,
      baseComissao: "recebido",
      ativo: true,
      observacao: "Contrato novo, ja fechado sobre o recebido.",
    },
  ];

  return base.map((influencer, indice) => ({
    ...influencer,
    id: `influencer-${indice + 1}`,
    atualizadoEm: agora,
  }));
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

  const base: Array<Omit<Imposto, "id" | "atualizadoEm">> = [
    {
      nome: "ICMS Substituicao Tributaria",
      sigla: "ICMS-ST",
      esfera: "estadual",
      baseIncidencia: "receita",
      aliquota: 0,
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
      nome: "Diferencial de Aliquota",
      sigla: "DIFAL",
      esfera: "estadual",
      baseIncidencia: "receita",
      aliquota: 0,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: false,
      confirmadoPeloContador: false,
      observacao:
        "Empresa optante pelo Simples Nacional nao recolhe DIFAL na condicao " +
        "de remetente em venda interestadual ao consumidor final. Ative apenas " +
        "se a empresa sair do Simples.",
    },
    {
      nome: "Fundo de Infraestrutura de Goias",
      sigla: "FUNDEINFRA",
      esfera: "estadual",
      baseIncidencia: "receita",
      aliquota: 0,
      dentroDoDAS: false,
      aplicacaoPorProduto: false,
      ativo: false,
      confirmadoPeloContador: false,
      observacao:
        "Contribuicao estadual de Goias, ligada a operacoes com beneficio " +
        "fiscal. Confirme com o contador se a operacao da fabrica esta " +
        "alcancada antes de ativar.",
    },
    {
      nome: "Imposto sobre Produtos Industrializados",
      sigla: "IPI",
      esfera: "federal",
      baseIncidencia: "receita",
      aliquota: 0,
      dentroDoDAS: false,
      aplicacaoPorProduto: true,
      ativo: false,
      confirmadoPeloContador: false,
      observacao:
        "No Anexo II do Simples o IPI ja esta dentro da guia unica -- ative " +
        "aqui apenas se a empresa deixar o Simples. A aliquota depende do NCM " +
        "de cada produto na tabela TIPI.",
    },
  ];

  return base.map((imposto, indice) => ({
    ...imposto,
    id: `imposto-${indice + 1}`,
    atualizadoEm: agora,
  }));
}

export function configuracaoFiscalInicial(): ConfiguracaoFiscal {
  return {
    regime: "simples_nacional",
    anexoSimples: "II",
    uf: "GO",
    rbt12Manual: null,
    atualizadoEm: AGORA(),
  };
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

export function produtosIniciais(impostos: Imposto[]): Produto[] {
  const agora = AGORA();
  // Todo produto ja vem com os impostos por produto marcados: assim, ativar
  // um imposto na tela fiscal passa a valer na hora, sem revisitar 47 fichas.
  const impostosPorProduto = impostos
    .filter((i) => i.aplicacaoPorProduto)
    .map((i) => i.id);

  const lista: Produto[] = [];

  for (const marca of MARCAS) {
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
          impostosIds: impostosPorProduto,
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
