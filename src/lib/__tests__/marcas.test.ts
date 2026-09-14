import { describe, expect, it } from "vitest";

import { MARCAS } from "@/data/catalogo";
import { influencersIniciais } from "@/data/seeds";

/**
 * O nome da marca e CHAVE, nao so rotulo.
 *
 * `Pedido.marca` sai do catalogo e `Influencer.marca` sai do cadastro, e a
 * comissao, o regime tributario e o DIFAL casam os dois por igualdade de texto.
 * Quando o catalogo passou a escrever "Luma Cosmeticos" com acento e o
 * contrato continuou sem, a marca ficou sem contrato em silencio: 4 de 5
 * comissoes calculadas, lucro inflado, imposto no regime padrao. Nenhum teste
 * de conta pegou, porque cada conta, sozinha, estava certa.
 */
describe("marcas do catalogo e contratos semeados", () => {
  const nomesDoCatalogo = MARCAS.map((m) => m.nome);

  it("todo contrato semeado aponta para uma marca que existe no catalogo", () => {
    const orfaos = influencersIniciais()
      .map((i) => i.marca)
      .filter((marca) => !nomesDoCatalogo.includes(marca));

    expect(orfaos).toEqual([]);
  });

  it("toda marca do catalogo tem um contrato semeado", () => {
    const marcasComContrato = new Set(influencersIniciais().map((i) => i.marca));
    expect(nomesDoCatalogo.filter((m) => !marcasComContrato.has(m))).toEqual([]);
  });
});
