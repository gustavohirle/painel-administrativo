import { Cabecalho } from "@/components/Cabecalho";
import { NumeroDestaque } from "@/components/Cartao";
import { GestaoOrdens, type OpcaoProduto } from "@/components/GestaoOrdens";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { calcularSaldos } from "@/lib/estoque";
import { inteiro } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { LIMITE_DA_LISTA, resumirOrdens } from "@/lib/ordens";
import { diaDeHoje } from "@/lib/metrics";
import { montarFila } from "@/lib/processoOrdem";
import { exigirArea } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** Dias que um mes cobre, para medir o ritmo de venda. */
function diasDoMes(chave: string): number {
  const [ano, mes] = chave.split("-").map(Number);
  if (!ano || !mes) return 30;
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Ordens de fabricacao: o processo de seis etapas, do pedido ao estoque.
 *
 * A tela abre pela FILA -- o que esta esperando alguem --, e nao por filtros.
 * A pergunta que se faz aqui todo dia e "o que esta comigo, e o que esta
 * atrasado"; filtro por influencer e por situacao respondiam outra coisa, e
 * sairam junto com as duas etapas antigas.
 */
export default async function PaginaOrdens({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; ordem?: string }>;
}) {
  const usuario = await exigirArea("produtos");
  const { mes: mesPedido, ordem: ordemAberta } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, produtos, contagens, ordens] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarProdutos(),
    repositorio.listarContagens(),
    repositorio.listarOrdens(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);
  const hoje = diaDeHoje();

  /*
   * O saldo aparece ao lado do produto no formulario, so como informacao.
   *
   * A ordem NAO reserva nem baixa estoque -- o saldo do painel e funcao pura
   * da contagem e das vendas (secao 5.12), e descontar uma ordem dali criaria
   * um segundo mecanismo mexendo no mesmo numero. O que a ordem faz e outra
   * coisa: no RECEBIMENTO, a contagem do estoquista vira contagem de verdade.
   */
  const saldos = calcularSaldos(produtos, contagens, {
    pedidosDoPeriodo: filtrarPorMes(todosOsPedidos, mesSelecionado),
    pedidosHistorico: todosOsPedidos,
    diasDoPeriodo: diasDoMes(mesSelecionado),
  });
  const porChave = new Map(saldos.map((s) => [s.chave, s]));

  const opcoes: OpcaoProduto[] = produtos
    .filter((p) => p.ativo && !p.ehKit)
    .map((p) => ({
      chave: p.chave,
      nome: p.nome,
      sku: p.sku,
      saldo: porChave.get(p.chave)?.saldoAtual ?? null,
      /*
       * Cobertura em dias ao lado do produto: e a outra metade do problema que
       * o dono descreveu -- "saber quando um produto esta acabando". Quem abre
       * a ordem ve, na hora de escolher, o que acaba primeiro.
       */
      coberturaDias: porChave.get(p.chave)?.diasDeCobertura ?? null,
    }))
    // O que acaba antes aparece antes: e o que se vai pedir.
    .sort((a, b) => (a.coberturaDias ?? 9999) - (b.coberturaDias ?? 9999));

  const fila = montarFila(ordens, usuario, hoje);
  const resumo = resumirOrdens(ordens, hoje);

  /*
   * O corte acontece AQUI, no servidor, e e o que limita o peso: cada ordem
   * carrega os tracos de ate seis assinaturas. Sem teto, a aba levaria a base
   * inteira para o navegador para desenhar uma lista que ninguem le inteira.
   */
  const naTela = fila.slice(0, LIMITE_DA_LISTA);

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
            Do pedido até o estoque na Criar, em seis etapas assinadas. Cada
            ordem mostra em que pé está e quem tem que agir agora.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Em andamento"
            valor={inteiro(resumo.emAndamento)}
            apoio={`${inteiro(resumo.unidadesEmAberto)} unidade(s) que a fábrica ainda deve`}
          />
          <NumeroDestaque
            rotulo="Voltaram para decidir"
            valor={inteiro(resumo.emRevisao)}
            apoio={
              resumo.emRevisao > 0
                ? "A produção não fecha a data ou falta insumo"
                : "Nenhuma esperando o administrador"
            }
            cor={resumo.emRevisao > 0 ? "var(--color-naopago)" : undefined}
          />
          <NumeroDestaque
            rotulo="Atrasadas"
            valor={inteiro(resumo.atrasadas)}
            apoio="A data de lançamento já passou e a ordem não fechou"
            cor={resumo.atrasadas > 0 ? "var(--color-naopago)" : undefined}
          />
          <NumeroDestaque
            rotulo="Concluídas"
            valor={inteiro(resumo.concluidas)}
            apoio={`${inteiro(resumo.total)} ordem(ns) no total`}
            cor="var(--color-real)"
          />
        </div>

        <GestaoOrdens
          fila={naTela}
          produtos={opcoes}
          nomeDoUsuario={usuario.nome}
          ehAdministrador={usuario.perfil === "dono"}
          hoje={hoje}
          abertaPorPadrao={ordemAberta ?? null}
          totalNaBase={ordens.length}
        />

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
