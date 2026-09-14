import { describe, expect, it } from "vitest";

import {
  METODO_NAO_INFORMADO,
  metodoDoPedido,
  normalizarMetodoPagamento,
} from "@/types/nuvemshop";
import { gerarBaseDemonstracao } from "@/data/geradorPedidos";
import { agruparPorMetodoPagamento, filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import { taxasPlataformaIniciais } from "@/data/seeds";
import { rotuloMetodo } from "@/lib/format";
import type { Pedido } from "@/types/nuvemshop";

describe("normalizarMetodoPagamento", () => {
  it("aceita o valor canonico sem mexer", () => {
    for (const m of ["credit_card", "boleto", "pix", "debit_card", "wire_transfer", "other"]) {
      expect(normalizarMetodoPagamento(m)).toBe(m);
    }
  });

  it("resolve caixa, espaco e separador", () => {
    expect(normalizarMetodoPagamento("CREDIT CARD")).toBe("credit_card");
    expect(normalizarMetodoPagamento("credit-card")).toBe("credit_card");
    expect(normalizarMetodoPagamento("Credit_Card")).toBe("credit_card");
    expect(normalizarMetodoPagamento(" Pix ")).toBe("pix");
    expect(normalizarMetodoPagamento("BOLETO")).toBe("boleto");
  });

  it("resolve apelidos conhecidos", () => {
    expect(normalizarMetodoPagamento("ticket")).toBe("boleto");
    expect(normalizarMetodoPagamento("bank_slip")).toBe("boleto");
    expect(normalizarMetodoPagamento("bank transfer")).toBe("wire_transfer");
    expect(normalizarMetodoPagamento("creditCard")).toBe("credit_card");
  });

  it("ausencia vira 'nao informado', nao 'other'", () => {
    // Sao coisas diferentes: uma e lacuna de dado, a outra e escolha de
    // pagamento. Juntar cobraria a taxa de "outros" sobre o desconhecido.
    expect(normalizarMetodoPagamento(null)).toBe(METODO_NAO_INFORMADO);
    expect(normalizarMetodoPagamento(undefined)).toBe(METODO_NAO_INFORMADO);
    expect(normalizarMetodoPagamento("   ")).toBe(METODO_NAO_INFORMADO);
    expect(METODO_NAO_INFORMADO).not.toBe("other");
  });

  it("valor desconhecido passa adiante com o proprio nome", () => {
    // NAO vira "other": dobrar cobraria a taxa de "outros" sobre um meio que
    // ninguem cadastrou. Passando adiante, ele aparece como lacuna na tela.
    expect(normalizarMetodoPagamento("nubank_pay")).toBe("nubank_pay");
    expect(normalizarMetodoPagamento("Mercado Pago")).toBe("mercado_pago");
  });

  it("o rotulo mostra o nome cru do que nao conhece", () => {
    // Escondido atras de "Outros", um metodo novo ficaria indistinguivel do
    // metodo `other`, que e uma escolha legitima.
    expect(rotuloMetodo("credit_card")).toBe("Cart\u00e3o de cr\u00e9dito");
    expect(rotuloMetodo("nubank_pay")).toBe("nubank_pay");
    expect(rotuloMetodo(null)).toBe("Nao informado");
    expect(rotuloMetodo(METODO_NAO_INFORMADO)).toBe("Nao informado");
  });

  it("nao quebra quando payment_details vem ausente", () => {
    // O cliente da API faz pass-through do JSON: se o campo nao vier, o painel
    // nao pode estourar.
    const semDetalhes = { payment_details: undefined } as unknown as Pedido;
    expect(metodoDoPedido(semDetalhes)).toBe(METODO_NAO_INFORMADO);
  });
});

describe("base de demonstracao", () => {
  const { pedidos } = gerarBaseDemonstracao();
  const doMes = filtrarPorMes(pedidos, mesesDisponiveis(pedidos)[0]!);

  it("varia a grafia do meio de pagamento de proposito", () => {
    // Sem variacao, a normalizacao so seria exercitada em teste unitario -- e
    // um defeito nela nao apareceria na tela.
    const cruas = new Set(doMes.map((p) => p.payment_details.method));
    expect(cruas.size).toBeGreaterThan(5);
  });

  it("todas as grafias colapsam em tres meios", () => {
    const grupos = agruparPorMetodoPagamento(doMes);
    expect(grupos.map((g) => g.metodo).sort()).toEqual(["boleto", "credit_card", "pix"]);
  });

  it("a tabela de taxas nao duplica meio por causa de grafia", () => {
    // A falha que este teste pega: "Credit Card" e "credit_card" virando duas
    // linhas, com duas taxas, e o total certo pelo motivo errado.
    const taxas = apurarTaxasPlataforma(doMes, taxasPlataformaIniciais());
    expect(taxas.porMetodo).toHaveLength(3);
    expect(taxas.metodosSemTaxa).toEqual([]);
  });
});
