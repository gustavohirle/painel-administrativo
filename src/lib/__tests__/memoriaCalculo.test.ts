import { describe, expect, it } from "vitest";

import { baseDemonstracao } from "@/data/geradorPedidos";
import {
  aliquotasEstaduaisIniciais,
  custosIniciais,
  impostosIniciais,
  influencersIniciais,
  produtosIniciais,
} from "@/data/seeds";
import { montarDemonstrativo } from "@/lib/costing";
import { fecharMes } from "@/lib/fechamento";
import { apurarImpostos } from "@/lib/impostos";
import { memoriaDosImpostos } from "@/lib/memoriaCalculo";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";

describe("memoriaDosImpostos", () => {
  const { pedidos } = baseDemonstracao();
  const influencers = influencersIniciais();
  const impostos = impostosIniciais();
  const produtos = produtosIniciais(impostos, influencers);
  const aliquotas = aliquotasEstaduaisIniciais();
  const mes = mesesDisponiveis(pedidos).at(-1)!;
  const doMes = filtrarPorMes(pedidos, mes);
  const resultado = apurarImpostos(doMes, pedidos, produtos, impostos, influencers, aliquotas);
  const memoria = memoriaDosImpostos(resultado, doMes, impostos, produtos);

  it("soma exatamente as fatias Impostos e DIFAL da pizza", () => {
    const dre = montarDemonstrativo(doMes, custosIniciais(), influencers, { produtos, impostos: resultado });
    const { calculado } = fecharMes(dre, null);
    expect(memoria.totalImpostos).toBeCloseTo(calculado.impostos, 6);
    expect(memoria.totalDifal).toBeCloseTo(calculado.difal, 6);
    expect(memoria.totalImpostos + memoria.totalDifal).toBeCloseTo(resultado.totalSobreVenda, 6);
  });

  it("cada passo é base × alíquota, e o DIFAL fica fora dos impostos", () => {
    const passos = memoria.marcas.flatMap((m) => m.passos);
    expect(passos.length).toBeGreaterThan(0);
    for (const p of passos) {
      expect(p.sigla).not.toBe("DIFAL");
      expect(p.valor).toBeCloseTo((p.base * p.aliquota) / 100, 6);
    }
  });

  it("o DIFAL de cada estado é base DUPLA × diferença", () => {
    for (const marca of memoria.marcas) {
      for (const linha of marca.difal.porEstado) {
        // Base dupla: o ICMS entra na propria base (5.10.1).
        const esperado =
          marca.regime === "simples_nacional" ? 0 : (linha.baseDupla * linha.diferenca) / 100;
        expect(linha.difal).toBeCloseTo(esperado, 6);
      }
    }
  });

  it("explica cada base pela origem certa", () => {
    const presumido = memoria.marcas.find((m) => m.regime === "lucro_presumido")!;
    const irpj = presumido.passos.find((p) => p.sigla === "IRPJ");
    expect(irpj?.origem.tipo).toBe("lucro");
    if (irpj?.origem.tipo === "lucro") {
      const esperado = (irpj.origem.baseDoImposto * irpj.origem.presuncao) / 100 - irpj.origem.deducao;
      expect(irpj.base).toBeCloseTo(Math.max(0, esperado), 6);
    }
    const porProduto = presumido.passos.find((p) => p.origem.tipo === "produtos");
    if (porProduto?.origem.tipo === "produtos") {
      expect(porProduto.origem.produtosMarcados).toBeGreaterThan(0);
      expect(porProduto.origem.produtosMarcados).toBeLessThanOrEqual(porProduto.origem.produtosDaMarca);
    }
    const simples = memoria.marcas.find((m) => m.regime === "simples_nacional");
    if (simples) expect(simples.passos[0]?.origem.tipo).toBe("das");
  });
});
