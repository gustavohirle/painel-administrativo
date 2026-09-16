import { describe, expect, it } from "vitest";

import { calcularCMV } from "@/lib/costing";
import { limparAvisoDeKit, listarKits, rotulosParaEscolha, validarComposicao } from "@/lib/kits";
import type { CustoProduto } from "@/types/dominio";
import type { Pedido } from "@/types/nuvemshop";
import { AVISO_KIT_SEM_COMPOSICAO, chaveProduto, type Produto } from "@/types/produto";

function produto(produtoId: number, nome: string, extra: Partial<Produto> = {}): Produto {
  return {
    id: `p${produtoId}`,
    chave: chaveProduto(produtoId, produtoId * 10),
    produtoId,
    varianteId: produtoId * 10,
    nome,
    sku: `SKU${produtoId}`,
    ncm: null,
    origem: "nuvemshop",
    influencerId: null,
    impostosIds: [],
    ehKit: false,
    componentes: [],
    ativo: true,
    observacao: null,
    atualizadoEm: "2026-09-16T00:00:00.000Z",
    ...extra,
  };
}

function custo(produtoId: number, total: number): CustoProduto {
  return {
    id: `c${produtoId}`,
    produtoId,
    varianteId: produtoId * 10,
    sku: null,
    nome: "",
    custoMateriaPrima: total,
    custoEmbalagem: 0,
    custoMaoDeObra: 0,
    custoIndireto: 0,
    atualizadoEm: "2026-09-16T00:00:00.000Z",
  };
}

let seq = 1;
function venda(produtoId: number, quantidade: number, pago = true): Pedido {
  const id = seq++;
  return {
    id,
    number: id,
    created_at: "2026-09-10T12:00:00.000-03:00",
    paid_at: pago ? "2026-09-10T12:05:00.000-03:00" : null,
    status: "open",
    payment_status: pago ? "paid" : "pending",
    shipping_status: "unpacked",
    subtotal: "100.00",
    total: "100.00",
    discount: "0.00",
    shipping_cost_customer: "0.00",
    shipping_cost_owner: "0.00",
    gateway_name: "Nuvem Pago",
    payment_details: { method: "pix", credit_card_company: null, installments: null },
    cancel_reason: null,
    shipping_address: { province: "SP", city: null, zipcode: null, country: "BR" },
    customer: { id: -id, name: "", email: "", total_spent: "0.00", last_order_id: null, created_at: "" },
    products: [
      { id, product_id: produtoId, variant_id: produtoId * 10, name: "x", price: "100.00", quantity: quantidade, sku: null },
    ],
    marca: "Loja",
  };
}

const splash = produto(1, "Body Splash Maresia 200ml");
const locao = produto(2, "Loção Hidratante Maresia 200ml");
const colonia = produto(3, "Maresia - Desodorante Colônia 100ml");
const kit = produto(10, "Kit Maresia: Body Splash + Loção", {
  ehKit: true,
  componentes: [
    { chave: splash.chave, nome: "nome antigo", quantidade: 1 },
    { chave: locao.chave, nome: "Loção", quantidade: 1 },
  ],
});
const aMontar = produto(11, "Kit Aurora", { ehKit: true });
const combo = produto(12, "Combo: Kit Maresia + Colônia", {
  ehKit: true,
  componentes: [
    { chave: kit.chave, nome: "Kit Maresia", quantidade: 1 },
    { chave: colonia.chave, nome: "Colônia", quantidade: 1 },
  ],
});
const cadastro = [splash, locao, colonia, kit, aMontar, combo];

describe("listarKits", () => {
  it("lista só os kits, com o nome atual dos itens e os mais vendidos primeiro", () => {
    const kits = listarKits(cadastro, [], [venda(11, 5), venda(10, 2), venda(10, 1), venda(12, 9, false)]);
    expect(kits.map((k) => k.nome)).toEqual([
      "Kit Aurora",
      "Kit Maresia: Body Splash + Loção",
      "Combo: Kit Maresia + Colônia",
    ]);
    expect(kits[1]!.vendidos).toBe(3);
    // Pedido não pago não conta como vendido.
    expect(kits[2]!.vendidos).toBe(0);
    expect(kits[1]!.itens[0]).toMatchObject({ nome: "Body Splash Maresia 200ml", sku: "SKU1", removido: false });
  });

  it("custo do kit é a soma dos itens, com kit dentro de kit resolvido", () => {
    const kits = listarKits(cadastro, [custo(1, 8), custo(2, 7), custo(3, 20)], []);
    const maresia = kits.find((k) => k.chave === kit.chave)!;
    const doCombo = kits.find((k) => k.chave === combo.chave)!;
    expect(maresia.custoUnitario).toBe(15);
    expect(doCombo.custoUnitario).toBe(35);
    expect(doCombo.itens.map((i) => i.custoUnitario)).toEqual([15, 20]);
    expect(maresia.temFichaPropria).toBe(false);
  });

  it("é o mesmo custo que o CMV usa", () => {
    const custos = [custo(1, 8), custo(2, 7)];
    const [maresia] = listarKits([splash, locao, kit], custos, []);
    expect(calcularCMV([venda(10, 3)], custos, [splash, locao, kit]).cmv).toBe(maresia!.custoUnitario! * 3);
  });

  it("item sem custo deixa o kit sem custo, e a conta diz quantos faltam", () => {
    const [maresia] = listarKits([splash, locao, kit], [custo(1, 8)], []);
    expect(maresia!.custoUnitario).toBeNull();
    expect(maresia!.itensSemCusto).toBe(1);
  });

  it("ficha própria do kit vence a soma", () => {
    const [maresia] = listarKits([splash, locao, kit], [custo(1, 8), custo(2, 7), custo(10, 12)], []);
    expect(maresia!.custoUnitario).toBe(12);
    expect(maresia!.temFichaPropria).toBe(true);
  });

  it("item que saiu do cadastro aparece marcado, com o nome guardado no kit", () => {
    const [maresia] = listarKits([splash, kit], [], []);
    expect(maresia!.itens[1]).toMatchObject({ nome: "Loção", removido: true, custoUnitario: null });
  });
});

describe("validarComposicao", () => {
  it("resolve o nome no cadastro e soma item repetido", () => {
    const r = validarComposicao(aMontar, [
      { chave: splash.chave, quantidade: 1 },
      { chave: locao.chave, quantidade: 2 },
      { chave: splash.chave, quantidade: 1 },
    ], cadastro);
    expect(r).toEqual({
      ok: true,
      componentes: [
        { chave: splash.chave, nome: "Body Splash Maresia 200ml", quantidade: 2 },
        { chave: locao.chave, nome: "Loção Hidratante Maresia 200ml", quantidade: 2 },
      ],
    });
  });

  it("composição vazia é aceita: o kit volta a ficar a montar", () => {
    expect(validarComposicao(kit, [], cadastro)).toEqual({ ok: true, componentes: [] });
  });

  it("recusa item que não está no cadastro", () => {
    const r = validarComposicao(aMontar, [{ chave: "999:9990", quantidade: 1 }], cadastro);
    expect(r.ok).toBe(false);
  });

  it("recusa quantidade zero, negativa, quebrada ou vinda vazia", () => {
    for (const quantidade of [0, -1, 1.5, Number(""), Number.NaN, 1000]) {
      expect(validarComposicao(aMontar, [{ chave: splash.chave, quantidade }], cadastro).ok, String(quantidade)).toBe(false);
    }
  });

  it("recusa o kit dentro dele mesmo, direto ou por outro kit", () => {
    expect(validarComposicao(kit, [{ chave: kit.chave, quantidade: 1 }], cadastro)).toMatchObject({
      ok: false,
      mensagem: "Um kit não pode conter ele mesmo.",
    });
    // O combo já contém o Kit Maresia: pôr o combo dentro do Kit Maresia fecharia um ciclo.
    const ciclo = validarComposicao(kit, [{ chave: combo.chave, quantidade: 1 }], cadastro);
    expect(ciclo.ok).toBe(false);
  });

  it("aceita kit dentro de kit quando não há ciclo", () => {
    const r = validarComposicao(aMontar, [{ chave: kit.chave, quantidade: 1 }], cadastro);
    expect(r.ok).toBe(true);
  });
});

describe("limparAvisoDeKit", () => {
  it("tira só o aviso de montar e mantém o resto da observação", () => {
    expect(limparAvisoDeKit(`${AVISO_KIT_SEM_COMPOSICAO} Não publicado na loja Nuvemshop.`)).toBe(
      "Não publicado na loja Nuvemshop.",
    );
    expect(limparAvisoDeKit(AVISO_KIT_SEM_COMPOSICAO)).toBeNull();
    expect(limparAvisoDeKit(null)).toBeNull();
    expect(limparAvisoDeKit("Outra coisa")).toBe("Outra coisa");
  });
});

describe("rotulosParaEscolha", () => {
  it("nome e SKU, com o número do produto só quando dois rótulos empatam", () => {
    const antigo = produto(4, "Watermelon fresh - Body lotion 200ml", { sku: "WTMBL" });
    const novo = produto(5, "Watermelon fresh - Body lotion 200ml", { sku: "WTMBL" });
    const rotulos = rotulosParaEscolha([splash, antigo, novo, kit]).map((r) => r.rotulo);
    expect(rotulos).toContain("Body Splash Maresia 200ml · SKU1");
    expect(rotulos).toContain("Watermelon fresh - Body lotion 200ml · WTMBL · nº 4");
    expect(rotulos).toContain("Watermelon fresh - Body lotion 200ml · WTMBL · nº 5");
    expect(new Set(rotulos).size).toBe(rotulos.length);
  });
});
