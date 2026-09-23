import { describe, expect, it } from "vitest";

import { CATEGORIAS_DESPESA, categoriaPelaDescricao } from "@/types/dominio";

/*
 * A classificacao pelo nome (secao 5.16). E a regra que converteu os 88
 * lancamentos ja gravados na producao, e continua valendo na leitura para
 * qualquer linha que escape da conversao -- por isso tem teste.
 */
describe("categoriaPelaDescricao", () => {
  it("so existem duas categorias", () => {
    expect(CATEGORIAS_DESPESA).toEqual(["marketing", "outros"]);
  });

  it.each([
    "Marketing",
    "Marketing e Publicidade",
    "Tha Beauty - Marketing",
    "DUALE-Marketing",
    "Ka Beauty - Marketing",
    "Softwares de CRM Automação de Marketing",
    // A caixa nao importa: o lancamento vem digitado a mao.
    "MARKETING DIGITAL",
    "marketing",
  ])("'%s' e marketing", (descricao) => {
    expect(categoriaPelaDescricao(descricao)).toBe("marketing");
  });

  it.each([
    "Folha de pagamento",
    "Operacional",
    "Tarifas Bancárias",
    "Despesas de viagens",
    "Prolabore",
    "Sem categoria",
    "",
  ])("'%s' e outros", (descricao) => {
    expect(categoriaPelaDescricao(descricao)).toBe("outros");
  });

  it("nao confunde palavra parecida com a palavra inteira", () => {
    // "market" sozinho nao e marketing; a regra e conter a palavra.
    expect(categoriaPelaDescricao("Market Place")).toBe("outros");
  });
});
