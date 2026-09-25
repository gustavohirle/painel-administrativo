import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { ComposicaoFaturamento } from "@/components/ComposicaoFaturamento";
import { CargaTributaria } from "@/components/CargaTributaria";
import { DemonstrativoResultado } from "@/components/DemonstrativoResultado";
import { EvolucaoMensal } from "@/components/EvolucaoMensal";
import { MeiosPagamento } from "@/components/MeiosPagamento";
import { SinaisAdicionais } from "@/components/SinaisAdicionais";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";
import { SeletorLoja } from "@/components/SeletorLoja";
import {
  BotaoResultado,
  Oculto,
  ProvedorResultado,
  VALOR_OCULTO,
} from "@/components/ResultadoOculto";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { periodoDoMes } from "@/data/source";
import { modoDemonstracao, PERCENTUAL_COMISSAO_PADRAO } from "@/lib/config";
import { montarDemonstrativo, ratearDespesas } from "@/lib/costing";
import { fecharMes } from "@/lib/fechamento";
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
  evolucaoPorMarca,
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
  searchParams: Promise<{ mes?: string; loja?: string }>;
}) {
  const usuario = await exigirArea("financeiro");
  const { mes: mesPedido, loja: lojaPedida } = await searchParams;

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
    fechamentos,
  ] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarCustos(),
    repositorio.listarInfluencers(),
    repositorio.listarImpostos(),
    repositorio.listarProdutos(),
    repositorio.listarAliquotasEstaduais(),
    repositorio.listarTaxasPlataforma(),
    repositorio.listarDespesasInfluencer(),
    repositorio.listarFechamentos(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);

  const doMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  /*
   * Filtro de loja (5.1): a tela INTEIRA passa a ser daquela marca, e nao so a
   * pizza. Uma pizza de um canal ao lado do raio-x de todos mostraria dois
   * lucros diferentes na mesma tela. Marca que nao vendeu no mes nao vira
   * botao, e um ?loja= que nao existe e ignorado em silencio -- e link
   * velho, nao erro de quem esta olhando.
   */
  const lojas = [...new Set(doMes.map((p) => p.marca))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const lojaSelecionada = lojaPedida && lojas.includes(lojaPedida) ? lojaPedida : null;
  const daLoja = <T extends { marca: string }>(lista: T[]) =>
    lojaSelecionada ? lista.filter((item) => item.marca === lojaSelecionada) : lista;

  const pedidosDoMes = daLoja(doMes);
  const historico = daLoja(todosOsPedidos);
  const carrinhos = daLoja(
    await fonte.listarCarrinhosAbandonados(
      mesSelecionado ? periodoDoMes(mesSelecionado) : undefined,
    ),
  );

  const reconciliacao = reconciliar(pedidosDoMes);
  const marcas = agruparPorMarca(pedidosDoMes, PERCENTUAL_COMISSAO_PADRAO);
  const metodos = agruparPorMetodoPagamento(pedidosDoMes);
  /*
   * Doze meses, uma linha por influencer. O rotulo e o nome do influencer da
   * marca -- e a marca, quando ela nao tem contrato ativo, para a linha nao
   * ficar sem nome na legenda.
   */
  const evolucao = evolucaoPorMarca(historico, 12);
  const nomeDaMarca = new Map(
    influencers.filter((i) => i.ativo).map((i) => [i.marca, i.nome] as const),
  );
  const sinais = calcularSinaisAdicionais(pedidosDoMes, carrinhos, historico);
  const impostos = apurarImpostos(
    pedidosDoMes,
    historico,
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

  // Valores do fechamento do mes (5.1.3): so a leitura desta tela muda.
  const fechado = fecharMes(dre, fechamentos.find((f) => f.mes === mesSelecionado) ?? null);

  const demo = modoDemonstracao();

  return (
    <div className="min-h-screen">
      <Cabecalho
        demonstracao={demo}
        usuario={usuario}
        meses={meses}
        mesSelecionado={mesSelecionado}
      />

      {/* Resultado operacional oculto ate alguem pedir (5.1.5). */}
      <ProvedorResultado>
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
            valor={moedaRedonda(fechado.totalImpostos)}
            apoio={
              fechado.informado.impostos !== null || fechado.informado.difal !== null
                ? `Informado no fechamento · calculado ${moedaRedonda(dre.totalImpostos)}`
                : `${percentual(impostos.cargaSobreReceita)} do faturado, com o frete`
            }
            cor="var(--color-naopago)"
          />
          {/* Com prejuizo o rotulo muda e o numero fica vermelho e sem sinal:
              "Lucro operacional" verde com valor negativo se contradiz. */}
          {/* Oculto ate alguem pedir: sem valor, sem cor e sem dizer se e
              lucro ou prejuizo (5.1.5). */}
          <div>
            <Oculto
              mascara={
                <NumeroDestaque
                  rotulo="Resultado operacional"
                  valor={VALOR_OCULTO}
                  apoio="Oculto"
                  cor="var(--color-tinta-media)"
                />
              }
            >
              <NumeroDestaque
                rotulo={fechado.lucroOperacional < 0 ? "Prejuízo operacional" : "Lucro operacional"}
                valor={moedaRedonda(Math.abs(fechado.lucroOperacional))}
                apoio={`${percentual(Math.abs(fechado.margemOperacionalPercentual))} da receita real${
                  fechado.temInformado ? ", com o fechamento do mês" : ""
                }`}
                cor={fechado.lucroOperacional < 0 ? "var(--color-naopago)" : "var(--color-real)"}
              />
            </Oculto>
            <BotaoResultado className="mt-2" />
          </div>
        </div>

        <Cartao
          acao={<SeletorLoja lojas={lojas} selecionada={lojaSelecionada} />}
          titulo="Para onde vai cada real faturado"
          descricao="O que nunca entrou, o frete, os impostos, o DIFAL, a taxa da Nuvemshop, o custo de fabricação, as comissões -- e o que sobra."
        >
          <ComposicaoFaturamento dre={dre} fechado={fechado} mes={mesSelecionado} />
        </Cartao>

        {/* O simulador de base de comissao mudou para /simulador, aba
            "Comissao de influencer" (secao 5.17). */}

        <Cartao
          titulo="Raio-x do resultado"
          descricao="Do faturamento bruto até o lucro operacional, com impostos, custos de fabricação e contratos de comissão cadastrados."
        >
          <DemonstrativoResultado dre={dre} fechado={fechado} />
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
          titulo="Evolução dos últimos 12 meses"
          descricao="Faturamento bruto de cada influencer, mês a mês, e o total da operação."
        >
          <EvolucaoMensal
            meses={evolucao.meses}
            linhas={evolucao.series.map((s) => ({
              nome: nomeDaMarca.get(s.marca) ?? s.marca,
              valores: s.valores,
            }))}
            total={evolucao.total}
          />
        </Cartao>

        <Cartao
          titulo="Outros sinais do mês"
          descricao="Indicadores que abrem conversa para as proximas etapas do projeto."
        >
          <SinaisAdicionais sinais={sinais} />
        </Cartao>

        <RodapeDemonstracao demonstracao={demo} />
      </main>
      </ProvedorResultado>
    </div>
  );
}
