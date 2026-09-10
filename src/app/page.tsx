import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { CascataFaturamento } from "@/components/CascataFaturamento";
import { AreaComissao } from "@/components/AreaComissao";
import { DemonstrativoResultado } from "@/components/DemonstrativoResultado";
import { EvolucaoMensal } from "@/components/EvolucaoMensal";
import { MeiosPagamento } from "@/components/MeiosPagamento";
import { SinaisAdicionais } from "@/components/SinaisAdicionais";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { periodoDoMes } from "@/data/source";
import { modoDemonstracao, PERCENTUAL_COMISSAO_PADRAO } from "@/lib/config";
import { montarDemonstrativo } from "@/lib/costing";
import {
  inteiro,
  mesAnoLongo,
  moedaRedonda,
  percentual,
  razaoSegura,
} from "@/lib/format";
import {
  agruparPorMarca,
  agruparPorMetodoPagamento,
  calcularSinaisAdicionais,
  evolucaoMensal,
  filtrarPorMes,
  mesesDisponiveis,
  reconciliar,
} from "@/lib/metrics";

/* Os numeros sao recalculados a cada carga: dado financeiro em cache mente. */
export const dynamic = "force-dynamic";

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, custos, influencers] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarCustos(),
    repositorio.listarInfluencers(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado =
    mesPedido && meses.includes(mesPedido) ? mesPedido : (meses[0] ?? "");

  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);
  const carrinhos = await fonte.listarCarrinhosAbandonados(
    mesSelecionado ? periodoDoMes(mesSelecionado) : undefined,
  );

  const reconciliacao = reconciliar(pedidosDoMes);
  const marcas = agruparPorMarca(pedidosDoMes, PERCENTUAL_COMISSAO_PADRAO);
  const metodos = agruparPorMetodoPagamento(pedidosDoMes);
  const evolucao = evolucaoMensal(todosOsPedidos, 6);
  const sinais = calcularSinaisAdicionais(pedidosDoMes, carrinhos, todosOsPedidos);
  const dre = montarDemonstrativo(pedidosDoMes, custos, influencers);

  const demo = modoDemonstracao();

  return (
    <div className="min-h-screen">
      <Cabecalho
        demonstracao={demo}
        meses={meses}
        mesSelecionado={mesSelecionado}
      />

      <main className="mx-auto max-w-[1400px] space-y-6 px-6 py-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">
            Resultado de {mesAnoLongo(mesSelecionado)}
          </h1>
          <p className="mt-1 text-sm text-tinta-media">
            {inteiro(reconciliacao.quantidade.total)} pedidos criados em{" "}
            {marcas.length} marcas. Do faturamento ao lucro, com os custos de
            fabricacao e as comissoes ja descontados.
          </p>
        </div>

        {/* Leitura de 10 segundos */}
        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-6 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Faturamento bruto"
            valor={moedaRedonda(reconciliacao.bruto)}
            apoio="Tudo que foi pedido no mes"
          />
          <NumeroDestaque
            rotulo="Recebido"
            valor={moedaRedonda(reconciliacao.recebido)}
            apoio={`${percentual(razaoSegura(reconciliacao.recebido, reconciliacao.bruto))} do faturado`}
          />
          <NumeroDestaque
            rotulo="Receita real"
            valor={moedaRedonda(reconciliacao.receitaReal)}
            apoio="Recebido menos o frete"
            cor="var(--color-real)"
          />
          <NumeroDestaque
            rotulo="Lucro operacional"
            valor={moedaRedonda(dre.lucroOperacional)}
            apoio={`${percentual(dre.margemOperacionalPercentual)} da receita real`}
            cor="var(--color-real)"
          />
        </div>

        <Cartao
          titulo="Do faturamento ao dinheiro que sobra"
          descricao="Cada degrau mostra quanto do faturamento nao chega ao caixa e por que."
        >
          <CascataFaturamento reconciliacao={reconciliacao} />
        </Cartao>

        <Cartao
          titulo="Comissao de influencers: simulador de base"
          descricao="Compare a comissao calculada sobre o faturamento bruto com a mesma comissao calculada sobre a receita real. Ajuste o percentual para testar cenarios."
        >
          <AreaComissao
            reconciliacao={reconciliacao}
            marcas={marcas}
            percentualInicial={PERCENTUAL_COMISSAO_PADRAO}
          />
        </Cartao>

        <Cartao
          titulo="Raio-x do resultado"
          descricao="Do faturamento bruto ate o lucro operacional, usando os custos de fabricacao e os contratos de comissao cadastrados."
        >
          <DemonstrativoResultado dre={dre} />
        </Cartao>

        {/*
          Os dois em largura inteira, e nao lado a lado: em meia largura a
          tabela de pagamento ganhava barra de rolagem horizontal e os rotulos
          do grafico ficavam ilegiveis a distancia -- que e como esta tela vai
          ser lida.
        */}
        <Cartao
          titulo="Por onde o dinheiro escapa"
          descricao="Taxa de nao pagamento de cada meio de pagamento."
        >
          <MeiosPagamento linhas={metodos} />
        </Cartao>

        <Cartao
          titulo="Evolucao dos ultimos 6 meses"
          descricao="A distancia entre faturar e receber se repete mes a mes."
        >
          <EvolucaoMensal pontos={evolucao} />
        </Cartao>

        <Cartao
          titulo="Outros sinais do mes"
          descricao="Indicadores que abrem conversa para as proximas etapas do projeto."
        >
          <SinaisAdicionais sinais={sinais} />
        </Cartao>

        <RodapeDemonstracao demonstracao={demo} />
      </main>
    </div>
  );
}
