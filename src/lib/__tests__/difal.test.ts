import { describe, expect, it } from "vitest";

import { apurarDifal, somarDifal } from "@/lib/difal";
import {
  aliquotaInterestadual,
  estadoPorUF,
  ESTADOS,
  normalizarUF,
} from "@/types/estados";
import type { AliquotaEstado } from "@/types/fiscal";
import type { Pedido } from "@/types/nuvemshop";

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------

let sequencia = 1;

function pedido(uf: string | null, parcial: Partial<Pedido> = {}): Pedido {
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
    shipping_address:
      uf === null
        ? null
        : { province: uf, city: null, zipcode: null, country: "BR" },
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
        name: "Produto",
        price: "1000.00",
        quantity: 1,
        sku: null,
      },
    ],
    marca: "Marca",
    ...parcial,
  };
}

function aliquota(
  uf: string,
  aliquotaInterna: number,
  parcial: Partial<AliquotaEstado> = {},
): AliquotaEstado {
  return {
    uf,
    nome: estadoPorUF(uf)?.nome ?? uf,
    aliquotaInterna,
    ativo: true,
    confirmadoPeloContador: true,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
    ...parcial,
  };
}

/** Cadastro completo, com as aliquotas da tabela base. */
const TODAS = ESTADOS.map((e) => aliquota(e.uf, e.aliquotaInterna));

// ---------------------------------------------------------------------------
// Normalizacao de UF
// ---------------------------------------------------------------------------

describe("normalizarUF", () => {
  it("aceita a sigla, em qualquer caixa", () => {
    expect(normalizarUF("SP")).toBe("SP");
    expect(normalizarUF("sp")).toBe("SP");
    expect(normalizarUF(" Rj ")).toBe("RJ");
  });

  it("aceita o nome por extenso, com ou sem acento", () => {
    // A Nuvemshop devolve `province` ora como sigla, ora por extenso. Sem
    // normalizar, o mesmo estado viraria tres linhas no relatorio.
    expect(normalizarUF("São Paulo")).toBe("SP");
    expect(normalizarUF("Sao Paulo")).toBe("SP");
    expect(normalizarUF("ESPIRITO SANTO")).toBe("ES");
    expect(normalizarUF("Distrito Federal")).toBe("DF");
  });

  it("devolve null para vazio ou desconhecido", () => {
    expect(normalizarUF(null)).toBeNull();
    expect(normalizarUF(undefined)).toBeNull();
    expect(normalizarUF("")).toBeNull();
    expect(normalizarUF("   ")).toBeNull();
    expect(normalizarUF("Franca")).toBeNull();
  });

  it("cobre os 27 estados", () => {
    expect(ESTADOS).toHaveLength(27);
    for (const estado of ESTADOS) {
      expect(normalizarUF(estado.nome)).toBe(estado.uf);
    }
  });
});

// ---------------------------------------------------------------------------
// Aliquota interestadual
// ---------------------------------------------------------------------------

describe("aliquotaInterestadual", () => {
  it("de Goias e sempre 12%", () => {
    // Os 7% so valem saindo do Sul/Sudeste. Goias e Centro-Oeste.
    for (const destino of ["SP", "RJ", "BA", "AM", "RS", "MT"]) {
      expect(aliquotaInterestadual("GO", destino)).toBe(12);
    }
  });

  it("aplica 7% so do Sul/Sudeste para N, NE, CO ou ES", () => {
    expect(aliquotaInterestadual("SP", "BA")).toBe(7);
    expect(aliquotaInterestadual("SP", "ES")).toBe(7);
    expect(aliquotaInterestadual("RS", "GO")).toBe(7);
    expect(aliquotaInterestadual("MG", "AM")).toBe(7);
  });

  it("dentro do proprio Sul/Sudeste continua 12%", () => {
    expect(aliquotaInterestadual("SP", "RJ")).toBe(12);
    expect(aliquotaInterestadual("RS", "MG")).toBe(12);
  });

  it("saindo do Espirito Santo e 12%, mesmo sendo Sudeste", () => {
    // O ES esta excluido da regra dos 7% como ORIGEM, e incluido como destino.
    expect(aliquotaInterestadual("ES", "BA")).toBe(12);
  });

  it("cai em 12% quando a UF nao e reconhecida", () => {
    expect(aliquotaInterestadual("XX", "SP")).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Apuracao
// ---------------------------------------------------------------------------

describe("apurarDifal", () => {
  it("cobra a diferenca entre a interna do destino e a interestadual", () => {
    // SP interna 18%, interestadual de GO 12% -> 6% de R$ 1.000 = R$ 60.
    const r = apurarDifal([pedido("SP")], TODAS, "GO");

    expect(r.total).toBeCloseTo(60, 6);
    expect(r.baseInterestadual).toBe(1000);
    expect(r.porEstado[0]!.diferenca).toBeCloseTo(6, 6);
  });

  it("venda dentro do proprio estado nao gera DIFAL", () => {
    const r = apurarDifal([pedido("GO")], TODAS, "GO");

    expect(r.total).toBe(0);
    expect(r.baseInterna).toBe(1000);
    expect(r.baseInterestadual).toBe(0);
    expect(r.porEstado[0]!.interna).toBe(true);
  });

  it("optante do Simples nao recolhe, mas a distribuicao continua visivel", () => {
    // O STF suspendeu a exigencia para optante do Simples na ADI 5464. A tela
    // ainda precisa mostrar para onde as vendas foram.
    const r = apurarDifal([pedido("SP"), pedido("BA")], TODAS, "GO", false);

    expect(r.total).toBe(0);
    expect(r.baseInterestadual).toBe(2000);
    expect(r.porEstado).toHaveLength(2);
  });

  it("estado desativado sai do calculo mas continua na lista", () => {
    // Some-lo esconderia receita que existe.
    const r = apurarDifal([pedido("SP")], [aliquota("SP", 18, { ativo: false })], "GO");

    expect(r.total).toBe(0);
    expect(r.porEstado).toHaveLength(1);
    expect(r.porEstado[0]!.receita).toBe(1000);
  });

  it("estado sem cadastro nao inventa aliquota", () => {
    const r = apurarDifal([pedido("SP")], [], "GO");
    expect(r.total).toBe(0);
    expect(r.porEstado[0]!.aliquotaInterna).toBe(0);
  });

  it("nunca devolve DIFAL negativo", () => {
    // Destino com interna abaixo da interestadual: a diferenca e zero, nao
    // um credito. MS tem 17%, que ainda e maior; forcamos 10% para o caso.
    const r = apurarDifal([pedido("MS")], [aliquota("MS", 10)], "GO");
    expect(r.total).toBe(0);
    expect(r.porEstado[0]!.diferenca).toBe(0);
  });

  it("conta so pedidos recebidos", () => {
    const pedidos = [
      pedido("SP"),
      pedido("SP", { payment_status: "pending" }),
      pedido("SP", { status: "cancelled" }),
    ];
    expect(apurarDifal(pedidos, TODAS, "GO").baseInterestadual).toBe(1000);
  });

  it("declara os pedidos sem estado identificado", () => {
    const r = apurarDifal([pedido("SP"), pedido(null)], TODAS, "GO");

    expect(r.pedidosSemEstado).toBe(1);
    expect(r.receitaSemEstado).toBe(1000);
    // O que nao foi identificado nao entra na base.
    expect(r.baseInterestadual).toBe(1000);
  });

  it("agrupa o mesmo estado escrito de formas diferentes", () => {
    const r = apurarDifal(
      [pedido("SP"), pedido("São Paulo"), pedido("sao paulo")],
      TODAS,
      "GO",
    );

    expect(r.porEstado).toHaveLength(1);
    expect(r.porEstado[0]!.pedidos).toBe(3);
    expect(r.total).toBeCloseTo(180, 6); // 3 x R$ 60
  });

  it("acusa aliquota nao confirmada pelo contador", () => {
    const r = apurarDifal(
      [pedido("SP")],
      [aliquota("SP", 18, { confirmadoPeloContador: false })],
      "GO",
    );
    expect(r.temEstadoNaoConfirmado).toBe(true);
  });

  it("nao acusa quando a unica venda foi interna", () => {
    const r = apurarDifal(
      [pedido("GO")],
      [aliquota("GO", 19, { confirmadoPeloContador: false })],
      "GO",
    );
    expect(r.temEstadoNaoConfirmado).toBe(false);
  });

  it("ordena por DIFAL, maior primeiro", () => {
    // MA tem interna 23% (11 pontos de diferenca), SP tem 18% (6 pontos).
    const r = apurarDifal([pedido("SP"), pedido("MA")], TODAS, "GO");
    expect(r.porEstado[0]!.uf).toBe("MA");
  });

  it("nao produz NaN sem nenhum pedido", () => {
    const r = apurarDifal([], TODAS, "GO");
    expect(r.total).toBe(0);
    expect(r.cargaSobreReceita).toBe(0);
    expect(r.porEstado).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Consolidacao
// ---------------------------------------------------------------------------

describe("somarDifal", () => {
  it("soma o mesmo estado vindo de marcas diferentes", () => {
    const a = apurarDifal([pedido("SP")], TODAS, "GO");
    const b = apurarDifal([pedido("SP"), pedido("BA")], TODAS, "GO");

    const total = somarDifal([a, b], "GO");

    expect(total.total).toBeCloseTo(a.total + b.total, 6);
    expect(total.porEstado.find((l) => l.uf === "SP")!.pedidos).toBe(2);
    expect(total.porEstado).toHaveLength(2);
  });

  it("uma marca nao confirmada contamina o consolidado", () => {
    const confirmada = apurarDifal([pedido("SP")], TODAS, "GO");
    const duvidosa = apurarDifal(
      [pedido("BA")],
      [aliquota("BA", 20.5, { confirmadoPeloContador: false })],
      "GO",
    );

    expect(somarDifal([confirmada, duvidosa], "GO").temEstadoNaoConfirmado).toBe(
      true,
    );
  });

  it("lista vazia devolve zerado, sem NaN", () => {
    const r = somarDifal([], "GO");
    expect(r.total).toBe(0);
    expect(r.cargaSobreReceita).toBe(0);
  });
});
