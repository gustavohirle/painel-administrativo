import { describe, expect, it } from "vitest";

import {
  calcularSaldos,
  expandirItemVendido,
  resumirEstoque,
  unidadesConsumidas,
} from "@/lib/estoque";
import { custoUnitarioComKit, calcularCMV, indexarCustos } from "@/lib/costing";
import { indexarProdutos } from "@/lib/impostos";
import { chaveProduto, type ContagemEstoque, type Produto } from "@/types/produto";
import type { CustoProduto } from "@/types/dominio";
import type { Pedido, ProdutoDoPedido } from "@/types/nuvemshop";

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------

let sequencia = 1;

function item(parcial: Partial<ProdutoDoPedido> = {}): ProdutoDoPedido {
  return {
    id: sequencia++,
    product_id: 1,
    variant_id: 11,
    name: "Shampoo",
    price: "100.00",
    quantity: 1,
    sku: "SHP",
    ...parcial,
  };
}

function pedido(itens: ProdutoDoPedido[], parcial: Partial<Pedido> = {}): Pedido {
  const id = sequencia++;
  return {
    id,
    number: id,
    created_at: "2026-09-10T12:00:00.000Z",
    paid_at: "2026-09-10T12:05:00.000Z",
    status: "closed",
    payment_status: "paid",
    shipping_status: "fulfilled",
    subtotal: "100.00",
    total: "100.00",
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
    products: itens,
    marca: "Marca",
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
    nome: "Produto",
    sku: null,
    ncm: null,
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

function custo(produtoId: number, varianteId: number, total: number): CustoProduto {
  return {
    id: `c-${produtoId}-${varianteId}`,
    produtoId,
    varianteId,
    sku: null,
    nome: `Produto ${produtoId}`,
    custoMateriaPrima: total,
    custoEmbalagem: 0,
    custoMaoDeObra: 0,
    custoIndireto: 0,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
  };
}

/** Shampoo (1:11) + Creme (2:22), vendidos tambem como Kit (9:99). */
const SHAMPOO = produto({ produtoId: 1, varianteId: 11, nome: "Shampoo" });
const CREME = produto({ produtoId: 2, varianteId: 22, nome: "Creme" });
const KIT = produto({
  produtoId: 9,
  varianteId: 99,
  nome: "Kit Shampoo + Creme",
  ehKit: true,
  componentes: [
    { chave: chaveProduto(1, 11), nome: "Shampoo", quantidade: 1 },
    { chave: chaveProduto(2, 22), nome: "Creme", quantidade: 2 },
  ],
});

const CADASTRO = [SHAMPOO, CREME, KIT];

// ---------------------------------------------------------------------------
// Decomposicao de kit
// ---------------------------------------------------------------------------

describe("expandirItemVendido", () => {
  const indice = indexarProdutos(CADASTRO);

  it("item avulso devolve ele mesmo", () => {
    const unidades = expandirItemVendido(indice, 1, 11, 3, "Shampoo");
    expect(unidades).toEqual([{ chave: "1:11", nome: "Shampoo", quantidade: 3 }]);
  });

  it("kit devolve os componentes, multiplicados pela quantidade vendida", () => {
    // A Nuvemshop entrega o kit como UM produto: sem decompor, vender 10 kits
    // nao baixaria nada do estoque dos componentes.
    const unidades = expandirItemVendido(indice, 9, 99, 10, "Kit");

    expect(unidades).toEqual([
      { chave: "1:11", nome: "Shampoo", quantidade: 10 },
      { chave: "2:22", nome: "Creme", quantidade: 20 },
    ]);
  });

  it("resolve kit dentro de kit", () => {
    const superKit = produto({
      produtoId: 8,
      varianteId: 88,
      nome: "Super Kit",
      ehKit: true,
      componentes: [{ chave: chaveProduto(9, 99), nome: "Kit", quantidade: 2 }],
    });

    const unidades = expandirItemVendido(
      indexarProdutos([...CADASTRO, superKit]),
      8,
      88,
      1,
      "Super Kit",
    );

    expect(unidades).toEqual([
      { chave: "1:11", nome: "Shampoo", quantidade: 2 },
      { chave: "2:22", nome: "Creme", quantidade: 4 },
    ]);
  });

  it("nao entra em loop com kit que contem a si mesmo", () => {
    const circular = produto({
      produtoId: 7,
      varianteId: 77,
      nome: "Circular",
      ehKit: true,
      componentes: [{ chave: chaveProduto(7, 77), nome: "Circular", quantidade: 1 }],
    });

    const unidades = expandirItemVendido(
      indexarProdutos([circular]),
      7,
      77,
      1,
      "Circular",
    );
    expect(unidades.length).toBeGreaterThan(0);
  });

  it("item sem cadastro devolve ele mesmo, com o nome que veio da venda", () => {
    const unidades = expandirItemVendido(indexarProdutos([]), 5, 55, 2, "Desconhecido");
    expect(unidades).toEqual([
      { chave: "5:55", nome: "Desconhecido", quantidade: 2 },
    ]);
  });
});

describe("unidadesConsumidas", () => {
  const indice = indexarProdutos(CADASTRO);

  it("soma o consumo avulso com o que veio dentro de kit", () => {
    const pedidos = [
      pedido([item({ product_id: 1, variant_id: 11, quantity: 5 })]),
      pedido([item({ product_id: 9, variant_id: 99, quantity: 2, name: "Kit" })]),
    ];

    const consumo = unidadesConsumidas(pedidos, indice);
    expect(consumo.get("1:11")).toBe(7); // 5 avulsos + 2 dentro do kit
    expect(consumo.get("2:22")).toBe(4); // 2 kits x 2 cremes
  });

  it("ignora pedido que nao foi recebido", () => {
    const pedidos = [
      pedido([item({ quantity: 5 })], { payment_status: "pending" }),
      pedido([item({ quantity: 3 })], { status: "cancelled" }),
    ];
    expect(unidadesConsumidas(pedidos, indice).get("1:11")).toBeUndefined();
  });

  it("respeita o corte por data", () => {
    const pedidos = [
      pedido([item({ quantity: 5 })], { created_at: "2026-08-01T12:00:00.000Z" }),
      pedido([item({ quantity: 3 })], { created_at: "2026-09-15T12:00:00.000Z" }),
    ];
    const consumo = unidadesConsumidas(pedidos, indice, "2026-09-01T00:00:00.000Z");
    expect(consumo.get("1:11")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Saldos
// ---------------------------------------------------------------------------

function contagem(chave: string, quantidade: number, data: string): ContagemEstoque {
  return {
    id: `ct-${chave}`,
    chave,
    nome: chave,
    quantidade,
    dataContagem: data,
    responsavel: null,
    observacao: null,
    registradoEm: data,
  };
}

describe("calcularSaldos", () => {
  const pedidos = [
    pedido([item({ product_id: 1, variant_id: 11, quantity: 30 })], {
      created_at: "2026-09-15T12:00:00.000Z",
    }),
    pedido([item({ product_id: 9, variant_id: 99, quantity: 10, name: "Kit" })], {
      created_at: "2026-09-20T12:00:00.000Z",
    }),
  ];

  const opcoes = {
    pedidosDoPeriodo: pedidos,
    pedidosHistorico: pedidos,
    diasDoPeriodo: 30,
  };

  it("saldo e a contagem menos o que saiu depois dela", () => {
    const saldos = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 100, "2026-09-01T00:00:00.000Z")],
      opcoes,
    );
    const shampoo = saldos.find((s) => s.chave === "1:11")!;

    // 30 avulsos + 10 dentro de kit = 40
    expect(shampoo.vendidoDesdeContagem).toBe(40);
    expect(shampoo.saldoAtual).toBe(60);
  });

  it("e idempotente: recalcular nao muda o saldo", () => {
    const um = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 100, "2026-09-01T00:00:00.000Z")],
      opcoes,
    );
    const dois = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 100, "2026-09-01T00:00:00.000Z")],
      opcoes,
    );
    expect(um).toEqual(dois);
  });

  it("ignora vendas anteriores a contagem", () => {
    const saldos = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 100, "2026-09-18T00:00:00.000Z")],
      opcoes,
    );
    // So o pedido do dia 20 (10 kits = 10 shampoos) conta.
    expect(saldos.find((s) => s.chave === "1:11")!.saldoAtual).toBe(90);
  });

  it("usa sempre a contagem mais recente de cada item", () => {
    const saldos = calcularSaldos(
      CADASTRO,
      [
        contagem("1:11", 100, "2026-09-01T00:00:00.000Z"),
        { ...contagem("1:11", 500, "2026-09-25T00:00:00.000Z"), id: "ct-nova" },
      ],
      opcoes,
    );
    expect(saldos.find((s) => s.chave === "1:11")!.quantidadeContada).toBe(500);
  });

  it("kit nao tem saldo proprio -- quem tem estoque sao os componentes", () => {
    const saldos = calcularSaldos(CADASTRO, [], opcoes);
    expect(saldos.find((s) => s.chave === "9:99")).toBeUndefined();
    expect(saldos.find((s) => s.chave === "1:11")).toBeDefined();
  });

  it("item sem contagem fica com saldo null, e nao zero", () => {
    // Zero afirmaria que acabou; null admite que ninguem contou.
    const saldos = calcularSaldos(CADASTRO, [], opcoes);
    const shampoo = saldos.find((s) => s.chave === "1:11")!;
    expect(shampoo.saldoAtual).toBeNull();
    expect(shampoo.situacao).toBe("sem_contagem");
  });

  it("classifica pela cobertura em dias", () => {
    // 40 unidades em 30 dias = 1,33/dia.
    const critico = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 45, "2026-09-01T00:00:00.000Z")],
      opcoes,
    ).find((s) => s.chave === "1:11")!;
    expect(critico.situacao).toBe("critico"); // saldo 5 -> ~4 dias

    const saudavel = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 1000, "2026-09-01T00:00:00.000Z")],
      opcoes,
    ).find((s) => s.chave === "1:11")!;
    expect(saudavel.situacao).toBe("saudavel");
  });

  it("acusa saldo negativo", () => {
    const saldos = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 10, "2026-09-01T00:00:00.000Z")],
      opcoes,
    );
    const shampoo = saldos.find((s) => s.chave === "1:11")!;
    expect(shampoo.saldoAtual).toBe(-30);
    expect(shampoo.situacao).toBe("negativo");
  });

  it("resumirEstoque conta cada situacao", () => {
    const saldos = calcularSaldos(
      CADASTRO,
      [contagem("1:11", 1000, "2026-09-01T00:00:00.000Z")],
      opcoes,
    );
    const resumo = resumirEstoque(saldos);
    expect(resumo.itens).toBe(saldos.length);
    expect(resumo.saudaveis + resumo.semContagem).toBe(saldos.length);
  });
});

// ---------------------------------------------------------------------------
// Custo de kit
// ---------------------------------------------------------------------------

describe("custoUnitarioComKit", () => {
  const custos = indexarCustos([custo(1, 11, 30), custo(2, 22, 20)]);
  const produtos = indexarProdutos(CADASTRO);

  it("soma o custo dos componentes quando o kit nao tem ficha propria", () => {
    // 1 shampoo (30) + 2 cremes (20 cada) = 70
    expect(custoUnitarioComKit(custos, produtos, 9, 99)).toBe(70);
  });

  it("ficha propria do kit vence a soma dos componentes", () => {
    // A fabrica pode ter custo de montagem e embalagem proprios do kit.
    const comFicha = indexarCustos([custo(1, 11, 30), custo(2, 22, 20), custo(9, 99, 95)]);
    expect(custoUnitarioComKit(comFicha, produtos, 9, 99)).toBe(95);
  });

  it("componente sem custo torna o kit inteiro desconhecido", () => {
    // Somar so a parte conhecida devolveria um numero que parece certo e
    // esta errado para MENOS, inflando a margem.
    const parcial = indexarCustos([custo(1, 11, 30)]);
    expect(custoUnitarioComKit(parcial, produtos, 9, 99)).toBeNull();
  });

  it("item avulso sem ficha continua null", () => {
    expect(custoUnitarioComKit(indexarCustos([]), produtos, 1, 11)).toBeNull();
  });
});

describe("calcularCMV com kit", () => {
  it("usa o custo somado dos componentes do kit", () => {
    const pedidos = [
      pedido([item({ product_id: 9, variant_id: 99, quantity: 3, name: "Kit", price: "300.00" })]),
    ];

    const r = calcularCMV(pedidos, [custo(1, 11, 30), custo(2, 22, 20)], CADASTRO);
    expect(r.cmv).toBe(210); // 3 kits x R$ 70
    expect(r.produtosSemCusto).toBe(0);
  });

  it("sem o cadastro de produtos, o kit fica sem custo", () => {
    // Comprova que e o cadastro de composicao que resolve o custo do kit.
    const pedidos = [
      pedido([item({ product_id: 9, variant_id: 99, quantity: 3, name: "Kit", price: "300.00" })]),
    ];
    const r = calcularCMV(pedidos, [custo(1, 11, 30), custo(2, 22, 20)]);
    expect(r.cmv).toBe(0);
    expect(r.produtosSemCusto).toBe(1);
  });
});
