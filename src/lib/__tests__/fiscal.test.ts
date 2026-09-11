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
  idsSugeridosPorRegime,
  impostosDoRegime,
  linhasConsolidadas,
} from "@/lib/impostos";
import { SUBLIMITE_ICMS_SIMPLES, TETO_SIMPLES_NACIONAL } from "@/types/fiscal";
import type { Imposto } from "@/types/fiscal";
import type { Influencer } from "@/types/dominio";
import { chaveProduto, type Produto } from "@/types/produto";
import type { Pedido } from "@/types/nuvemshop";
import { REGIME_SEM_INFLUENCER } from "@/lib/config";

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
    // Faixa 4: nominal 11,2%, deduzir R$ 22.500.
    // (1.000.000 x 0,112 - 22.500) / 1.000.000 = 8,95%
    expect(aliquotaEfetiva(1_000_000)).toBeCloseTo(8.95, 6);
  });

  it("na 1a faixa a efetiva coincide com a nominal (deducao zero)", () => {
    expect(aliquotaEfetiva(180_000)).toBeCloseTo(4.5, 6);
  });

  it("no limite da 5a faixa fica bem abaixo dos 14,7% nominais", () => {
    expect(aliquotaEfetiva(3_600_000)).toBeCloseTo(12.325, 3);
  });

  it("devolve zero para receita zero, sem dividir por zero", () => {
    expect(aliquotaEfetiva(0)).toBe(0);
  });
});

describe("apurarSimples", () => {
  const apuracao = apurarSimples(1_000_000, 100_000);

  it("aplica a aliquota efetiva sobre a receita do mes", () => {
    expect(apuracao.valorDAS).toBeCloseTo(8_950, 6);
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

  it("soma apenas o recebido -- pedido nao pago nao e receita tributavel", () => {
    const pedidos = [
      pedido({ created_at: "2026-09-01T12:00:00.000Z", total: "100.00" }),
      pedido({
        created_at: "2026-09-02T12:00:00.000Z",
        total: "900.00",
        payment_status: "pending",
      }),
    ];
    expect(calcularRBT12(pedidos, null).valor).toBeCloseTo(1_200, 6);
  });
});

// ---------------------------------------------------------------------------
// Apuracao por influencer
// ---------------------------------------------------------------------------

describe("apurarImpostos", () => {
  it("calcula o DAS sobre o recebido, nao sobre o faturado", () => {
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
    expect(marca.baseReceita).toBe(1000);
    expect(marca.simples?.valorDAS).toBeCloseTo(89.5, 6); // 8,95% de 1000
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
      [],
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

  it("o RBT12 e por marca, nao no consolidado", () => {
    // Somar as marcas jogaria uma empresa pequena numa faixa que nao e a dela.
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
      // Cada marca faturou 1000 no mes -> projeta 12.000, nao 24.000.
      expect(apuracao.rbt12.valor).toBeCloseTo(12_000, 6);
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
      [],
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
