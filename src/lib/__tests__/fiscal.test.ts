import { describe, expect, it } from "vitest";

import {
  aliquotaEfetiva,
  apurarSimples,
  faixaPorRBT12,
  monitorarTeto,
  tetoEmAlerta,
} from "@/lib/simplesNacional";
import {
  apurarImpostos,
  calcularRBT12,
  idsMarcadosPorPadrao,
  idsSugeridosPorRegime,
  impostosDoRegime,
  linhasConsolidadas,
} from "@/lib/impostos";
import { SUBLIMITE_ICMS_SIMPLES, TETO_SIMPLES_NACIONAL } from "@/types/fiscal";
import type { Imposto } from "@/types/fiscal";
import type { Influencer } from "@/types/dominio";
import { chaveProduto, pareceKit, type Produto } from "@/types/produto";
import type { ItemCatalogo, Pedido } from "@/types/nuvemshop";
import { REGIME_SEM_INFLUENCER } from "@/lib/config";
import { produtosParaCadastrar } from "@/lib/costing";

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------

let sequencia = 1;

function pedido(parcial: Partial<Pedido> = {}): Pedido {
  const id = sequencia++;
  return {
    id,
    number: id,
    created_at: "2026-09-10T12:00:00.000Z",
    paid_at: "2026-09-10T12:05:00.000Z",
    status: "closed",
    payment_status: "paid",
    shipping_status: "fulfilled",
    subtotal: "1000.00",
    total: "1000.00",
    discount: "0.00",
    shipping_cost_customer: "0.00",
    shipping_cost_owner: "0.00",
    gateway_name: "Mercado Pago",
    payment_details: { method: "credit_card", credit_card_company: "visa", installments: 1 },
    cancel_reason: null,
    shipping_address: { province: "SP", city: "Sao Paulo", zipcode: "01000-000", country: "BR" },
    customer: {
      id: 1,
      name: "Cliente",
      email: "c@exemplo.com.br",
      total_spent: "0.00",
      last_order_id: id,
      created_at: "2026-01-01T00:00:00.000Z",
    },
    products: [
      {
        id,
        product_id: 1,
        variant_id: 11,
        name: "Produto A",
        price: "1000.00",
        quantity: 1,
        sku: "A",
      },
    ],
    marca: "Marca",
    ...parcial,
  };
}

function imposto(parcial: Partial<Imposto> = {}): Imposto {
  return {
    id: "imp-1",
    nome: "Imposto Teste",
    sigla: "TST",
    esfera: "estadual",
    baseIncidencia: "receita",
    aliquota: 10,
    regimes: ["simples_nacional", "lucro_presumido", "lucro_real"],
    percentualPresuncao: null,
    deducaoMensal: null,
    dentroDoDAS: false,
    aplicacaoPorProduto: false,
    ativo: true,
    confirmadoPeloContador: false,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

function produto(parcial: Partial<Produto> = {}): Produto {
  const produtoId = parcial.produtoId ?? 1;
  const varianteId = parcial.varianteId ?? 11;
  return {
    id: `p-${produtoId}-${varianteId}`,
    chave: chaveProduto(produtoId, varianteId),
    produtoId,
    varianteId,
    nome: "Produto A",
    sku: "A",
    ncm: "3305.10.00",
    origem: "nuvemshop",
    marca: null,
    influencerId: null,
    impostosIds: [],
    ehKit: false,
    componentes: [],
    ativo: true,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

function influencer(parcial: Partial<Influencer> = {}): Influencer {
  return {
    id: "inf-1",
    nome: "Influencer Teste",
    marca: "Marca",
    percentual: 30,
    baseComissao: "bruto",
    regime: "simples_nacional",
    anexoSimples: "II",
    uf: "GO",
    cnpj: null,
    inicioAtividade: null,
    rbt12Manual: null,
    ativo: true,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

// ---------------------------------------------------------------------------
// Simples Nacional
// ---------------------------------------------------------------------------

describe("faixaPorRBT12", () => {
  it("respeita os limites de cada faixa", () => {
    expect(faixaPorRBT12(180_000).faixa).toBe(1);
    expect(faixaPorRBT12(180_000.01).faixa).toBe(2);
    expect(faixaPorRBT12(3_600_000).faixa).toBe(5);
    expect(faixaPorRBT12(3_600_000.01).faixa).toBe(6);
  });

  it("devolve a ultima faixa acima do teto, para a tela ter o que mostrar", () => {
    expect(faixaPorRBT12(50_000_000).faixa).toBe(6);
  });
});

describe("aliquotaEfetiva", () => {
  it("desconta a parcela a deduzir -- nao e a aliquota da tabela", () => {
    // Anexo I, faixa 4: nominal 10,7%, deduzir R$ 22.500.
    // (1.000.000 x 0,107 - 22.500) / 1.000.000 = 8,45%
    expect(aliquotaEfetiva(1_000_000)).toBeCloseTo(8.45, 6);
  });

  it("na 1a faixa a efetiva coincide com a nominal (deducao zero)", () => {
    expect(aliquotaEfetiva(180_000)).toBeCloseTo(4, 6);
  });

  it("no limite da 5a faixa fica bem abaixo dos 14,3% nominais", () => {
    // (3.600.000 x 0,143 - 87.300) / 3.600.000 = 11,875%
    expect(aliquotaEfetiva(3_600_000)).toBeCloseTo(11.875, 3);
  });

  it("devolve zero para receita zero, sem dividir por zero", () => {
    expect(aliquotaEfetiva(0)).toBe(0);
  });
});

describe("apurarSimples", () => {
  const apuracao = apurarSimples(1_000_000, 100_000);

  it("aplica a aliquota efetiva sobre a receita do mes", () => {
    expect(apuracao.valorDAS).toBeCloseTo(8_450, 6);
  });

  it("a soma da reparticao fecha com o valor da guia", () => {
    const soma = apuracao.composicao.reduce((s, t) => s + t.valor, 0);
    expect(soma).toBeCloseTo(apuracao.valorDAS, 6);
  });

  it("nao lista tributo com participacao zero", () => {
    // Na 6a faixa o ICMS sai do DAS e nao deve aparecer na quebra.
    const faixaSeis = apurarSimples(4_000_000, 100_000);
    expect(faixaSeis.composicao.find((t) => t.sigla === "ICMS")).toBeUndefined();
    expect(apuracao.composicao.find((t) => t.sigla === "ICMS")).toBeDefined();
  });
});

describe("monitorarTeto", () => {
  it("acusa quando passa do sublimite estadual de ICMS", () => {
    const monitor = monitorarTeto(SUBLIMITE_ICMS_SIMPLES + 1);
    expect(monitor.situacao).toBe("acima_do_sublimite");
    expect(monitor.folgaAteOSublimite).toBeLessThan(0);
  });

  it("acusa quando passa do teto do regime", () => {
    const monitor = monitorarTeto(TETO_SIMPLES_NACIONAL + 1);
    expect(monitor.situacao).toBe("acima_do_teto");
    expect(tetoEmAlerta(monitor.situacao)).toBe(true);
  });

  it("avisa antes de estourar, nao so depois", () => {
    expect(monitorarTeto(4_500_000).situacao).toBe("perto_do_teto");
    expect(monitorarTeto(3_400_000).situacao).toBe("perto_do_sublimite");
  });

  it("fica quieto quando ha folga", () => {
    const monitor = monitorarTeto(1_000_000);
    expect(monitor.situacao).toBe("dentro");
    expect(tetoEmAlerta(monitor.situacao)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Impostos por regime
// ---------------------------------------------------------------------------

describe("impostosDoRegime", () => {
  const pis = imposto({ id: "pis", sigla: "PIS", regimes: ["lucro_presumido"] });
  const st = imposto({ id: "st", sigla: "ICMS-ST", regimes: ["simples_nacional"] });
  const nenhum = imposto({ id: "orfao", sigla: "ORF", regimes: [] });

  it("filtra pelo regime, que e o que preenche o cadastro do produto", () => {
    expect(impostosDoRegime([pis, st, nenhum], "lucro_presumido")).toEqual([pis]);
    expect(impostosDoRegime([pis, st, nenhum], "simples_nacional")).toEqual([st]);
  });

  it("imposto sem regime nenhum nunca e sugerido", () => {
    for (const regime of ["simples_nacional", "lucro_presumido", "lucro_real"] as const) {
      expect(impostosDoRegime([nenhum], regime)).toEqual([]);
    }
  });

  it("idsSugeridosPorRegime devolve so os ids", () => {
    expect(idsSugeridosPorRegime([pis, st], "lucro_presumido")).toEqual(["pis"]);
  });
});

// ---------------------------------------------------------------------------
// RBT12
// ---------------------------------------------------------------------------

describe("calcularRBT12", () => {
  it("usa o valor informado quando existe", () => {
    const r = calcularRBT12([], 2_000_000);
    expect(r.valor).toBe(2_000_000);
    expect(r.origem).toBe("informado");
  });

  it("projeta para 12 meses quando ha menos historico", () => {
    const pedidos = [
      pedido({ created_at: "2026-08-10T12:00:00.000Z", total: "100.00" }),
      pedido({ created_at: "2026-09-10T12:00:00.000Z", total: "100.00" }),
    ];
    const r = calcularRBT12(pedidos, null);

    expect(r.mesesConsiderados).toBe(2);
    expect(r.projetado).toBe(true);
    expect(r.valor).toBeCloseTo(1_200, 6); // media 100 x 12
  });

  it("soma o FATURADO, inclusive o que nao foi pago", () => {
    // Era o recebido ate 18/09/2026; o dono mandou usar o faturado, e o RBT12
    // segue a base do imposto do mes (5.1.1). Um mes de historico projeta x12.
    const pedidos = [
      pedido({ created_at: "2026-09-01T12:00:00.000Z", total: "100.00" }),
      pedido({
        created_at: "2026-09-02T12:00:00.000Z",
        total: "900.00",
        payment_status: "pending",
      }),
    ];
    expect(calcularRBT12(pedidos, null).valor).toBeCloseTo(12_000, 6);
  });
});

// ---------------------------------------------------------------------------
// Apuracao por influencer
// ---------------------------------------------------------------------------

describe("apurarImpostos", () => {
  it("calcula o DAS sobre o FATURADO, inclusive o pedido nao pago", () => {
    const pedidos = [
      pedido({ total: "1000.00" }),
      pedido({ total: "1000.00", payment_status: "pending" }),
    ];

    const r = apurarImpostos(
      pedidos,
      pedidos,
      [],
      [],
      [influencer({ rbt12Manual: 1_000_000 })],
    );

    const marca = r.porInfluencer[0]!;
    expect(marca.baseReceita).toBe(2000);
    expect(marca.simples?.valorDAS).toBeCloseTo(169, 6); // 8,45% de 2000
  });

  it("o frete cobrado do cliente entra na base de TODO tributo", () => {
    // Decisao do dono em 18/09/2026: na legislacao o frete cobrado do
    // destinatario integra a base do ICMS, do PIS/COFINS e a receita bruta do
    // Simples. A comissao do influencer NAO acompanhou (5.1.2).
    const pedidos = [
      pedido({ total: "1100.00", shipping_cost_customer: "100.00" }),
    ];

    const r = apurarImpostos(
      pedidos,
      pedidos,
      [],
      [],
      [influencer({ rbt12Manual: 1_000_000 })],
    );

    const marca = r.porInfluencer[0]!;
    expect(marca.baseReceita).toBe(1100);
    expect(marca.simples?.valorDAS).toBeCloseTo(92.95, 6); // 8,45% de 1100
  });

  it("apura cada marca no SEU regime, nao num regime consolidado", () => {
    // E o ponto central: uma marca no Simples e outra no Presumido convivem,
    // e apurar as duas juntas daria um numero que nao serve para nenhuma.
    const pedidos = [
      pedido({ marca: "Pequena", total: "1000.00" }),
      pedido({ marca: "Grande", total: "1000.00" }),
    ];

    const pis = imposto({
      id: "pis",
      sigla: "PIS",
      aliquota: 0.65,
      regimes: ["lucro_presumido"],
      ativo: true,
    });

    const r = apurarImpostos(
      pedidos,
      pedidos,
      // O PIS so incide onde o produto o marcou; os dois pedidos usam este item.
      [produto({ produtoId: 1, varianteId: 11, impostosIds: ["pis"] })],
      [pis],
      [
        influencer({ id: "a", marca: "Pequena", regime: "simples_nacional", rbt12Manual: 1_000_000 }),
        influencer({ id: "b", marca: "Grande", regime: "lucro_presumido" }),
      ],
    );

    const pequena = r.porInfluencer.find((a) => a.marca === "Pequena")!;
    const grande = r.porInfluencer.find((a) => a.marca === "Grande")!;

    expect(pequena.regime).toBe("simples_nacional");
    expect(pequena.simples).not.toBeNull();
    expect(pequena.linhas.map((l) => l.sigla)).toEqual(["DAS"]);

    expect(grande.regime).toBe("lucro_presumido");
    expect(grande.simples).toBeNull();
    expect(grande.linhas.map((l) => l.sigla)).toEqual(["PIS"]);
    expect(grande.total).toBeCloseTo(6.5, 6);
  });

  it("o RBT12 do Simples soma as marcas do regime: e o da EMPRESA", () => {
    /*
     * Invertido em 23/09/2026, a pedido do dono. Antes era por marca, com o
     * argumento de que somar jogaria uma empresa pequena numa faixa que nao e
     * a dela. So que as marcas do Simples sao lojas do MESMO CNPJ, e o RBT12 e
     * apurado por CNPJ -- separar por loja jogava a empresa numa faixa mais
     * baixa que a devida.
     */
    const pedidos = [
      pedido({ marca: "A", total: "1000.00" }),
      pedido({ marca: "B", total: "1000.00" }),
    ];

    const r = apurarImpostos(
      pedidos,
      pedidos,
      [],
      [],
      [
        influencer({ id: "a", marca: "A" }),
        influencer({ id: "b", marca: "B" }),
      ],
    );

    for (const apuracao of r.porInfluencer) {
      // As duas marcas faturaram 1000 no mes -> projeta 24.000 para a empresa.
      expect(apuracao.rbt12.valor).toBeCloseTo(24_000, 6);
      expect(apuracao.rbt12Compartilhado).toBe(true);
    }
  });

  it("fora do Simples o RBT12 continua sendo o da propria marca", () => {
    // No Lucro Presumido nao ha faixa nem teto: o numero e so referencia, e
    // somar marcas ali nao significaria nada.
    const pedidos = [
      pedido({ marca: "A", total: "1000.00" }),
      pedido({ marca: "B", total: "1000.00" }),
    ];

    const r = apurarImpostos(
      pedidos,
      pedidos,
      [],
      [],
      [
        influencer({ id: "a", marca: "A", regime: "lucro_presumido" }),
        influencer({ id: "b", marca: "B", regime: "lucro_presumido" }),
      ],
    );

    for (const apuracao of r.porInfluencer) {
      expect(apuracao.rbt12.valor).toBeCloseTo(12_000, 6);
      expect(apuracao.rbt12Compartilhado).toBe(false);
    }
  });

  it("tributo sobre lucro usa a base presumida, e desconta a deducao mensal", () => {
    const pedidos = [pedido({ total: "1000000.00" })];

    const irpjAdicional = imposto({
      id: "irpj-ad",
      sigla: "IRPJ ad.",
      baseIncidencia: "lucro",
      aliquota: 10,
      percentualPresuncao: 8,
      deducaoMensal: 20_000,
      regimes: ["lucro_presumido"],
      ativo: true,
    });

    const r = apurarImpostos(
      pedidos,
      pedidos,
      [],
      [irpjAdicional],
      [influencer({ regime: "lucro_presumido" })],
    );

    // base = 8% de 1.000.000 = 80.000; menos 20.000 = 60.000; 10% = 6.000
    const linha = r.porInfluencer[0]!.linhas.find((l) => l.sigla === "IRPJ ad.")!;
    expect(linha.base).toBeCloseTo(60_000, 6);
    expect(linha.valor).toBeCloseTo(6_000, 6);
  });

  it("imposto por produto so incide sobre quem esta marcado", () => {
    const icmsSt = imposto({
      id: "st",
      sigla: "ICMS-ST",
      aplicacaoPorProduto: true,
      regimes: ["lucro_presumido"],
    });

    const marcado = pedido({
      products: [
        { id: 1, product_id: 1, variant_id: 11, name: "A", price: "1000.00", quantity: 1, sku: "A" },
      ],
    });
    const naoMarcado = pedido({
      products: [
        { id: 2, product_id: 2, variant_id: 22, name: "B", price: "1000.00", quantity: 1, sku: "B" },
      ],
    });

    const produtos = [
      produto({ produtoId: 1, varianteId: 11, impostosIds: ["st"] }),
      produto({ produtoId: 2, varianteId: 22, impostosIds: [] }),
    ];

    const r = apurarImpostos(
      [marcado, naoMarcado],
      [marcado, naoMarcado],
      produtos,
      [icmsSt],
      [influencer({ regime: "lucro_presumido" })],
    );

    const linha = r.porInfluencer[0]!.linhas.find((l) => l.sigla === "ICMS-ST")!;
    expect(linha.base).toBe(1000);
    expect(linha.valor).toBeCloseTo(100, 6);
  });

  it("imposto de outro regime nao entra, mesmo marcado no produto", () => {
    const soNoSimples = imposto({ id: "s", sigla: "SIMP", regimes: ["simples_nacional"] });

    const r = apurarImpostos(
      [pedido()],
      [pedido()],
      [produto({ impostosIds: ["s"] })],
      [soNoSimples],
      [influencer({ regime: "lucro_presumido" })],
    );

    expect(r.porInfluencer[0]!.linhas.find((l) => l.sigla === "SIMP")).toBeUndefined();
  });

  it("tributo inativo do regime volta em inativosDoRegime, e nao some", () => {
    // A tela precisa poder dizer "o ICMS nao esta nesta conta" em vez de
    // exibir um total menor sem explicar por que.
    const icms = imposto({
      id: "icms",
      sigla: "ICMS",
      aliquota: 0,
      ativo: false,
      regimes: ["lucro_presumido"],
    });

    const r = apurarImpostos(
      [pedido()],
      [pedido()],
      [],
      [icms],
      [influencer({ regime: "lucro_presumido" })],
    );

    expect(r.porInfluencer[0]!.linhas).toHaveLength(0);
    expect(r.porInfluencer[0]!.inativosDoRegime.map((i) => i.sigla)).toEqual(["ICMS"]);
    expect(r.temTributoDoRegimeInativo).toBe(true);
  });

  it("o que esta dentro do DAS nao soma no total", () => {
    const pedidos = [pedido({ total: "1000.00" })];
    const r = apurarImpostos(
      pedidos,
      pedidos,
      [],
      [],
      [influencer({ rbt12Manual: 1_000_000 })],
    );

    const marca = r.porInfluencer[0]!;
    expect(marca.detalheDoDAS.length).toBeGreaterThan(0);
    expect(marca.total).toBeCloseTo(marca.simples!.valorDAS, 6);
  });

  it("marca sem influencer cai no regime padrao, e nao trava", () => {
    const r = apurarImpostos([pedido()], [pedido()], [], [], []);

    expect(r.porInfluencer[0]!.influencerId).toBeNull();
    expect(r.porInfluencer[0]!.regime).toBe(REGIME_SEM_INFLUENCER);
  });

  it("influencer inativo nao assume a marca", () => {
    const r = apurarImpostos(
      [pedido()],
      [pedido()],
      [],
      [],
      [influencer({ ativo: false, regime: "lucro_real" })],
    );
    expect(r.porInfluencer[0]!.regime).toBe(REGIME_SEM_INFLUENCER);
  });

  it("declara a receita de produto sem cadastro fiscal", () => {
    const r = apurarImpostos([pedido()], [pedido()], [], [], [influencer()]);

    expect(r.produtosSemCadastro).toBe(1);
    expect(r.receitaSemCadastro).toBe(1000);
    expect(r.cobertura).toBe(0);
  });

  it("consolida as linhas somando por sigla", () => {
    const pis = imposto({
      id: "pis",
      sigla: "PIS",
      aliquota: 1,
      regimes: ["lucro_presumido"],
    });

    const pedidos = [
      pedido({ marca: "A", total: "1000.00" }),
      pedido({ marca: "B", total: "1000.00" }),
    ];

    const r = apurarImpostos(
      pedidos,
      pedidos,
      [produto({ produtoId: 1, varianteId: 11, impostosIds: ["pis"] })],
      [pis],
      [
        influencer({ id: "a", marca: "A", regime: "lucro_presumido" }),
        influencer({ id: "b", marca: "B", regime: "lucro_presumido" }),
      ],
    );

    const linhas = linhasConsolidadas(r);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.valor).toBeCloseTo(20, 6); // 1% de 1000, duas vezes
    expect(r.totalSobreVenda).toBeCloseTo(20, 6);
  });

  it("nao produz NaN sem nenhum pedido", () => {
    const r = apurarImpostos([], [], [], [], []);
    expect(Number.isNaN(r.totalSobreVenda)).toBe(false);
    expect(r.cargaSobreReceita).toBe(0);
    expect(r.porInfluencer).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Produtos vendidos que ainda nao estao no cadastro
// ---------------------------------------------------------------------------

describe("a marcação do produto manda no imposto sobre receita", () => {
  // Pedido de R$ 1.000 com item de R$ 1.000: receita real e receita de itens batem.
  const icms = imposto({ id: "icms", sigla: "ICMS", aliquota: 10, regimes: ["lucro_presumido"], aplicacaoPorProduto: true });
  const pis = imposto({ id: "pis", sigla: "PIS", aliquota: 0.65, regimes: ["lucro_presumido"] });
  const irpj = imposto({
    id: "irpj",
    sigla: "IRPJ",
    aliquota: 15,
    baseIncidencia: "lucro",
    percentualPresuncao: 8,
    regimes: ["lucro_presumido"],
  });
  const lista = [icms, pis, irpj];
  const apurar = (impostosIds: string[]) =>
    apurarImpostos(
      [pedido()],
      [pedido()],
      [produto({ produtoId: 1, varianteId: 11, impostosIds })],
      lista,
      [],
    );

  it("desmarcado não é cobrado; marcado incide sobre a receita dos produtos marcados", () => {
    const semPis = apurar(["icms"]);
    const comPis = apurar(["icms", "pis"]);
    expect(semPis.porInfluencer[0]!.linhas.find((l) => l.sigla === "PIS")).toBeUndefined();
    expect(comPis.porInfluencer[0]!.linhas.find((l) => l.sigla === "PIS")!.valor).toBeCloseTo(6.5, 6);
    expect(comPis.totalSobreVenda - semPis.totalSobreVenda).toBeCloseTo(6.5, 6);
  });

  it("imposto sobre o LUCRO não depende da marcação: é da marca inteira", () => {
    // 15% sobre 8% de R$ 1.000 = R$ 12, marcado ou nao.
    for (const marcados of [[], ["irpj"], ["icms"]]) {
      const linha = apurar(marcados).porInfluencer[0]!.linhas.find((l) => l.sigla === "IRPJ");
      expect(linha!.valor, marcados.join(",")).toBeCloseTo(12, 6);
    }
  });

  it("produto sem imposto marcado só paga o que incide sobre o lucro", () => {
    expect(apurar([]).porInfluencer[0]!.linhas.map((l) => l.sigla)).toEqual(["IRPJ"]);
  });
});

describe("idsMarcadosPorPadrao", () => {
  const icms = imposto({ id: "icms", sigla: "ICMS", aliquota: 10, regimes: ["lucro_presumido"], aplicacaoPorProduto: true });
  const ipi = imposto({ id: "ipi", sigla: "IPI", aliquota: 0, regimes: ["lucro_presumido"], aplicacaoPorProduto: true });
  const pis = imposto({ id: "pis", sigla: "PIS", aliquota: 0.65, regimes: ["lucro_presumido"] });
  const st = imposto({ id: "st", sigla: "ICMS-ST", regimes: ["simples_nacional"], aplicacaoPorProduto: true });
  const desligado = imposto({ id: "off", sigla: "OFF", regimes: ["lucro_presumido"], aplicacaoPorProduto: true, ativo: false });
  const lista = [icms, ipi, pis, st, desligado];

  it("nascem marcados os do regime que dependem do NCM, inclusive os de alíquota zero", () => {
    expect(idsMarcadosPorPadrao(lista, "lucro_presumido")).toEqual(["icms", "ipi"]);
    expect(idsMarcadosPorPadrao(lista, "simples_nacional")).toEqual(["st"]);
  });

  it("PIS e COFINS nascem desmarcados, mas continuam na lista do regime", () => {
    expect(idsMarcadosPorPadrao(lista, "lucro_presumido")).not.toContain("pis");
    expect(idsSugeridosPorRegime(lista, "lucro_presumido")).toContain("pis");
  });

  it("imposto desativado não nasce marcado", () => {
    expect(idsMarcadosPorPadrao(lista, "lucro_presumido")).not.toContain("off");
  });
});

describe("pareceKit", () => {
  it("reconhece os kits e combos da loja real pelo nome", () => {
    for (const nome of [
      "Kit Aurora: Body Splash + Loção Hidratante",
      "Kit Costa Amalfitana - 4 Body Splash",
      "Kit World Tour - Body Splash",
      "Combo Encanto Body Splash",
      "Combo: Tha Easy PDRN + Espuma de Limpeza Facial",
      "Shampoo Antiqueda + Condicionador Noite estrelada",
      "Kit Lovely: Deo Colonia + Body Splash",
    ]) {
      expect(pareceKit(nome), nome).toBe(true);
    }
  });

  it("não confunde produto avulso com kit", () => {
    for (const nome of [
      "Body Splash Sortido",
      "Beauty Balm Sortido",
      "Noite Estrelada - Desodorante Colônia 100ml",
      "PRÉ VENDA - Body Splash Jardim Secreto: Jhenny Keller x Tha Beauty",
      "Tha Easy Sérum Clareador facial - 30ml",
      "Kitten Perfume",
    ]) {
      expect(pareceKit(nome), nome).toBe(false);
    }
  });
});

describe("produtosParaCadastrar", () => {
  const doCatalogo = (produtoId: number, nome: string, extra: Partial<ItemCatalogo> = {}): ItemCatalogo => ({
    produtoId,
    varianteId: produtoId * 10,
    nome,
    sku: `CAT-${produtoId}`,
    publicado: true,
    marca: "Marca",
    ...extra,
  });

  it("só entra o que teve venda paga; o catálogo dá o nome e o SKU atuais", () => {
    const pedidos = [
      pedido({ products: [item(1, 10, "Nome antigo na venda"), item(3, 30, "Alfa")] }),
    ];
    const catalogo = [
      doCatalogo(1, "Nome atual no catálogo"),
      doCatalogo(2, "Zeta sem venda"),
      doCatalogo(3, "Alfa despublicado", { publicado: false }),
    ];
    const novos = produtosParaCadastrar(pedidos, [], [], [], catalogo);
    expect(novos.map((n) => n.chave).sort()).toEqual(["1:10", "3:30"]);
    const atual = novos.find((n) => n.chave === "1:10");
    // O catálogo manda no nome e no SKU: é o que a loja mostra hoje.
    expect(atual).toMatchObject({ nome: "Nome atual no catálogo", sku: "CAT-1", observacao: null });
    expect(novos.find((n) => n.chave === "3:30")!.observacao).toContain("Não publicado");
  });

  it("brinde a R$ 0 e item só não pago não entram", () => {
    const pedidos = [
      pedido({ products: [item(1, 10, "Creme"), item(5, 50, "Beauty Balm Sortido", "0.00", 3)] }),
      pedido({ payment_status: "pending", paid_at: null, products: [item(6, 60, "Só boleto")] }),
    ];
    expect(produtosParaCadastrar(pedidos, [], [], [], [doCatalogo(5, "Beauty Balm Sortido")]).map((n) => n.chave)).toEqual(["1:10"]);
  });

  it("vendido que saiu do catálogo entra, e a observação diz isso", () => {
    const pedidos = [pedido({ products: [item(9, 90, "Kit que saiu")] })];
    const [novo] = produtosParaCadastrar(pedidos, [], [], [], [doCatalogo(1, "Outro")]);
    expect(novo!.chave).toBe("9:90");
    expect(novo!.observacao).toContain("não está mais no catálogo");
  });

  it("kit pelo nome entra marcado como kit, sem componentes e com aviso", () => {
    const vendidos = [pedido({ products: [item(1, 10, "Kit"), item(2, 20, "Avulso")] })];
    const novos = produtosParaCadastrar(vendidos, [], [], [], [
      doCatalogo(1, "Kit Aurora: Body Splash + Loção Hidratante"),
      doCatalogo(2, "Body Splash Sortido"),
    ]);
    const kit = novos.find((n) => n.chave === "1:10");
    const avulso = novos.find((n) => n.chave === "2:20");
    expect(kit).toMatchObject({ nome: "Kit Aurora: Body Splash + Loção Hidratante", ehKit: true, componentes: [] });
    expect(kit!.observacao).toContain("falta informar os componentes");
    expect(avulso).toMatchObject({ ehKit: false, observacao: null });
  });

  it("item do catálogo já cadastrado não volta", () => {
    const vendidos = [pedido({ products: [item(1, 10, "Já existe")] })];
    const novos = produtosParaCadastrar(vendidos, [produto({ produtoId: 1, varianteId: 10 })], [], [], [doCatalogo(1, "Já existe")]);
    expect(novos).toHaveLength(0);
  });

  const item = (product_id: number, variant_id: number, name: string, price = "100.00", quantity = 1) => ({
    id: product_id * 100 + variant_id,
    product_id,
    variant_id,
    name,
    price,
    quantity,
    sku: `SKU-${product_id}`,
  });
  const icms = imposto({ id: "icms", sigla: "ICMS", regimes: ["lucro_presumido"], aplicacaoPorProduto: true });
  const das = imposto({ id: "st", sigla: "ICMS-ST", regimes: ["simples_nacional"], aplicacaoPorProduto: true });

  it("traz uma entrada por variante vendida e paga, a de maior receita primeiro", () => {
    const pedidos = [
      pedido({ products: [item(1, 11, "Creme"), item(2, 21, "Sérum", "300.00")] }),
      pedido({ products: [item(1, 11, "Creme", "100.00", 2)] }),
      pedido({ status: "cancelled", products: [item(3, 31, "Só cancelado")] }),
    ];
    const novos = produtosParaCadastrar(pedidos, [], [icms], []);
    expect(novos.map((n) => n.chave)).toEqual(["1:11", "2:21"]);
    expect(novos[1]).toMatchObject({ produtoId: 2, varianteId: 21, nome: "Sérum", sku: "SKU-2", origem: "nuvemshop", ehKit: false, ativo: true });
  });

  it("pula o que já está cadastrado, pela variante ou pelo produto inteiro", () => {
    const pedidos = [pedido({ products: [item(1, 11, "A"), item(2, 21, "B"), item(3, 31, "C")] })];
    const cadastro = [produto({ produtoId: 1, varianteId: 11 }), produto({ produtoId: 2, varianteId: null })];
    expect(produtosParaCadastrar(pedidos, cadastro, [], []).map((n) => n.chave)).toEqual(["3:31"]);
  });

  it("usa o nome da venda mais recente, porque o produto pode ter sido renomeado", () => {
    const pedidos = [
      pedido({ created_at: "2026-09-20T10:00:00.000-03:00", products: [item(1, 11, "Nome novo")] }),
      pedido({ created_at: "2026-07-02T10:00:00.000-03:00", products: [item(1, 11, "Nome antigo")] }),
    ];
    expect(produtosParaCadastrar(pedidos, [], [], [])[0]!.nome).toBe("Nome novo");
  });

  it("sem influencer, marca os impostos do regime padrão que dependem do produto", () => {
    // Com a lista vazia o produto contaria como "com cadastro fiscal" e o ICMS
    // por produto continuaria fora da conta, sem aviso nenhum.
    const pis = imposto({ id: "pis", sigla: "PIS", regimes: ["lucro_presumido"] });
    const [novo] = produtosParaCadastrar([pedido()], [], [icms, das, pis], []);
    expect(REGIME_SEM_INFLUENCER).toBe("lucro_presumido");
    expect(novo!.influencerId).toBeNull();
    expect(novo!.impostosIds).toEqual(["icms"]);
  });

  it("com influencer ativo na marca, vira dono e traz os impostos do regime dele", () => {
    const inativo = influencer({ id: "velho", marca: "Marca", regime: "lucro_presumido", ativo: false });
    const dono = influencer({ id: "dono", marca: "Marca", regime: "simples_nacional" });
    const [novo] = produtosParaCadastrar([pedido()], [], [icms, das], [inativo, dono]);
    expect(novo!.influencerId).toBe("dono");
    expect(novo!.impostosIds).toEqual(["st"]);
  });

  it("depois de cadastrado, a apuração cobre a receita e cobra o imposto por produto", () => {
    const pedidos = [pedido()];
    const cadastro = produtosParaCadastrar(pedidos, [], [icms], []).map((e, i) => ({
      ...e,
      id: `novo-${i}`,
      atualizadoEm: "2026-09-16T00:00:00.000Z",
    }));
    const antes = apurarImpostos(pedidos, pedidos, [], [icms], []);
    const depois = apurarImpostos(pedidos, pedidos, cadastro, [icms], []);
    expect(antes.cobertura).toBe(0);
    expect(depois.cobertura).toBe(1);
    expect(depois.totalSobreVenda).toBeCloseTo(antes.totalSobreVenda + 100, 6);
  });
});

// ---------------------------------------------------------------------------
// O RBT12 do Simples e da EMPRESA, nao da marca
// ---------------------------------------------------------------------------

describe("Simples: RBT12 somado das marcas do regime", () => {
  // Doze meses fechados, para nenhum numero sair projetado.
  const MESES = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

  /** Um pedido por mes, do valor pedido, na marca pedida. */
  const historico = (marca: string, porMes: number) =>
    MESES.map((mes) =>
      pedido({
        marca,
        created_at: `${mes}-10T12:00:00.000Z`,
        total: porMes.toFixed(2),
        subtotal: porMes.toFixed(2),
      }),
    );

  const das = imposto({
    id: "das",
    sigla: "DAS",
    dentroDoDAS: true,
    regimes: ["simples_nacional"],
  });

  /** Quatro lojas de R$ 1,2 mi/ano cada: a empresa fatura R$ 4,8 mi. */
  const marcas = ["Loja A", "Loja B", "Loja C", "Loja D"];
  const influencers = marcas.map((marca, n) =>
    influencer({ id: `inf-${n}`, nome: `Dono ${n}`, marca, regime: "simples_nacional" }),
  );
  const todos = marcas.flatMap((m) => historico(m, 100_000));
  const doMes = todos.filter((p) => p.created_at.startsWith("2026-12"));

  it("todas as marcas do Simples caem na MESMA faixa, com o mesmo RBT12", () => {
    const r = apurarImpostos(doMes, todos, [], [das], influencers);
    const noSimples = r.porInfluencer.filter((a) => a.simples);

    expect(noSimples).toHaveLength(4);
    // 4 lojas x 12 meses x R$ 100 mil = R$ 4,8 mi para a empresa inteira.
    for (const apuracao of noSimples) {
      expect(apuracao.rbt12.valor).toBeCloseTo(4_800_000, 2);
      expect(apuracao.rbt12Compartilhado).toBe(true);
    }
    expect(new Set(noSimples.map((a) => a.simples!.faixa)).size).toBe(1);
    expect(new Set(noSimples.map((a) => a.simples!.aliquotaEfetiva)).size).toBe(1);
  });

  it("uma loja sozinha cairia numa faixa mais BAIXA -- e e esse o erro corrigido", () => {
    const soUma = apurarImpostos(
      doMes.filter((p) => p.marca === "Loja A"),
      todos.filter((p) => p.marca === "Loja A"),
      [],
      [das],
      influencers,
    );
    const juntas = apurarImpostos(doMes, todos, [], [das], influencers);

    const sozinha = soUma.porInfluencer[0]!.simples!;
    const noGrupo = juntas.porInfluencer.find((a) => a.marca === "Loja A")!.simples!;

    expect(sozinha.rbt12).toBeCloseTo(1_200_000, 2);
    expect(noGrupo.rbt12).toBeCloseTo(4_800_000, 2);
    expect(noGrupo.faixa).toBeGreaterThan(sozinha.faixa);
    expect(noGrupo.aliquotaEfetiva).toBeGreaterThan(sozinha.aliquotaEfetiva);
  });

  it("o DAS de cada marca soma exatamente o DAS da empresa", () => {
    /*
     * A aliquota efetiva e a mesma para todas, entao ratear por marca e so uma
     * atribuicao: a soma tem que bater com a aliquota do grupo sobre a base do
     * grupo. E isso que deixa o raio-x e o relatorio atribuirem imposto a uma
     * marca sem inventar numero.
     */
    const r = apurarImpostos(doMes, todos, [], [das], influencers);
    const g = r.gruposSimples[0]!;

    const somaDasPartes = r.porInfluencer.reduce((s, a) => s + (a.simples?.valorDAS ?? 0), 0);
    expect(somaDasPartes).toBeCloseTo((g.baseDoMes * g.aliquotaEfetiva) / 100, 6);
    expect(g.valorDAS).toBeCloseTo(somaDasPartes, 6);
    expect(g.marcas).toEqual(marcas);
  });

  it("marca fora do Simples nao entra no RBT12 do grupo", () => {
    const comPresumido = [
      ...influencers.slice(0, 3),
      influencer({ id: "inf-3", nome: "Dono 3", marca: "Loja D", regime: "lucro_presumido" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], comPresumido);

    // Tres lojas no Simples: R$ 3,6 mi, e nao os R$ 4,8 mi das quatro.
    expect(r.gruposSimples[0]!.marcas).toEqual(["Loja A", "Loja B", "Loja C"]);
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(3_600_000, 2);

    const foraDoRegime = r.porInfluencer.find((a) => a.marca === "Loja D")!;
    expect(foraDoRegime.simples).toBeNull();
    expect(foraDoRegime.rbt12Compartilhado).toBe(false);
    // Fora do Simples o RBT12 continua sendo o da propria marca, de referencia.
    expect(foraDoRegime.rbt12.valor).toBeCloseTo(1_200_000, 2);
  });

  it("o teto e o sublimite tambem sao medidos no RBT12 da empresa", () => {
    // Sozinha, cada loja estaria confortavelmente dentro; juntas, no teto.
    const r = apurarImpostos(doMes, todos, [], [das], influencers);
    expect(r.gruposSimples[0]!.monitorTeto.rbt12).toBeCloseTo(4_800_000, 2);
    expect(r.gruposSimples[0]!.monitorTeto.situacao).not.toBe("dentro");
    for (const a of r.porInfluencer) {
      if (a.simples) expect(a.monitorTeto!.rbt12).toBeCloseTo(4_800_000, 2);
    }
  });

  it("sem marca no Simples, nao ha grupo", () => {
    const presumido = marcas.map((marca, n) =>
      influencer({ id: `inf-${n}`, marca, regime: "lucro_presumido" }),
    );
    expect(apurarImpostos(doMes, todos, [], [das], presumido).gruposSimples).toEqual([]);
  });

  it("RBT12 informado num contrato vale para o grupo inteiro", () => {
    const comInformado = [
      influencer({ ...influencers[0]!, rbt12Manual: 2_000_000 }),
      ...influencers.slice(1),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], comInformado);
    for (const a of r.porInfluencer) {
      expect(a.rbt12.valor).toBeCloseTo(2_000_000, 2);
      expect(a.rbt12.origem).toBe("informado");
    }
  });

  it("informados divergentes: vale o maior, porque subestimar a faixa e o erro caro", () => {
    const comInformado = [
      influencer({ ...influencers[0]!, rbt12Manual: 2_000_000 }),
      influencer({ ...influencers[1]!, rbt12Manual: 3_000_000 }),
      ...influencers.slice(2),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], comInformado);
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(3_000_000, 2);
  });
});

describe("Simples: o imposto de uma marca nao depende de quem mais esta na tela", () => {
  /*
   * A armadilha do RBT12 compartilhado: se o grupo fosse montado a partir dos
   * pedidos EM TELA, um relatorio filtrado numa marca so apuraria o RBT12
   * dela, cairia numa faixa mais baixa e mostraria um DAS menor que o da tela
   * inicial -- duas versoes do mesmo numero (5.14). Por isso o grupo sai do
   * CADASTRO de influencers, e nao dos pedidos.
   */
  const MESES = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  const marcas = ["Loja A", "Loja B", "Loja C"];
  const influencers = marcas.map((marca, n) =>
    influencer({ id: `inf-${n}`, nome: `Dono ${n}`, marca, regime: "simples_nacional" }),
  );
  const das = imposto({ id: "das", sigla: "DAS", dentroDoDAS: true, regimes: ["simples_nacional"] });

  const todos = marcas.flatMap((marca) =>
    MESES.map((mes) =>
      pedido({
        marca,
        created_at: `${mes}-10T12:00:00.000Z`,
        total: "100000.00",
        subtotal: "100000.00",
      }),
    ),
  );
  const doMes = todos.filter((p) => p.created_at.startsWith("2026-12"));

  it("o DAS da Loja A e o mesmo com as tres marcas em tela e com ela sozinha", () => {
    const comTodas = apurarImpostos(doMes, todos, [], [das], influencers);
    const soLojaA = apurarImpostos(
      doMes.filter((p) => p.marca === "Loja A"),
      todos,
      [],
      [das],
      influencers,
    );

    const naTelaCheia = comTodas.porInfluencer.find((a) => a.marca === "Loja A")!;
    const filtrada = soLojaA.porInfluencer.find((a) => a.marca === "Loja A")!;

    expect(filtrada.rbt12.valor).toBeCloseTo(naTelaCheia.rbt12.valor, 2);
    expect(filtrada.simples!.faixa).toBe(naTelaCheia.simples!.faixa);
    expect(filtrada.simples!.aliquotaEfetiva).toBeCloseTo(naTelaCheia.simples!.aliquotaEfetiva, 10);
    expect(filtrada.simples!.valorDAS).toBeCloseTo(naTelaCheia.simples!.valorDAS, 6);
  });

  it("marca do Simples que nao vendeu no mes continua contando no RBT12", () => {
    // Ela nao aparece em `porInfluencer` (nao ha pedido dela no mes), mas o
    // faturamento dela nos 12 meses e da empresa e entra na faixa.
    const semLojaC = doMes.filter((p) => p.marca !== "Loja C");
    const r = apurarImpostos(semLojaC, todos, [], [das], influencers);

    expect(r.porInfluencer.map((a) => a.marca)).toEqual(["Loja A", "Loja B"]);
    expect(r.gruposSimples[0]!.marcas).toEqual(marcas);
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(3_600_000, 2);
  });
});

describe("a memoria de calculo do contador (competencia 08/2026)", () => {
  /*
   * CRIAR BEAUTY MARKETING DIGITAL LTDA, CNPJ 30.997.734/0001-58,
   * Anexo I - Comercio, Secao 1 (revenda sem substituicao tributaria).
   *
   * E o unico documento do contador que o painel tem para o Simples, e foi ele
   * que trocou o anexo da apuracao (era o II, industria). Os numeros abaixo
   * estao copiados do papel: se alguem mexer na tabela ou na formula, este
   * teste diz na hora.
   */
  const RBT12 = 1_910_089.97;

  it("reproduz a aliquota efetiva, digito a digito", () => {
    const a = apurarSimples(RBT12, 5_151.33);

    expect(a.faixa).toBe(5);
    expect(a.aliquotaNominal).toBe(14.3);
    // ( 1.910.089,97 x 14,30% - 87.300,00 ) / 1.910.089,97
    expect(a.aliquotaEfetiva).toBeCloseTo(9.7295346621814, 10);
  });

  it("reproduz a reparticao por tributo do documento", () => {
    const a = apurarSimples(RBT12, 5_151.33);
    const participacao = Object.fromEntries(a.composicao.map((t) => [t.sigla, t.participacao]));

    expect(participacao).toEqual({
      IRPJ: 5.5,
      CSLL: 3.5,
      COFINS: 12.74,
      PIS: 2.76,
      CPP: 42,
      ICMS: 33.5,
    });
    // O Anexo I nao tem IPI: comercio nao industrializa.
    expect(participacao.IPI).toBeUndefined();
  });

  it("reproduz o valor de cada tributo sobre a receita tributada da secao", () => {
    // "Calculo Simples Nacional" do documento: receita tributada 5.151,33.
    const a = apurarSimples(RBT12, 5_151.33);
    const valor = Object.fromEntries(
      a.composicao.map((t) => [t.sigla, Math.round(t.valor * 100) / 100]),
    );

    expect(valor.IRPJ).toBeCloseTo(27.57, 2);
    expect(valor.CSLL).toBeCloseTo(17.54, 2);
    expect(valor.COFINS).toBeCloseTo(63.85, 2);
    expect(valor.PIS).toBeCloseTo(13.83, 2);
    expect(valor.CPP).toBeCloseTo(210.5, 2);
    expect(valor.ICMS).toBeCloseTo(167.9, 2);
  });

  it("a aliquota efetiva de cada tributo bate com a do documento", () => {
    const a = apurarSimples(RBT12, 5_151.33);
    const porSigla = Object.fromEntries(a.composicao.map((t) => [t.sigla, t.aliquotaSobreReceita]));

    expect(porSigla.IRPJ).toBeCloseTo(0.535124406, 8);
    expect(porSigla.CSLL).toBeCloseTo(0.340533713, 8);
    expect(porSigla.COFINS).toBeCloseTo(1.239542716, 8);
    expect(porSigla.PIS).toBeCloseTo(0.268535157, 8);
    expect(porSigla.CPP).toBeCloseTo(4.086404558, 8);
    expect(porSigla.ICMS).toBeCloseTo(3.259394112, 8);
  });
});

// ---------------------------------------------------------------------------
// O grupo do Simples e o CNPJ
// ---------------------------------------------------------------------------

describe("Simples: o grupo e o CNPJ, nao 'quem esta no Simples'", () => {
  const MESES = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
  const das = imposto({ id: "das", sigla: "DAS", dentroDoDAS: true, regimes: ["simples_nacional"] });

  /** Um pedido por mes, do valor pedido, na marca pedida. */
  const historico = (marca: string, porMes: number) =>
    MESES.map((mes) =>
      pedido({
        marca,
        created_at: `${mes}-10T12:00:00.000Z`,
        total: porMes.toFixed(2),
        subtotal: porMes.toFixed(2),
      }),
    );

  const todos = [...historico("Loja A", 100_000), ...historico("Loja B", 100_000)];
  const doMes = todos.filter((p) => p.created_at.startsWith("2026-12"));

  it("CNPJ diferente NAO soma: cada empresa na sua faixa", () => {
    /*
     * A correcao de 23/09/2026. O painel somava "todo mundo que esta no
     * Simples" numa faixa so, e isso acusava estouro do teto num caso em que
     * cada loja estava confortavelmente dentro dele.
     */
    const separadas = [
      influencer({ id: "a", marca: "Loja A", cnpj: "11444777000161" }),
      influencer({ id: "b", marca: "Loja B", cnpj: "34028316000103" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], separadas);

    expect(r.gruposSimples).toHaveLength(2);
    for (const g of r.gruposSimples) {
      expect(g.marcas).toHaveLength(1);
      expect(g.rbt12.valor).toBeCloseTo(1_200_000, 2);
    }
    // As duas lojas continuam com o RBT12 da empresa DELAS, e nao da soma.
    for (const a of r.porInfluencer) expect(a.rbt12.valor).toBeCloseTo(1_200_000, 2);
  });

  it("mesmo CNPJ soma, e as duas caem na mesma faixa", () => {
    const juntas = [
      influencer({ id: "a", marca: "Loja A", cnpj: "11444777000161" }),
      influencer({ id: "b", marca: "Loja B", cnpj: "11444777000161" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], juntas);

    expect(r.gruposSimples).toHaveLength(1);
    expect(r.gruposSimples[0]!.cnpj).toBe("11444777000161");
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(2_400_000, 2);
    expect(new Set(r.porInfluencer.map((a) => a.simples!.faixa)).size).toBe(1);
  });

  it("sem CNPJ informado, continua somando tudo -- e o grupo se declara", () => {
    // E o comportamento de antes de o campo existir. A tela avisa, porque
    // somar lojas de CNPJ diferente joga todas numa faixa que nao e de nenhuma.
    const semCnpj = [
      influencer({ id: "a", marca: "Loja A" }),
      influencer({ id: "b", marca: "Loja B" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], semCnpj);

    expect(r.gruposSimples).toHaveLength(1);
    expect(r.gruposSimples[0]!.cnpj).toBeNull();
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(2_400_000, 2);
  });

  it("uma com CNPJ e outra sem nao viram o mesmo grupo", () => {
    const meio = [
      influencer({ id: "a", marca: "Loja A", cnpj: "11444777000161" }),
      influencer({ id: "b", marca: "Loja B" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], meio);

    expect(r.gruposSimples).toHaveLength(2);
    expect(new Set(r.gruposSimples.map((g) => g.cnpj))).toEqual(
      new Set(["11444777000161", null]),
    );
  });
});

describe("Simples: o RBT12 comeca na abertura do CNPJ", () => {
  const das = imposto({ id: "das", sigla: "DAS", dentroDoDAS: true, regimes: ["simples_nacional"] });

  /*
   * O caso da Ka Beauty: CNPJ aberto em 01/01/2026, mas a loja ja vendia em
   * 2025 -- naquele periodo, por outra empresa. Os meses de 2025 nao entram.
   */
  const todos = [
    ...["2025-10", "2025-11", "2025-12"].map((mes) =>
      pedido({ marca: "Ka", created_at: `${mes}-10T12:00:00.000Z`, total: "200000.00", subtotal: "200000.00" }),
    ),
    ...["2026-01", "2026-02", "2026-03"].map((mes) =>
      pedido({ marca: "Ka", created_at: `${mes}-10T12:00:00.000Z`, total: "100000.00", subtotal: "100000.00" }),
    ),
  ];
  const doMes = todos.filter((p) => p.created_at.startsWith("2026-03"));

  it("mes anterior a abertura fica fora da conta", () => {
    const comAbertura = [
      influencer({ marca: "Ka", cnpj: "11444777000161", inicioAtividade: "2026-01-01" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], comAbertura);

    // So jan+fev+mar de 2026: 300 mil. Os 600 mil de 2025 eram do CNPJ antigo.
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(300_000, 2);
    expect(r.gruposSimples[0]!.rbt12.origem).toBe("abertura");
  });

  it("EMPRESA NOVA NAO PROJETA: e a soma pura dos meses desde a abertura", () => {
    /*
     * E o que o demonstrativo do contador faz. Projetar tres meses para doze
     * daria 1,2 milhao em vez de 300 mil, e jogaria a empresa faixas acima.
     */
    const comAbertura = [
      influencer({ marca: "Ka", cnpj: "11444777000161", inicioAtividade: "2026-01-01" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], comAbertura);

    expect(r.gruposSimples[0]!.rbt12.projetado).toBe(false);
    expect(r.gruposSimples[0]!.rbt12.mesesConsiderados).toBe(3);
  });

  it("sem data de abertura, base curta continua sendo projetada", () => {
    // Ali os meses faltantes existiram e o painel simplesmente nao os tem.
    const semData = [influencer({ marca: "Ka", cnpj: "11444777000161" })];
    const r = apurarImpostos(doMes, todos, [], [das], semData);

    expect(r.gruposSimples[0]!.rbt12.origem).toBe("projecao");
    expect(r.gruposSimples[0]!.rbt12.projetado).toBe(true);
    // 6 meses somando 900 mil -> media de 150 mil -> 1,8 milhao projetado.
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(1_800_000, 2);
  });

  it("a data de abertura nao escorrega de mes pelo fuso", () => {
    // "2026-01-01" por `new Date` viraria 31/12/2025 no Brasil, e dezembro
    // voltaria para a conta. A fatia de texto resolve (mesma armadilha da
    // despesa).
    const comAbertura = [
      influencer({ marca: "Ka", cnpj: "11444777000161", inicioAtividade: "2026-01-01" }),
    ];
    const r = apurarImpostos(doMes, todos, [], [das], comAbertura);
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(300_000, 2);
  });

  it("divergindo entre lojas do mesmo CNPJ, vale a abertura MAIS ANTIGA", () => {
    // A empresa comecou quando a primeira loja dela comecou.
    const comOutra = [
      ...todos,
      ...["2026-02", "2026-03"].map((mes) =>
        pedido({ marca: "Kb", created_at: `${mes}-10T12:00:00.000Z`, total: "50000.00", subtotal: "50000.00" }),
      ),
    ];
    const duas = [
      influencer({ id: "a", marca: "Ka", cnpj: "11444777000161", inicioAtividade: "2026-01-01" }),
      influencer({ id: "b", marca: "Kb", cnpj: "11444777000161", inicioAtividade: "2026-02-01" }),
    ];
    const r = apurarImpostos(
      comOutra.filter((p) => p.created_at.startsWith("2026-03")),
      comOutra,
      [],
      [das],
      duas,
    );

    // Janeiro entra (a Ka ja faturava): 300 mil da Ka + 100 mil da Kb.
    expect(r.gruposSimples[0]!.rbt12.valor).toBeCloseTo(400_000, 2);
  });
});
