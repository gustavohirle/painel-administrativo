import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { GestaoComissoes } from "@/components/GestaoComissoes";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { calcularComissoesPorInfluencer, totalComissoes } from "@/lib/costing";
import { mesAnoLongo, moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis, reconciliar } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function PaginaComissoes({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, influencers] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarInfluencers(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado =
    mesPedido && meses.includes(mesPedido) ? mesPedido : (meses[0] ?? "");
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  const reconciliacao = reconciliar(pedidosDoMes);
  const calculadas = calcularComissoesPorInfluencer(pedidosDoMes, influencers);
  const total = totalComissoes(calculadas);

  // Quanto seria pago se TODOS os contratos usassem o faturamento bruto.
  const totalSeTudoSobreBruto = calculadas.reduce(
    (soma, c) => soma + c.comissaoSeSobreBruto,
    0,
  );

  const marcas = [...new Set(todosOsPedidos.map((p) => p.marca))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return (
    <div className="min-h-screen">
      <Cabecalho
        demonstracao={modoDemonstracao()}
        meses={meses}
        mesSelecionado={mesSelecionado}
      />

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">
            Comissoes de influencers
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            Cada contrato define um percentual e sobre qual base ele incide. A
            comissao calculada aqui entra como custo no raio-x do resultado.
            Referencia: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-6 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Contratos ativos"
            valor={String(calculadas.length)}
            apoio={`${influencers.length} cadastrado(s) no total`}
          />
          <NumeroDestaque
            rotulo="Comissao devida no mes"
            valor={moedaRedonda(total)}
            apoio="Pelas bases cadastradas em cada contrato"
          />
          <NumeroDestaque
            rotulo="Se tudo fosse sobre o bruto"
            valor={moedaRedonda(totalSeTudoSobreBruto)}
            apoio="Mesmo percentual, base diferente"
          />
          <NumeroDestaque
            rotulo="Comissao sobre a receita real"
            valor={percentual(razaoSegura(total, reconciliacao.receitaReal))}
            apoio={`Receita real do mes: ${moeda(reconciliacao.receitaReal)}`}
            cor="var(--color-real)"
          />
        </div>

        <Cartao
          titulo="Contratos cadastrados"
          descricao="O valor da comissao e recalculado com os pedidos do mes selecionado."
        >
          <GestaoComissoes
            influencers={influencers}
            calculadas={calculadas}
            marcas={marcas}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
