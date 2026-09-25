/**
 * Memoria de calculo dos impostos e do DIFAL (secao 5.1.4).
 *
 * A pizza mostra um numero; esta tela mostra de onde ele saiu. Nao ha conta
 * nova aqui: tudo vem de `apurarImpostos` e `reconciliar`. Esta funcao so
 * organiza o que a apuracao ja fez e acrescenta o que a tela precisa para
 * explicar cada base -- quantos produtos marcaram o tributo, qual presuncao e
 * qual deducao entraram.
 *
 * Funcoes puras.
 */

import { pedidosTributaveis, reconciliar } from "@/lib/metrics";
import type { ApuracaoDeUmInfluencer, ResultadoImpostos } from "@/lib/impostos";
import type { Imposto, RegimeTributario } from "@/types/fiscal";
import type { Pedido } from "@/types/nuvemshop";
import type { Produto } from "@/types/produto";

/** Como a base de um tributo foi formada. */
export type OrigemDaBase =
  | {
      tipo: "produtos";
      /** Produtos da marca que marcaram o tributo. */
      produtosMarcados: number;
      /** Produtos da marca no cadastro. */
      produtosDaMarca: number;
      /** Receita real da marca, para comparar com a base. */
      baseDoImposto: number;
    }
  | {
      tipo: "lucro";
      baseDoImposto: number;
      /** Percentual de presuncao, ex.: 8 para 8%. */
      presuncao: number;
      /** Deducao mensal em reais (adicional de IRPJ). */
      deducao: number;
    }
  | {
      tipo: "das";
      rbt12: number;
      rbt12Projetado: boolean;
      /** `true` quando o RBT12 e o da empresa, somado das lojas do Simples. */
      rbt12Compartilhado: boolean;
      faixa: number;
      aliquotaNominal: number;
    };

export interface PassoDoImposto {
  sigla: string;
  nome: string;
  origem: OrigemDaBase;
  base: number;
  /** Percentual. */
  aliquota: number;
  valor: number;
  confirmado: boolean;
}

export interface MemoriaDaMarca {
  nome: string;
  marca: string;
  regime: RegimeTributario;
  semInfluencer: boolean;
  bruto: number;
  recebido: number;
  /** Cancelado e reembolsado: faturados, mas fora da base (5.1.1). */
  foraDaBase: number;
  /** Frete que esta dentro da base: o dos pedidos tributaveis. */
  frete: number;
  /** Base de todo tributo: o faturado sem cancelados e reembolsados, com frete (5.1.1). */
  baseDoImposto: number;
  passos: PassoDoImposto[];
  /** Tributos do regime fora da conta (inativos ou com aliquota zero). */
  foraDaConta: string[];
  /** Impostos da marca, SEM o DIFAL -- o numero da fatia "Impostos". */
  total: number;
  difal: ApuracaoDeUmInfluencer["difal"];
}

export interface MemoriaDosImpostos {
  marcas: MemoriaDaMarca[];
  /** Soma dos impostos sem DIFAL: a fatia "Impostos". */
  totalImpostos: number;
  /** A fatia "DIFAL". */
  totalDifal: number;
  receitaSemCadastro: number;
  produtosSemCadastro: number;
}

export function memoriaDosImpostos(
  resultado: ResultadoImpostos,
  pedidosDoMes: Pedido[],
  impostos: Imposto[],
  produtos: Produto[],
): MemoriaDosImpostos {
  const porId = new Map(impostos.map((i) => [i.id, i]));

  const marcas = resultado.porInfluencer.map((apuracao): MemoriaDaMarca => {
    const r = reconciliar(pedidosDoMes.filter((p) => p.marca === apuracao.marca));
    const tributavel = reconciliar(
      pedidosTributaveis(pedidosDoMes.filter((p) => p.marca === apuracao.marca)),
    );
    // Os produtos da marca: os do dono e, sem dono, os que vieram da loja.
    const daMarca = produtos.filter((p) =>
      apuracao.influencerId !== null
        ? p.influencerId === apuracao.influencerId
        : p.marca === apuracao.marca && p.influencerId === null,
    );

    const passos: PassoDoImposto[] = apuracao.linhas
      // O DIFAL tem fatia e secao proprias.
      .filter((l) => l.sigla !== "DIFAL")
      .map((linha) => {
        const cadastro = porId.get(linha.impostoId);
        let origem: OrigemDaBase;
        if (linha.sigla === "DAS" && apuracao.simples) {
          origem = {
            tipo: "das",
            rbt12: apuracao.simples.rbt12,
            rbt12Projetado: apuracao.rbt12.projetado,
            rbt12Compartilhado: apuracao.rbt12Compartilhado,
            faixa: apuracao.simples.faixa,
            aliquotaNominal: apuracao.simples.aliquotaNominal,
          };
        } else if (cadastro?.baseIncidencia === "lucro") {
          origem = {
            tipo: "lucro",
            baseDoImposto: apuracao.baseReceita,
            presuncao: cadastro.percentualPresuncao ?? 100,
            deducao: cadastro.deducaoMensal ?? 0,
          };
        } else {
          origem = {
            tipo: "produtos",
            produtosMarcados: daMarca.filter((p) => p.impostosIds.includes(linha.impostoId)).length,
            produtosDaMarca: daMarca.length,
            baseDoImposto: apuracao.baseReceita,
          };
        }
        return {
          sigla: linha.sigla,
          nome: linha.nome,
          origem,
          base: linha.base,
          aliquota: linha.aliquota,
          valor: linha.valor,
          confirmado: linha.confirmado,
        };
      });

    return {
      nome: apuracao.nome,
      marca: apuracao.marca,
      regime: apuracao.regime,
      semInfluencer: apuracao.influencerId === null,
      bruto: r.bruto,
      recebido: r.recebido,
      foraDaBase: r.cancelado + r.reembolsado,
      // O frete que esta dentro da base: o dos pedidos tributaveis.
      frete: tributavel.freteTotal,
      baseDoImposto: apuracao.baseReceita,
      passos,
      foraDaConta: apuracao.inativosDoRegime.map((i) => i.sigla),
      total: passos.reduce((s, p) => s + p.valor, 0),
      difal: apuracao.difal,
    };
  });

  return {
    marcas,
    totalImpostos: marcas.reduce((s, m) => s + m.total, 0),
    totalDifal: resultado.difal.total,
    receitaSemCadastro: resultado.receitaSemCadastro,
    produtosSemCadastro: resultado.produtosSemCadastro,
  };
}
