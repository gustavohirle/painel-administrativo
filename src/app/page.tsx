import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { ComposicaoFaturamento } from "@/components/ComposicaoFaturamento";
import { CargaTributaria } from "@/components/CargaTributaria";
import { DemonstrativoResultado } from "@/components/DemonstrativoResultado";
import { EvolucaoMensal } from "@/components/EvolucaoMensal";
import { MeiosPagamento } from "@/components/MeiosPagamento";
import { SinaisAdicionais } from "@/components/SinaisAdicionais";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { periodoDoMes } from "@/data/source";
import { modoDemonstracao, PERCENTUAL_COMISSAO_PADRAO } from "@/lib/config";
import { montarDemonstrativo, ratearDespesas } from "@/lib/costing";
import { apurarImpostos } from "@/lib/impostos";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
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
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { exigirArea } from "@/lib/sessao";

/* Os numeros sao recalculados a cada carga: dado financeiro em cache mente. */
export const dynamic = "force-dynamic";

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("financeiro");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [
    todosOsPedidos,
    custos,
    influencers,
    impostosCadastrados,
    produtos,
    aliquotasEstaduais,
    taxasCadastradas,
    despesasInfluencer,
  ] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarCustos(),
    repositorio.listarInfluencers(),
    repositorio.listarImpostos(),
    repositorio.listarProdutos(),
    repositorio.listarAliquotasEstaduais(),
    repositorio.listarTaxasPlataforma(),
    repositorio.listarDespesasInfluencer(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);

  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);
  const carrinhos = await fonte.listarCarrinhosAbandonados(
    mesSelecionado ? periodoDoMes(mesSelecionado) : undefined,
  );

  const reconciliacao = reconciliar(pedidosDoMes);
  const marcas = agruparPorMarca(pedidosDoMes, PERCENTUAL_COMISSAO_PADRAO);
  const metodos = agruparPorMetodoPagamento(pedidosDoMes);
  const evolucao = evolucaoMensal(todosOsPedidos, 6);
  const sinais = calcularSinaisAdicionais(pedidosDoMes, carrinhos, todosOsPedidos);
  const impostos = apurarImpostos(
    pedidosDoMes,
    todosOsPedidos,
    produtos,
    impostosCadastrados,
    influencers,
    aliquotasEstaduais,
  );

  const taxas = apurarTaxasPlataforma(pedidosDoMes, taxasCadastradas);

  const dre = montarDemonstrativo(pedidosDoMes, custos, influencers, {
    produtos,
    impostos,
    taxasPlataforma: taxas,
    // Dividida com TODOS os pedidos: a proporcao e a do mes inteiro.
    despesasInfluencers: ratearDespesas(despesasInfluencer, todosOsPedidos, influencers),
  });

  const demo = modoDemonstracao();

  return (
    <div className="min-h-screen">
      <Cabecalho
        demonstracao={demo}
        usuario={usuario}
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
            {marcas.length} marcas. Do faturamento ao lucro, com impostos,
            custos de fabricação, comissões, despesas com influencers e a
            participação dos sócios já descontados.
          </p>
        </div>

        {/* Leitura de 10 segundos */}
        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-6 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Faturamento bruto"
            valor={moedaRedonda(reconciliacao.bruto)}
            apoio="Tudo que foi pedido no mês"
          />
          <NumeroDestaque
            rotulo="Recebido"
            valor={moedaRedonda(reconciliacao.recebido)}
            apoio={`${percentual(razaoSegura(reconciliacao.recebido, reconciliacao.bruto))} do faturado`}
          />
          <NumeroDestaque
            rotulo="Impostos sobre a venda"
            valor={moedaRedonda(dre.totalImpostos)}
            apoio={`${percentual(impostos.cargaSobreReceita)} da receita sem frete`}
            cor="var(--color-naopago)"
          />
          {/* Com prejuizo o rotulo muda e o numero fica vermelho e sem sinal:
              "Lucro operacional" verde com valor negativo se contradiz. */}
          <NumeroDestaque
            rotulo={dre.lucroOperacional < 0 ? "Prejuízo operacional" : "Lucro operacional"}
            valor={moedaRedonda(Math.abs(dre.lucroOperacional))}
            apoio={`${percentual(Math.abs(dre.margemOperacionalPercentual))} da receita real`}
            cor={dre.lucroOperacional < 0 ? "var(--color-naopago)" : "var(--color-real)"}
          />
        </div>

        <Cartao
          titulo="Para onde vai cada real faturado"
          descricao="O que nunca entrou, o frete, os impostos, o DIFAL, a taxa da Nuvemshop, o custo de fabricação, as comissões -- e o que sobra."
        >
          <ComposicaoFaturamento dre={dre} />
        </Cartao>

        {/* O simulador de base de comissao mudou para /simulador, aba
            "Comissao de influencer" (secao 5.17). */}

        <Cartao
          titulo="Raio-x do resultado"
          descricao="Do faturamento bruto até o lucro operacional, com impostos, custos de fabricação e contratos de comissão cadastrados."
        >
          <DemonstrativoResultado dre={dre} />
        </Cartao>

        <Cartao
          titulo="Carga tributária"
          descricao="Quanto do que entra vira imposto, e para onde vai."
        >
          <CargaTributaria resultado={impostos} />
        </Cartao>

        {/*
          Os dois em largura inteira, e nao lado a lado: em meia largura a
          tabela de pagamento ganhava barra de rolagem horizontal e os rotulos
          do grafico ficavam ilegiveis a distancia -- que e como esta tela vai
          ser lida.
        */}
        <Cartao
          titulo="Por onde o dinheiro escapa"
          descricao="Taxa de não pagamento de cada meio de pagamento."
        >
          <MeiosPagamento linhas={metodos} />
        </Cartao>

        <Cartao
          titulo="Evolução dos últimos 6 meses"
          descricao="A distância entre faturar e receber se repete mês a mês."
        >
          <EvolucaoMensal pontos={evolucao} />
        </Cartao>

        <Cartao
          titulo="Outros sinais do mês"
          descricao="Indicadores que abrem conversa para as proximas etapas do projeto."
        >
          <SinaisAdicionais sinais={sinais} />
        </Cartao>

        <RodapeDemonstracao demonstracao={demo} />
      </main>
    </div>
  );
}
