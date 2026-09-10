import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { GestaoEstoque } from "@/components/GestaoEstoque";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { calcularSaldos, resumirEstoque } from "@/lib/estoque";
import { inteiro, mesAnoLongo } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { exigirArea } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** Dias que um mes cobre, para medir o ritmo de venda. */
function diasDoMes(chave: string): number {
  const [ano, mes] = chave.split("-").map(Number);
  if (!ano || !mes) return 30;
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

export default async function PaginaEstoque({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("estoque");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, produtos, contagens] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarProdutos(),
    repositorio.listarContagens(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado =
    mesPedido && meses.includes(mesPedido) ? mesPedido : (meses[0] ?? "");
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  const saldos = calcularSaldos(produtos, contagens, {
    pedidosDoPeriodo: pedidosDoMes,
    pedidosHistorico: todosOsPedidos,
    diasDoPeriodo: diasDoMes(mesSelecionado),
  });

  const resumo = resumirEstoque(saldos);

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
            Estoque
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            Registre a contagem de cada item e o painel acompanha o saldo
            descontando o que saiu, inclusive dentro de kits. Ritmo de venda
            medido em {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-6 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Itens controlados"
            valor={inteiro(resumo.itens)}
            apoio="Kits sao montados sob demanda e nao tem saldo proprio"
          />
          <NumeroDestaque
            rotulo="Precisam de reposicao"
            valor={inteiro(resumo.negativos + resumo.criticos)}
            apoio="Saldo negativo ou cobertura abaixo de uma semana"
            cor={
              resumo.negativos + resumo.criticos > 0
                ? "var(--color-naopago)"
                : "var(--color-real)"
            }
          />
          <NumeroDestaque
            rotulo="Em atencao"
            valor={inteiro(resumo.baixos)}
            apoio="Cobertura entre uma e tres semanas"
          />
          <NumeroDestaque
            rotulo="Nunca contados"
            valor={inteiro(resumo.semContagem)}
            apoio="Sem contagem, nao ha saldo a calcular"
            cor={
              resumo.semContagem > 0 ? "var(--color-naopago)" : "var(--color-tinta)"
            }
          />
        </div>

        <Cartao
          titulo="Saldo por item"
          descricao="Saldo atual e a ultima contagem menos tudo que saiu depois dela."
        >
          <GestaoEstoque saldos={saldos} />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
