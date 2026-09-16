import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import type { OpcaoInfluencer } from "@/components/FiltrosDeOrdens";
import { GestaoOrdens, type OpcaoProduto } from "@/components/GestaoOrdens";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { calcularSaldos } from "@/lib/estoque";
import { inteiro } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import {
  filtrarOrdens,
  haFiltroAtivo,
  lerFiltrosDaUrl,
  LIMITE_DA_LISTA,
  resumirOrdens,
  type DonoDoProduto,
} from "@/lib/ordens";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { exigirArea } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** Dias que um mes cobre, para medir o ritmo de venda. */
function diasDoMes(chave: string): number {
  const [ano, mes] = chave.split("-").map(Number);
  if (!ano || !mes) return 30;
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export default async function PaginaOrdens({
  searchParams,
}: {
  searchParams: Promise<{
    mes?: string;
    busca?: string;
    influencer?: string;
    situacao?: string;
  }>;
}) {
  const usuario = await exigirArea("produtos");
  const { mes: mesPedido, ...filtroBruto } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, produtos, contagens, ordens, influencers] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarProdutos(),
    repositorio.listarContagens(),
    repositorio.listarOrdens(),
    repositorio.listarInfluencers(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);

  /*
   * O saldo aparece ao lado do produto no formulario, so como informacao.
   *
   * A ordem NAO reserva nem baixa estoque -- o saldo do painel e funcao pura
   * da contagem e das vendas (secao 5.12), e descontar uma ordem dali criaria
   * um segundo mecanismo mexendo no mesmo numero.
   */
  const saldos = calcularSaldos(produtos, contagens, {
    pedidosDoPeriodo: filtrarPorMes(todosOsPedidos, mesSelecionado),
    pedidosHistorico: todosOsPedidos,
    diasDoPeriodo: diasDoMes(mesSelecionado),
  });
  const saldoPorChave = new Map(saldos.map((s) => [s.chave, s.saldoAtual]));

  const opcoes: OpcaoProduto[] = produtos
    .filter((p) => p.ativo && !p.ehKit)
    .map((p) => ({
      chave: p.chave,
      nome: p.nome,
      sku: p.sku,
      saldo: saldoPorChave.get(p.chave) ?? null,
    }));

  /*
   * Indice produto -> influencer dono.
   *
   * O influencer nao mora na ordem (secao 5.11: ele mora no produto), entao o
   * filtro precisa deste vinculo. Montado UMA vez aqui, e nao dentro do
   * filtro, para nao refazer o mapa a cada ordem.
   */
  const porId = new Map(influencers.map((i) => [i.id, i]));
  const donoPorChave = new Map<string, DonoDoProduto>();
  for (const produto of produtos) {
    const dono = produto.influencerId ? porId.get(produto.influencerId) : undefined;
    if (dono) {
      donoPorChave.set(produto.chave, { id: dono.id, nome: dono.nome, marca: dono.marca });
    }
  }

  const opcoesInfluencer: OpcaoInfluencer[] = influencers
    .filter((i) => i.ativo)
    .map((i) => ({ id: i.id, nome: i.nome, marca: i.marca }));

  const filtros = lerFiltrosDaUrl(
    filtroBruto,
    influencers.map((i) => i.id),
  );

  const encontradas = filtrarOrdens(ordens, filtros, donoPorChave);

  /*
   * O corte acontece AQUI, no servidor, e e o que limita o peso: cada ordem
   * carrega os tracos das duas assinaturas. Sem teto, a aba levaria a base
   * inteira para o navegador para desenhar uma lista que ninguem le inteira.
   */
  const naTela = encontradas.slice(0, LIMITE_DA_LISTA);

  /*
   * O resumo segue o FILTRO, nao a base inteira.
   *
   * Mesma regra do relatorio: o que esta na tela e o que foi filtrado. Cartoes
   * com o total geral ao lado de uma lista filtrada fariam a pessoa somar as
   * linhas e nao chegar no numero de cima.
   */
  const resumo = resumirOrdens(encontradas);
  const filtrando = haFiltroAtivo(filtros);

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
            Ordens de fabricação
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            Quem cuida das campanhas pede a fabricação aqui e assina. O link vai
            para quem toca a produção, que confere o estoque, aprova e assina do
            outro lado. O resultado é um PDF com as duas assinaturas e as duas
            datas, guardado e impossível de alterar depois.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Aguardando assinatura"
            valor={inteiro(resumo.aguardando)}
            apoio="Enviadas e ainda sem resposta da fábrica"
            cor={resumo.aguardando > 0 ? "var(--color-naopago)" : undefined}
          />
          <NumeroDestaque
            rotulo="Unidades em aberto"
            valor={inteiro(resumo.unidadesEmAberto)}
            apoio="O que foi pedido e ainda não foi aceito"
          />
          <NumeroDestaque
            rotulo="Com prazo vencido"
            valor={inteiro(resumo.atrasadas)}
            apoio="Data de lançamento já passou sem aprovação"
            cor={resumo.atrasadas > 0 ? "var(--color-naopago)" : "var(--color-real)"}
          />
          <NumeroDestaque
            rotulo="Assinadas"
            valor={inteiro(resumo.aprovadas)}
            apoio={`${inteiro(resumo.total)} ordem(ns) no total`}
          />

          {/* Sem este aviso, os cartoes parecem falar da base inteira e o
              cliente le "1 aguardando" achando que so ha uma no mundo. */}
          {filtrando && (
            <p className="text-xs text-tinta-fraca sm:col-span-2 xl:col-span-4">
              Os números acima contam apenas as ordens que casam com o filtro
              aplicado abaixo, não a base inteira.
            </p>
          )}
        </div>

        <Cartao
          titulo="Pedidos de fabricação"
          descricao="A ordem não mexe no estoque: ela registra o combinado e quem assinou."
        >
          <GestaoOrdens
            ordens={naTela}
            produtos={opcoes}
            nomeDoUsuario={usuario.nome}
            filtros={filtros}
            influencers={opcoesInfluencer}
            encontradas={encontradas.length}
            total={ordens.length}
            cortada={encontradas.length > naTela.length}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
