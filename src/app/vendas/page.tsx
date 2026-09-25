import { Cabecalho } from "@/components/Cabecalho";
import { Cartao } from "@/components/Cartao";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";
import { VendasPorDia } from "@/components/VendasPorDia";

import { obterFonteDePedidos } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { mesAnoLongo } from "@/lib/format";
import { diaDeHoje, mesesDisponiveis, vendasPorDia } from "@/lib/metrics";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { exigirArea } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * Aba Vendas (5.16.1): o grafico de vendas por dia e o quadro do dia embaixo
 * dele, que no mes atual abre nas vendas de hoje.
 *
 * Os dois moravam no topo da aba Influencers e ganharam aba propria em
 * 25/09/2026, a pedido do dono: acompanhar o dia e uma pergunta diferente de
 * "quanto cada influencer custa", e e a que ele faz mais vezes.
 *
 * Area `financeiro`: e faturamento, e a producao nao ve faturamento (5.13).
 */
export default async function PaginaVendas({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("financeiro");
  const { mes: mesPedido } = await searchParams;

  const todosOsPedidos = await obterFonteDePedidos().listarPedidos();
  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);

  // "Hoje" em Brasilia, e nao no relogio do servidor, que roda em UTC (5.16.1).
  const hoje = diaDeHoje();
  const noMesAtual = mesSelecionado === hoje.slice(0, 7);

  return (
    <div className="min-h-screen">
      <Cabecalho
        demonstracao={modoDemonstracao()}
        usuario={usuario}
        meses={meses}
        mesSelecionado={mesSelecionado}
      />

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-7 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">Vendas</h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            Quanto se vendeu em cada dia do mês e quanto disso já entrou, em todas as
            lojas. Referência: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <Cartao
          titulo={`Vendas por dia — ${mesAnoLongo(mesSelecionado)}`}
          descricao={
            noMesAtual
              ? "A operação inteira. Abaixo do gráfico, as vendas de hoje; toque ou clique numa coluna para ver outro dia."
              : "A operação inteira. Toque ou clique numa coluna para abrir as vendas do dia."
          }
        >
          {/* A chave pelo mes recomeca o quadro ao trocar de mes: em hoje, no
              mes atual; fechado, nos outros. */}
          <VendasPorDia
            key={mesSelecionado}
            vendas={vendasPorDia(todosOsPedidos, mesSelecionado)}
            hoje={noMesAtual ? hoje : null}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
