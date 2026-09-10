import { describe, expect, it } from "vitest";

import {
  aliquotaEfetiva,
  apurarSimples,
  faixaPorRBT12,
  monitorarTeto,
  tetoEmAlerta,
} from "@/lib/simplesNacional";
import { apurarImpostos, calcularRBT12, linhasQueSomam } from "@/lib/impostos";
import { SUBLIMITE_ICMS_SIMPLES, TETO_SIMPLES_NACIONAL } from "@/types/fiscal";
import type { ConfiguracaoFiscal, Imposto } from "@/types/fiscal";
import { chaveProduto, type Produto } from "@/types/produto";
import type { Pedido } from "@/types/nuvemshop";

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
    impostosIds: [],
    ehKit: false,
    componentes: [],
    ativo: true,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

const CONFIG: ConfiguracaoFiscal = {
  regime: "simples_nacional",
  anexoSimples: "II",
  uf: "GO",
  rbt12Manual: null,
  atualizadoEm: "2026-09-01T00:00:00.000Z",
};

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
// RBT12
// ---------------------------------------------------------------------------

describe("calcularRBT12", () => {
  it("usa o valor informado quando existe", () => {
    const r = calcularRBT12([], { ...CONFIG, rbt12Manual: 2_000_000 });
    expect(r.valor).toBe(2_000_000);
    expect(r.origem).toBe("informado");
  });

  it("projeta para 12 meses quando ha menos historico", () => {
    const pedidos = [
      pedido({ created_at: "2026-08-10T12:00:00.000Z", total: "100.00" }),
      pedido({ created_at: "2026-09-10T12:00:00.000Z", total: "100.00" }),
    ];
    const r = calcularRBT12(pedidos, CONFIG);

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
    expect(calcularRBT12(pedidos, CONFIG).valor).toBeCloseTo(1_200, 6);
  });
});

// ---------------------------------------------------------------------------
// Apuracao
// ---------------------------------------------------------------------------

describe("apurarImpostos", () => {
  it("calcula o DAS sobre o recebido, nao sobre o faturado", () => {
    const pedidos = [
      pedido({ total: "1000.00" }),
      pedido({ total: "1000.00", payment_status: "pending" }),
    ];

    const r = apurarImpostos(pedidos, pedidos, [], [], {
      ...CONFIG,
      rbt12Manual: 1_000_000,
    });

    expect(r.baseReceita).toBe(1000);
    expect(r.simples?.valorDAS).toBeCloseTo(89.5, 6); // 8,95% de 1000
  });

  it("imposto por produto so incide sobre quem esta marcado", () => {
    const icmsSt = imposto({ id: "st", sigla: "ICMS-ST", aplicacaoPorProduto: true });

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
      { ...CONFIG, regime: "lucro_presumido" },
    );

    const linha = r.foraDoDAS.find((l) => l.sigla === "ICMS-ST")!;
    expect(linha.base).toBe(1000);
    expect(linha.valor).toBeCloseTo(100, 6);
  });

  it("imposto inativo nao entra no calculo", () => {
    const r = apurarImpostos(
      [pedido()],
      [pedido()],
      [produto({ impostosIds: ["imp-1"] })],
      [imposto({ ativo: false })],
      { ...CONFIG, regime: "lucro_presumido" },
    );
    expect(r.foraDoDAS).toHaveLength(0);
    expect(r.totalSobreVenda).toBe(0);
  });

  it("o que esta dentro do DAS nao soma no total", () => {
    const pedidos = [pedido({ total: "1000.00" })];
    const r = apurarImpostos(pedidos, pedidos, [], [], {
      ...CONFIG,
      rbt12Manual: 1_000_000,
    });

    // A quebra existe para leitura, mas o total e so a guia.
    expect(r.detalheDoDAS.length).toBeGreaterThan(0);
    expect(r.totalSobreVenda).toBeCloseTo(r.simples!.valorDAS, 6);
  });

  it("declara a receita de produto sem cadastro fiscal", () => {
    const pedidos = [pedido({ total: "1000.00" })];
    const r = apurarImpostos(pedidos, pedidos, [], [], CONFIG);

    expect(r.produtosSemCadastro).toBe(1);
    expect(r.receitaSemCadastro).toBe(1000);
    expect(r.cobertura).toBe(0);
  });

  it("marca quando ha aliquota nao confirmada pelo contador", () => {
    const r = apurarImpostos(
      [pedido()],
      [pedido()],
      [],
      [imposto({ confirmadoPeloContador: false })],
      { ...CONFIG, regime: "lucro_presumido" },
    );
    expect(r.temImpostoNaoConfirmado).toBe(true);
  });

  it("linhasQueSomam junta a guia unica e os tributos de fora", () => {
    const pedidos = [pedido({ total: "1000.00" })];
    const r = apurarImpostos(
      pedidos,
      pedidos,
      [],
      [imposto({ aliquota: 5 })],
      { ...CONFIG, rbt12Manual: 1_000_000 },
    );

    const linhas = linhasQueSomam(r);
    const soma = linhas.reduce((s, l) => s + l.valor, 0);

    expect(linhas.map((l) => l.sigla)).toContain("DAS");
    expect(soma).toBeCloseTo(r.totalSobreVenda, 6);
  });

  it("nao produz NaN sem nenhum pedido", () => {
    const r = apurarImpostos([], [], [], [], CONFIG);
    expect(Number.isNaN(r.totalSobreVenda)).toBe(false);
    expect(r.cargaSobreReceita).toBe(0);
  });
});
