import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { ContratoDoInfluencer, GestaoComissoes } from "@/components/GestaoComissoes";
import { GestaoDespesasInfluencer } from "@/components/GestaoDespesasInfluencer";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";
import { SeletorInfluencer, type CartaoDeInfluencer } from "@/components/SeletorInfluencer";
import { VendasDeHoje } from "@/components/VendasDeHoje";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { lojasNuvemshop, modoDemonstracao } from "@/lib/config";
import {
  calcularComissoesPorInfluencer,
  despesasQueCabem,
  ratearDespesas,
  totalComissoes,
} from "@/lib/costing";
import { mesAnoLongo, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import {
  diaDeHoje,
  filtrarPorDia,
  filtrarPorMes,
  mesesDisponiveis,
  reconciliar,
} from "@/lib/metrics";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { exigirArea } from "@/lib/sessao";
import { idDeOrigem, mesDaDespesa, ROTULO_BASE } from "@/types/dominio";

export const dynamic = "force-dynamic";

/**
 * Dia sugerido para despesa nova: hoje, se hoje cai no mes aberto; senao o dia
 * primeiro do mes aberto. Calculado aqui, no servidor, e passado pronto -- no
 * navegador o "hoje" poderia cair em outro dia por causa do fuso e a
 * hidratacao reclamaria.
 *
 * O "hoje" vem de `diaDeHoje`, em Brasilia: o servidor de producao roda em
 * UTC, e com o relogio dele a despesa cadastrada as 21h ja nasceria com a data
 * de amanha.
 */
function dataPadraoDoMes(mes: string, hojeTexto: string): string {
  if (!mes || hojeTexto.startsWith(mes)) return hojeTexto;
  return `${mes}-01`;
}

/**
 * Aba Influencers (antes "Comissoes").
 *
 * Abre num seletor: um cartao por contrato, com o custo do mes ja escrito, e a
 * visao geral com os totais e o cadastro de contratos. Escolhido um
 * influencer, aparece a grade dele no mes -- comissao calculada na primeira
 * linha, despesas cadastradas embaixo. Ver secao 5.16.
 */
export default async function PaginaInfluencers({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; influencer?: string }>;
}) {
  const usuario = await exigirArea("financeiro");
  const { mes: mesPedido, influencer: influencerPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, influencers, despesasCadastradas, taxasCadastradas] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarInfluencers(),
    repositorio.listarDespesasInfluencer(),
    repositorio.listarTaxasPlataforma(),
  ]);

  // Cada compartilhada vira a parte de cada influencer, pelo faturamento sem frete
  // do mes inteiro. Daqui para baixo toda despesa tem dono.
  const despesas = ratearDespesas(despesasCadastradas, todosOsPedidos, influencers);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  // Hoje NAO segue o mes do cabecalho: o quadro de vendas do dia vale mesmo
  // com julho aberto na tela.
  const hoje = diaDeHoje();
  const pedidosDeHoje = filtrarPorDia(todosOsPedidos, hoje);

  const reconciliacao = reconciliar(pedidosDoMes);
  // A base "o que cai na conta" desconta a mesma taxa que a DRE desconta.
  const taxas = apurarTaxasPlataforma(pedidosDoMes, taxasCadastradas);
  const calculadas = calcularComissoesPorInfluencer(pedidosDoMes, influencers, taxas.porMarca);
  const comissaoPorId = new Map(calculadas.map((c) => [c.influencerId, c]));
  const total = totalComissoes(calculadas);
  const totalSeTudoSobreBruto = calculadas.reduce((soma, c) => soma + c.comissaoSeSobreBruto, 0);

  /*
   * Despesas do mes pela MESMA regra da DRE, e nao por um filtro desta pagina:
   * o total desta aba tem que ser exatamente o que sai do lucro na tela inicial.
   */
  const despesasDoMes = despesasQueCabem(despesas, pedidosDoMes, influencers);
  const totalDespesas = despesasDoMes.reduce((soma, d) => soma + d.valor, 0);
  const despesasPorInfluencer = new Map<string, number>();
  for (const despesa of despesasDoMes) {
    despesasPorInfluencer.set(
      despesa.influencerId,
      (despesasPorInfluencer.get(despesa.influencerId) ?? 0) + despesa.valor,
    );
  }

  const contratoEmTexto = (i: (typeof influencers)[number]) =>
    `${i.percentual.toLocaleString("pt-BR")}% sobre ${ROTULO_BASE[i.baseComissao].toLowerCase()}`;

  // Ativos primeiro, do mais caro para o mais barato: e a ordem em que a
  // conversa sobre custo acontece.
  const cartoes: CartaoDeInfluencer[] = influencers
    .map((i) => ({
      id: i.id,
      nome: i.nome,
      marca: i.marca,
      ativo: i.ativo,
      contrato: contratoEmTexto(i),
      custoNoMes:
        (comissaoPorId.get(i.id)?.valorComissao ?? 0) + (despesasPorInfluencer.get(i.id) ?? 0),
    }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.custoNoMes - a.custoNoMes);

  const selecionado = influencerPedido
    ? (influencers.find((i) => i.id === influencerPedido) ?? null)
    : null;

  // A lista de marcas do contrato: as lojas configuradas (uma por influencer,
  // mesmo a que ainda nao vendeu ou nao terminou a primeira busca), as que
  // aparecem nos pedidos e as que ja estao em contrato, para editar um
  // contrato nao trocar a marca dele em silencio.
  const marcas = [
    ...new Set([
      ...(modoDemonstracao() ? [] : lojasNuvemshop().map((l) => l.marca)),
      ...todosOsPedidos.map((p) => p.marca),
      ...influencers.map((i) => i.marca),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));

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
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">
            Influencers
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            Tudo o que cada influencer custou no mês: a comissão calculada pelo
            contrato e as despesas — as dele e a parte dele nas compartilhadas,
            como o operacional, dividida pelo faturamento sem frete de cada marca.
            Tudo isso sai do lucro operacional do painel.
            Referência: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <VendasDeHoje
          pedidos={
            selecionado
              ? pedidosDeHoje.filter((p) => p.marca === selecionado.marca)
              : pedidosDeHoje
          }
          dia={hoje}
          marca={selecionado?.marca ?? null}
          porMarca={!selecionado}
        />

        <Cartao
          titulo="Escolha o influencer"
          descricao="Toque num contrato para ver o contrato (e editá-lo) e a grade de custos dele no mês."
        >
          <SeletorInfluencer
            influencers={cartoes}
            selecionadoId={selecionado?.id ?? null}
            mes={mesSelecionado}
          />
        </Cartao>

        {influencerPedido && !selecionado && (
          <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm text-naopago">
            Esse influencer não existe mais no cadastro. Escolha outro acima.
          </p>
        )}

        {selecionado ? (
          (() => {
            const comissao = comissaoPorId.get(selecionado.id) ?? null;
            const pedidosDaMarca = pedidosDoMes.filter((p) => p.marca === selecionado.marca);
            const marcaVendeu = pedidosDaMarca.length > 0;
            const receitaRealDaMarca = reconciliar(pedidosDaMarca).receitaReal;

            // A grade mostra o que foi cadastrado no mes, pela data.
            const despesasDele = despesas.filter(
              (d) => d.influencerId === selecionado.id && mesDaDespesa(d) === mesSelecionado,
            );
            const totalDespesasDele = despesasDele.reduce((soma, d) => soma + d.valor, 0);
            const custoTotal = (comissao?.valorComissao ?? 0) + totalDespesasDele;

            const motivoSemComissao = !selecionado.ativo
              ? "Contrato inativo: não gera comissão."
              : "A marca não teve pedidos neste mês.";

            return (
              <>
                {/* Alvo da ancora dos cartoes; scroll-mt deixa o cabecalho
                    grudado no topo sem cobrir o primeiro numero. */}
                <div
                  id="custos"
                  className="grid scroll-mt-32 gap-4 rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-3 sm:px-6"
                >
                  <NumeroDestaque
                    rotulo="Comissão do mês"
                    valor={comissao ? moedaRedonda(comissao.valorComissao) : "—"}
                    apoio={comissao ? contratoEmTexto(selecionado) : motivoSemComissao}
                  />
                  <NumeroDestaque
                    rotulo="Despesas do mês"
                    valor={moedaRedonda(totalDespesasDele)}
                    apoio={`${despesasDele.length} despesa(s) no mês, com a parte das compartilhadas`}
                  />
                  <NumeroDestaque
                    rotulo="Custo total do influencer"
                    valor={moedaRedonda(custoTotal)}
                    apoio={
                      receitaRealDaMarca > 0
                        ? `${percentual(razaoSegura(custoTotal, receitaRealDaMarca))} da receita real da marca`
                        : "Sem receita real da marca no mês"
                    }
                    cor="var(--color-comissao)"
                  />
                </div>

                {!marcaVendeu && despesasDele.length > 0 && (
                  <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm text-naopago">
                    A {selecionado.marca} não teve pedidos em {mesAnoLongo(mesSelecionado)}.
                    Estas despesas estão cadastradas, mas não entram no lucro deste
                    mês — o raio-x do resultado só existe onde houve venda.
                  </p>
                )}

                <Cartao
                  titulo={`Contrato de ${selecionado.nome}`}
                  descricao="Percentual, base da comissão e regime tributário. O regime decide os impostos dos produtos da loja dele."
                >
                  {/* A chave recria o formulario ao trocar de influencer: sem
                      ela, os campos (defaultValue) continuavam com os valores
                      do anterior e o salvar gravava a marca dele no outro. */}
                  <ContratoDoInfluencer key={selecionado.id} influencer={selecionado} marcas={marcas} />
                </Cartao>

                <Cartao
                  titulo={`Custos de ${selecionado.nome} em ${mesAnoLongo(mesSelecionado)}`}
                  descricao={`${selecionado.marca} · contrato de ${contratoEmTexto(selecionado)}`}
                >
                  <GestaoDespesasInfluencer
                    influencerId={selecionado.id}
                    nomeInfluencer={selecionado.nome}
                    mes={mesSelecionado}
                    comissao={
                      comissao
                        ? {
                            valor: comissao.valorComissao,
                            valorBase: comissao.valorBase,
                            percentual: comissao.percentual,
                            rotuloBase: ROTULO_BASE[comissao.baseComissao],
                          }
                        : null
                    }
                    motivoSemComissao={motivoSemComissao}
                    despesas={despesasDele}
                    dataPadrao={dataPadraoDoMes(mesSelecionado, hoje)}
                  />
                </Cartao>
              </>
            );
          })()
        ) : (
          <>
            <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
              <NumeroDestaque
                rotulo="Contratos ativos"
                valor={String(calculadas.length)}
                apoio={`${influencers.length} cadastrado(s) no total`}
              />
              <NumeroDestaque
                rotulo="Comissão devida no mês"
                valor={moedaRedonda(total)}
                apoio={`Se tudo fosse sobre o bruto: ${moedaRedonda(totalSeTudoSobreBruto)}`}
              />
              <NumeroDestaque
                rotulo="Despesas cadastradas no mês"
                valor={moedaRedonda(totalDespesas)}
                apoio={`${new Set(despesasDoMes.map(idDeOrigem)).size} despesa(s), divididas entre ${despesasPorInfluencer.size} influencer(s)`}
              />
              <NumeroDestaque
                rotulo="Custo total com influencers"
                valor={moedaRedonda(total + totalDespesas)}
                apoio={`${percentual(razaoSegura(total + totalDespesas, reconciliacao.receitaReal))} da receita real`}
                cor="var(--color-comissao)"
              />
            </div>

            <Cartao
              titulo="Contratos cadastrados"
              descricao="O valor da comissão é recalculado com os pedidos do mês selecionado."
            >
              <GestaoComissoes influencers={influencers} calculadas={calculadas} marcas={marcas} />
            </Cartao>
          </>
        )}

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
