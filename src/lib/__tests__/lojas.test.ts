import { afterEach, describe, expect, it, vi } from "vitest";

import { lojasNuvemshop, REGIME_SEM_INFLUENCER } from "@/lib/config";
import { produtosParaCadastrar } from "@/lib/costing";
import {
  ajustesDeDono,
  donoPelaLoja,
  lojasParaCompletar,
  lojasPorChave,
} from "@/lib/donoProduto";
import type { Influencer } from "@/types/dominio";
import type { Imposto } from "@/types/fiscal";
import type { ItemCatalogo, Pedido } from "@/types/nuvemshop";
import { chaveProduto, type Produto } from "@/types/produto";

// ---------------------------------------------------------------------------
// Fabricas
// ---------------------------------------------------------------------------

function influencer(id: string, marca: string, parcial: Partial<Influencer> = {}): Influencer {
  return {
    id,
    nome: `Influencer ${id}`,
    marca,
    percentual: 25,
    baseComissao: "liquido",
    regime: "lucro_presumido",
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

function imposto(id: string, regimes: Imposto["regimes"], aplicacaoPorProduto: boolean): Imposto {
  return {
    id,
    nome: id,
    sigla: id.toUpperCase(),
    esfera: "estadual",
    baseIncidencia: "receita",
    aliquota: 4,
    regimes,
    percentualPresuncao: null,
    deducaoMensal: null,
    dentroDoDAS: false,
    aplicacaoPorProduto,
    ativo: true,
    confirmadoPeloContador: false,
    observacao: null,
    atualizadoEm: "2026-09-01T00:00:00.000Z",
  };
}

function produto(produtoId: number, parcial: Partial<Produto> = {}): Produto {
  const varianteId = parcial.varianteId === undefined ? produtoId * 10 : parcial.varianteId;
  return {
    id: `p${produtoId}`,
    chave: chaveProduto(produtoId, varianteId),
    produtoId,
    varianteId,
    nome: `Produto ${produtoId}`,
    sku: null,
    ncm: null,
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

let sequencia = 1;
function venda(marca: string, produtoId: number): Pedido {
  const id = sequencia++;
  return {
    id,
    number: id,
    created_at: "2026-09-10T12:00:00-03:00",
    paid_at: "2026-09-10T12:05:00-03:00",
    status: "closed",
    payment_status: "paid",
    shipping_status: "fulfilled",
    subtotal: "100.00",
    total: "100.00",
    discount: "0.00",
    shipping_cost_customer: "0.00",
    shipping_cost_owner: "0.00",
    gateway_name: "Nuvem Pago",
    payment_details: { method: "pix", credit_card_company: null, installments: 1 },
    cancel_reason: null,
    shipping_address: { province: "GO", city: "Goiânia", zipcode: "74000-000", country: "BR" },
    customer: {
      id: -id,
      name: "",
      email: "",
      total_spent: "0.00",
      last_order_id: id,
      created_at: "2026-01-01T00:00:00-03:00",
    },
    products: [
      {
        id: produtoId * 100,
        product_id: produtoId,
        variant_id: produtoId * 10,
        name: `Produto ${produtoId}`,
        price: "100.00",
        quantity: 1,
        sku: null,
      },
    ],
    marca,
  } as Pedido;
}

const doCatalogo = (produtoId: number, marca: string): ItemCatalogo => ({
  produtoId,
  varianteId: produtoId * 10,
  nome: `Produto ${produtoId}`,
  sku: null,
  publicado: true,
  marca,
});

// ---------------------------------------------------------------------------
// Configuracao: uma loja por influencer
// ---------------------------------------------------------------------------

describe("lojasNuvemshop", () => {
  const limpar = () => {
    for (const nome of Object.keys(process.env)) {
      if (nome.startsWith("NUVEMSHOP_")) vi.stubEnv(nome, "");
    }
  };
  afterEach(() => vi.unstubAllEnvs());

  it("lê um bloco numerado por loja e ignora o bloco ainda sem chave", () => {
    limpar();
    vi.stubEnv("NUVEMSHOP_LOJA_1_MARCA", "Tha Beauty");
    vi.stubEnv("NUVEMSHOP_LOJA_1_STORE_ID", "5018407");
    vi.stubEnv("NUVEMSHOP_LOJA_1_TOKEN", "chave-1");
    vi.stubEnv("NUVEMSHOP_LOJA_2_MARCA", "Loja Dois");
    vi.stubEnv("NUVEMSHOP_LOJA_2_STORE_ID", "222");
    vi.stubEnv("NUVEMSHOP_LOJA_2_TOKEN", " chave-2 ");
    vi.stubEnv("NUVEMSHOP_LOJA_3_MARCA", "");
    vi.stubEnv("NUVEMSHOP_LOJA_3_TOKEN", "COLE_A_CHAVE_AQUI");
    vi.stubEnv("NUVEMSHOP_LOJA_4_TOKEN", "");

    expect(lojasNuvemshop()).toEqual([
      { marca: "Tha Beauty", storeId: "5018407", accessToken: "chave-1" },
      { marca: "Loja Dois", storeId: "222", accessToken: "chave-2" },
    ]);
  });

  it("soma os blocos à linha JSON", () => {
    limpar();
    vi.stubEnv("NUVEMSHOP_LOJAS", '[{"marca":"Tha Beauty","storeId":5018407,"accessToken":"chave-1"}]');
    vi.stubEnv("NUVEMSHOP_LOJA_2_MARCA", "Loja Dois");
    vi.stubEnv("NUVEMSHOP_LOJA_2_STORE_ID", "222");
    vi.stubEnv("NUVEMSHOP_LOJA_2_TOKEN", "chave-2");
    expect(lojasNuvemshop().map((l) => l.marca)).toEqual(["Tha Beauty", "Loja Dois"]);
  });

  it("recusa bloco com chave e sem marca: nome inventado não casaria com contrato", () => {
    limpar();
    vi.stubEnv("NUVEMSHOP_LOJA_1_STORE_ID", "111");
    vi.stubEnv("NUVEMSHOP_LOJA_1_TOKEN", "chave");
    expect(() => lojasNuvemshop()).toThrow(/NUVEMSHOP_LOJA_1_MARCA/);
  });

  it("recusa id de loja que não é número", () => {
    limpar();
    vi.stubEnv("NUVEMSHOP_LOJA_1_MARCA", "Loja");
    vi.stubEnv("NUVEMSHOP_LOJA_1_STORE_ID", "abc");
    vi.stubEnv("NUVEMSHOP_LOJA_1_TOKEN", "chave");
    expect(() => lojasNuvemshop()).toThrow(/STORE_ID/);
  });

  it("recusa a mesma loja ou a mesma marca duas vezes", () => {
    limpar();
    vi.stubEnv("NUVEMSHOP_LOJA_1_MARCA", "Tha Beauty");
    vi.stubEnv("NUVEMSHOP_LOJA_1_STORE_ID", "111");
    vi.stubEnv("NUVEMSHOP_LOJA_1_TOKEN", "a");
    vi.stubEnv("NUVEMSHOP_LOJA_2_MARCA", "Outra");
    vi.stubEnv("NUVEMSHOP_LOJA_2_STORE_ID", "111");
    vi.stubEnv("NUVEMSHOP_LOJA_2_TOKEN", "b");
    expect(() => lojasNuvemshop()).toThrow(/aparece duas vezes/);

    vi.stubEnv("NUVEMSHOP_LOJA_2_MARCA", "tha beauty");
    vi.stubEnv("NUVEMSHOP_LOJA_2_STORE_ID", "222");
    expect(() => lojasNuvemshop()).toThrow(/está em duas lojas/);
  });
});

// ---------------------------------------------------------------------------
// A loja decide o dono do produto
// ---------------------------------------------------------------------------

describe("donoPelaLoja", () => {
  const tha = influencer("tha", "Tha Beauty");
  const outra = influencer("ana", "Loja Ana");

  it("produto de loja é do influencer ativo da loja, seja qual for o gravado", () => {
    expect(donoPelaLoja({ marca: "Loja Ana", influencerId: "tha" }, [tha, outra])).toBe("ana");
  });

  it("loja sem influencer ativo deixa o produto sem dono", () => {
    const inativa = influencer("ana", "Loja Ana", { ativo: false });
    expect(donoPelaLoja({ marca: "Loja Ana", influencerId: "ana" }, [tha, inativa])).toBeNull();
  });

  it("o primeiro ativo da marca manda, como na apuração", () => {
    const segundo = influencer("tha2", "Tha Beauty");
    expect(donoPelaLoja({ marca: "Tha Beauty", influencerId: null }, [tha, segundo])).toBe("tha");
  });

  it("produto criado à mão fica com o dono escolhido", () => {
    expect(donoPelaLoja({ marca: null, influencerId: "ana" }, [tha, outra])).toBe("ana");
  });
});

describe("ajustesDeDono", () => {
  const presumido = imposto("icms", ["lucro_presumido"], true);
  const doSimples = imposto("st", ["simples_nacional"], true);
  const impostos = [presumido, doSimples];

  it("produto trazido antes do contrato passa para o influencer da loja", () => {
    const orfao = produto(1, { marca: "Loja Ana", impostosIds: ["icms"] });
    const ajustes = ajustesDeDono([orfao], [influencer("ana", "Loja Ana")], impostos);
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0]).toMatchObject({ id: "p1", entrada: { influencerId: "ana", marca: "Loja Ana" } });
    // Mesmo regime do padrão sem influencer: a marcação feita fica.
    expect(REGIME_SEM_INFLUENCER).toBe("lucro_presumido");
    expect(ajustes[0]!.entrada.impostosIds).toEqual(["icms"]);
  });

  it("mudar de regime volta os impostos aos que nascem marcados no regime novo", () => {
    const item = produto(1, { marca: "Loja Ana", influencerId: "tha", impostosIds: ["icms"] });
    const ana = influencer("ana", "Loja Ana", { regime: "simples_nacional" });
    const [ajuste] = ajustesDeDono([item], [influencer("tha", "Tha Beauty"), ana], impostos);
    expect(ajuste!.entrada).toMatchObject({ influencerId: "ana", impostosIds: ["st"] });
  });

  it("não mexe no que já está certo nem no produto criado à mão", () => {
    const certo = produto(1, { marca: "Tha Beauty", influencerId: "tha" });
    const manual = produto(2, { origem: "manual", influencerId: "ana" });
    const lista = [influencer("tha", "Tha Beauty"), influencer("ana", "Loja Ana")];
    expect(ajustesDeDono([certo, manual], lista, impostos)).toEqual([]);
  });

  it("influencer desativado solta os produtos da loja dele", () => {
    const item = produto(1, { marca: "Tha Beauty", influencerId: "tha" });
    const [ajuste] = ajustesDeDono([item], [influencer("tha", "Tha Beauty", { ativo: false })], impostos);
    expect(ajuste!.entrada.influencerId).toBeNull();
  });
});

describe("loja de origem dos produtos já cadastrados", () => {
  it("vem do catálogo e, fora dele, das vendas", () => {
    const lojas = lojasPorChave(
      [venda("Tha Beauty", 1), venda("Loja Ana", 2)],
      [doCatalogo(2, "Loja Ana"), doCatalogo(3, "Loja Bia")],
    );
    expect(Object.fromEntries(lojas)).toEqual({
      "1:10": "Tha Beauty",
      "2:20": "Loja Ana",
      "3:30": "Loja Bia",
    });
  });

  it("item que aparece em duas lojas fica sem loja", () => {
    const lojas = lojasPorChave([venda("Tha Beauty", 1), venda("Loja Ana", 1)]);
    expect(lojas.has("1:10")).toBe(false);
  });

  it("completa só produto da Nuvemshop sem loja, e produto inteiro pela variante", () => {
    const lojas = new Map([
      ["1:10", "Tha Beauty"],
      ["2:20", "Loja Ana"],
    ]);
    const semLoja = produto(1);
    const inteiro = produto(2, { varianteId: null });
    const jaTem = produto(1, { id: "outro", marca: "Tha Beauty" });
    const manual = produto(1, { id: "manual", origem: "manual" });
    const resultado = lojasParaCompletar([semLoja, inteiro, jaTem, manual], lojas);
    expect(resultado.map((r) => [r.produto.id, r.marca])).toEqual([
      ["p1", "Tha Beauty"],
      ["p2", "Loja Ana"],
    ]);
  });
});

describe("produtosParaCadastrar com várias lojas", () => {
  it("cada produto sai com a loja de onde veio e o influencer dela", () => {
    const novos = produtosParaCadastrar(
      [venda("Tha Beauty", 1), venda("Loja Ana", 2), venda("Loja Bia", 3)],
      [],
      [],
      [influencer("tha", "Tha Beauty"), influencer("ana", "Loja Ana")],
      [doCatalogo(2, "Loja Ana"), doCatalogo(3, "Loja Bia")],
    );
    const porChave = Object.fromEntries(novos.map((n) => [n.chave, [n.marca, n.influencerId]]));
    expect(porChave).toEqual({
      "1:10": ["Tha Beauty", "tha"],
      "2:20": ["Loja Ana", "ana"],
      "3:30": ["Loja Bia", null],
    });
  });
});
