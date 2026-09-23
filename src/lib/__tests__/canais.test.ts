import { afterEach, describe, expect, it, vi } from "vitest";

import { mascarar } from "@/types/canais";

/*
 * Leitura das credenciais de marketplace (seção 9, Fase 4).
 *
 * O que estes testes protegem é o que acontece quando alguém preenche os
 * blocos ERRADO — que é onde o tempo se perde. São seis campos por conta, em
 * três marketplaces que chamam cada um pelo seu nome, e um campo esquecido não
 * dá sinal nenhum até a busca falhar, dias depois.
 */

const ORIGINAL = { ...process.env };

/** Limpa os blocos e aplica o cenário do teste. */
async function comAmbiente(vars: Record<string, string>) {
  for (const chave of Object.keys(process.env)) {
    if (chave.startsWith("CANAL_")) delete process.env[chave];
  }
  Object.assign(process.env, vars);
  vi.resetModules();
  return import("@/lib/config");
}

afterEach(() => {
  for (const chave of Object.keys(process.env)) {
    if (chave.startsWith("CANAL_")) delete process.env[chave];
  }
  Object.assign(process.env, ORIGINAL);
});

const CONTA_COMPLETA = {
  CANAL_1_TIPO: "mercadolivre",
  CANAL_1_MARCA: "Tha Beauty",
  CANAL_1_LOJA_ID: "123456789",
  CANAL_1_CHAVE: "1234567890123456",
  CANAL_1_SEGREDO: "segredo-de-verdade",
};

describe("contasDeCanal", () => {
  it("sem nada configurado, devolve lista vazia", async () => {
    const { contasDeCanal } = await comAmbiente({});
    expect(contasDeCanal()).toEqual([]);
  });

  it("lê uma conta completa", async () => {
    const { contasDeCanal } = await comAmbiente(CONTA_COMPLETA);
    expect(contasDeCanal()).toEqual([
      {
        canal: "mercadolivre",
        marca: "Tha Beauty",
        lojaId: "123456789",
        chave: "1234567890123456",
        segredo: "segredo-de-verdade",
        tokenInicial: null,
        refreshInicial: null,
      },
    ]);
  });

  it("bloco intocado é ignorado, e não atrapalha os preenchidos", async () => {
    // O modelo traz três blocos prontos. Preencher só o primeiro precisa
    // funcionar, senão ninguém deixa o arquivo preparado.
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_2_TIPO: "",
      CANAL_2_MARCA: "Tha Beauty",
      CANAL_2_CHAVE: "COLE_A_CHAVE_AQUI",
      CANAL_2_SEGREDO: "COLE_A_CHAVE_AQUI",
    });
    expect(contasDeCanal()).toHaveLength(1);
  });

  it("bloco com tipo e sem chave ainda não está configurado", async () => {
    // Dá para escolher o canal e colar a chave depois, quando ela chegar.
    const { contasDeCanal } = await comAmbiente({
      CANAL_1_TIPO: "shopee",
      CANAL_1_MARCA: "Tha Beauty",
      CANAL_1_CHAVE: "COLE_A_CHAVE_AQUI",
    });
    expect(contasDeCanal()).toEqual([]);
  });

  it("tipo desconhecido é erro, e a mensagem diz quais valem", async () => {
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_1_TIPO: "shoppe",
    });
    expect(() => contasDeCanal()).toThrow(/shopee, tiktok, mercadolivre/);
  });

  it("aceita o tipo em qualquer caixa", async () => {
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_1_TIPO: "MercadoLivre",
    });
    expect(contasDeCanal()[0]!.canal).toBe("mercadolivre");
  });

  it("bloco em uso e sem marca é ERRO, e não uma conta que não busca", async () => {
    /*
     * A marca é o que liga o pedido ao contrato do influencer (armadilha 9).
     * Sem ela o faturamento do canal não entraria em comissão, imposto nem
     * lucro — e ninguém veria por quê.
     */
    const { contasDeCanal } = await comAmbiente({ ...CONTA_COMPLETA, CANAL_1_MARCA: "" });
    expect(() => contasDeCanal()).toThrow(/MARCA/);
  });

  it("falta de segredo é erro, com o nome que o marketplace usa", async () => {
    // Quem está com a tela da Shopee aberta procura "partner_key", não "SEGREDO".
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_1_TIPO: "shopee",
      CANAL_1_SEGREDO: "",
    });
    expect(() => contasDeCanal()).toThrow(/partner_key/);
  });

  it("falta de loja é erro, com o nome que o marketplace usa", async () => {
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_1_TIPO: "tiktok",
      CANAL_1_LOJA_ID: "",
    });
    expect(() => contasDeCanal()).toThrow(/shop_cipher/);
  });

  it("a mesma loja duas vezes no mesmo canal é erro", async () => {
    // As duas buscariam os mesmos pedidos e o faturamento sairia dobrado.
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_2_TIPO: "mercadolivre",
      CANAL_2_MARCA: "Tha Beauty",
      CANAL_2_LOJA_ID: "123456789",
      CANAL_2_CHAVE: "outra-chave",
      CANAL_2_SEGREDO: "outro-segredo",
    });
    expect(() => contasDeCanal()).toThrow(/duas vezes/);
  });

  it("o mesmo número de loja em canais diferentes é aceito", async () => {
    // Não há relação nenhuma entre um shop_id da Shopee e um seller_id do ML.
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_2_TIPO: "shopee",
      CANAL_2_MARCA: "Tha Beauty",
      CANAL_2_LOJA_ID: "123456789",
      CANAL_2_CHAVE: "outra-chave",
      CANAL_2_SEGREDO: "outro-segredo",
    });
    expect(contasDeCanal()).toHaveLength(2);
  });

  it("a mesma marca em canais diferentes é aceita", async () => {
    /*
     * Ao contrário da Nuvemshop, onde marca repetida é erro: lá cada loja é de
     * uma marca. Aqui a Tha Beauty vende nos três canais ao mesmo tempo, e é
     * esse o caso normal.
     */
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_2_TIPO: "tiktok",
      CANAL_2_MARCA: "Tha Beauty",
      CANAL_2_LOJA_ID: "999",
      CANAL_2_CHAVE: "chave-tiktok",
      CANAL_2_SEGREDO: "segredo-tiktok",
    });
    const contas = contasDeCanal();
    expect(contas).toHaveLength(2);
    expect(new Set(contas.map((c) => c.marca))).toEqual(new Set(["Tha Beauty"]));
  });

  it("token e refresh são opcionais, e o de exemplo não conta", async () => {
    const { contasDeCanal } = await comAmbiente({
      ...CONTA_COMPLETA,
      CANAL_1_TOKEN: "COLE_A_CHAVE_AQUI",
      CANAL_1_REFRESH: "refresh-de-verdade",
    });
    const conta = contasDeCanal()[0]!;
    expect(conta.tokenInicial).toBeNull();
    expect(conta.refreshInicial).toBe("refresh-de-verdade");
  });
});

describe("mascarar", () => {
  it("deixa os quatro últimos, que é o que se confere na tela do marketplace", () => {
    expect(mascarar("APP_USR_1234567890abcdef")).toBe("********cdef");
  });

  it("não vaza um segredo curto", () => {
    expect(mascarar("abcd")).toBe("****");
    expect(mascarar("ab")).toBe("****");
  });

  it("diz quando está vazio, em vez de imprimir nada", () => {
    expect(mascarar(null)).toBe("(vazio)");
    expect(mascarar("")).toBe("(vazio)");
  });
});
