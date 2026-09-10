import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { GestaoCustos, type ItemCusteavel } from "@/components/GestaoCustos";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { calcularCMV, catalogoVendido } from "@/lib/costing";
import {
  inteiro,
  mesAnoLongo,
  moeda,
  moedaRedonda,
  percentual,
  razaoSegura,
} from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis, reconciliar } from "@/lib/metrics";
import { exigirArea } from "@/lib/sessao";
import { podeAcessar } from "@/types/usuario";

export const dynamic = "force-dynamic";

export default async function PaginaCustos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("custos");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, custos, produtos] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarCustos(),
    repositorio.listarProdutos(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado =
    mesPedido && meses.includes(mesPedido) ? mesPedido : (meses[0] ?? "");
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  const vendidos = catalogoVendido(pedidosDoMes, custos, produtos);
  const cmv = calcularCMV(pedidosDoMes, custos, produtos);
  const reconciliacao = reconciliar(pedidosDoMes);

  // A tela trabalha no nivel da variante: e ali que o custo realmente muda.
  const itens: ItemCusteavel[] = vendidos.flatMap((produto) =>
    produto.variantes.map((variante) => ({
      produtoId: produto.produtoId,
      varianteId: variante.varianteId,
      nome: variante.nome,
      sku: variante.sku,
      unidadesVendidas: variante.unidadesVendidas,
      precoMedio: variante.precoMedio,
      receita: variante.precoMedio * variante.unidadesVendidas,
      custoUnitario: variante.custoUnitario,
    })),
  );

  const margemBruta = reconciliacao.receitaReal - cmv.cmv;
  const podeVerFinanceiro = podeAcessar(usuario.perfil, "financeiro");

  return (
    <div className="min-h-screen">
      <Cabecalho
        demonstracao={modoDemonstracao()}
        usuario={usuario}
        meses={meses}
        mesSelecionado={mesSelecionado}
      />

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">
            Custos de fabricacao
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            A Nuvemshop sabe por quanto cada produto foi vendido, mas nao sabe
            quanto ele custa para fabricar. Informe o custo por unidade aqui e o
            painel passa a calcular a margem e o lucro de verdade. Referencia:{" "}
            {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        {/*
          Os tres indicadores de dinheiro so aparecem para quem tem acesso ao
          financeiro. Quem cuida da fabrica cadastra o custo -- nao precisa ver
          margem nem receita para isso.
        */}
        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-6 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Itens cadastrados"
            valor={`${itens.filter((i) => i.custoUnitario !== null).length} de ${itens.length}`}
            apoio={
              podeVerFinanceiro
                ? `${percentual(cmv.cobertura)} da receita coberta`
                : `${itens.filter((i) => i.custoUnitario === null).length} ainda sem custo`
            }
          />

          {podeVerFinanceiro ? (
            <>
              <NumeroDestaque
                rotulo="Custo de fabricacao no mes"
                valor={moedaRedonda(cmv.cmv)}
                apoio="Somente dos pedidos efetivamente pagos"
              />
              <NumeroDestaque
                rotulo="Margem de contribuicao"
                valor={moedaRedonda(margemBruta)}
                apoio={`${percentual(razaoSegura(margemBruta, reconciliacao.receitaReal))} da receita real`}
                cor="var(--color-real)"
              />
              <NumeroDestaque
                rotulo="Receita sem custo informado"
                valor={moeda(cmv.receitaSemCusto)}
                apoio="Fica de fora do calculo de lucro"
                cor={
                  cmv.receitaSemCusto > 0
                    ? "var(--color-naopago)"
                    : "var(--color-tinta)"
                }
              />
            </>
          ) : (
            <>
              <NumeroDestaque
                rotulo="Itens vendidos no mes"
                valor={inteiro(itens.reduce((s, i) => s + i.unidadesVendidas, 0))}
                apoio="Unidades que sairam, somando o que foi dentro de kit"
              />
              <NumeroDestaque
                rotulo="Produtos diferentes"
                valor={inteiro(itens.length)}
                apoio="Cada tamanho conta como um item, porque o custo muda"
              />
            </>
          )}
        </div>

        <Cartao
          titulo="Produtos vendidos no mes"
          descricao="Ordenados por receita: cadastrar os primeiros da lista e o que mais muda o resultado."
        >
          <GestaoCustos
            itens={itens}
            custos={custos}
            podeVerFinanceiro={podeVerFinanceiro}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
