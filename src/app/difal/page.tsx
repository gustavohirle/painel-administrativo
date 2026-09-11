import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { DifalPorEstado, GestaoDifal } from "@/components/GestaoDifal";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { apurarImpostos } from "@/lib/impostos";
import { inteiro, mesAnoLongo, moeda, moedaRedonda, percentual } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { exigirArea } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function PaginaDifal({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("fiscal");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [
    todosOsPedidos,
    impostosCadastrados,
    produtos,
    influencers,
    aliquotasEstaduais,
  ] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarImpostos(),
    repositorio.listarProdutos(),
    repositorio.listarInfluencers(),
    repositorio.listarAliquotasEstaduais(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado =
    mesPedido && meses.includes(mesPedido) ? mesPedido : (meses[0] ?? "");
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  const resultado = apurarImpostos(
    pedidosDoMes,
    todosOsPedidos,
    produtos,
    impostosCadastrados,
    influencers,
    aliquotasEstaduais,
  );

  const difal = resultado.difal;

  // Quem recolhe e quem nao recolhe, para a tela explicar o numero.
  const noSimples = resultado.porInfluencer.filter(
    (a) => a.regime === "simples_nacional",
  );
  const recolhem = resultado.porInfluencer.filter(
    (a) => a.regime !== "simples_nacional",
  );

  const estadosComVenda = difal.porEstado.filter((l) => !l.interna).length;

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
            DIFAL de ICMS
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-tinta-media">
            Na venda interestadual ao consumidor final, a diferenca entre a
            aliquota interna do estado de destino e a interestadual vai para
            aquele estado. O painel calcula isso pedido a pedido, pelo endereco
            de entrega, e soma no custo tributario. Referencia:{" "}
            {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="rounded-xl border border-alerta-borda bg-alerta-fundo px-6 py-5">
          <p className="text-sm font-semibold text-naopago">
            As aliquotas vem preenchidas, mas nenhuma esta confirmada
          </p>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
            Varios estados mexeram nas suas aliquotas internas entre 2023 e 2025,
            e algumas ja embutem fundo de combate a pobreza enquanto outras nao.
            Alem disso, a apuracao oficial usa base dupla -- o imposto entra na
            propria base de calculo -- e este painel <strong>nao faz</strong> esse
            ajuste, entao o valor exibido fica um pouco <strong>abaixo</strong> do
            devido. Confirme estado a estado com o contador e marque como
            confirmado.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-6 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="DIFAL no mes"
            valor={moedaRedonda(difal.total)}
            apoio={`${percentual(difal.cargaSobreReceita)} do que foi recebido`}
            cor="var(--color-imposto)"
          />
          <NumeroDestaque
            rotulo="Receita interestadual"
            valor={moedaRedonda(difal.baseInterestadual)}
            apoio="Base do DIFAL: venda para fora do estado"
          />
          <NumeroDestaque
            rotulo="Receita dentro do estado"
            valor={moedaRedonda(difal.baseInterna)}
            apoio={`Venda em ${difal.ufOrigem} nao gera DIFAL`}
          />
          <NumeroDestaque
            rotulo="Estados de destino"
            valor={inteiro(estadosComVenda)}
            apoio={`${aliquotasEstaduais.filter((a) => !a.confirmadoPeloContador).length} aliquota(s) a confirmar`}
          />
        </div>

        {(noSimples.length > 0 || difal.pedidosSemEstado > 0) && (
          <div className="rounded-xl border border-borda bg-superficie px-6 py-5">
            <p className="text-sm font-semibold text-tinta">
              O que esta e o que nao esta nesta conta
            </p>
            <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-tinta-media">
              {recolhem.length > 0 && (
                <li>
                  <strong className="text-tinta">Recolhem DIFAL:</strong>{" "}
                  {recolhem.map((a) => a.marca).join(", ")} — fora do Simples.
                </li>
              )}
              {noSimples.length > 0 && (
                <li>
                  <strong className="text-tinta">Nao recolhem:</strong>{" "}
                  {noSimples.map((a) => a.marca).join(", ")} — optante do Simples
                  Nacional nao recolhe DIFAL na condicao de remetente, conforme
                  decisao do STF na ADI 5464. As vendas delas aparecem na tabela,
                  mas com DIFAL zerado.
                </li>
              )}
              {difal.pedidosSemEstado > 0 && (
                <li className="text-naopago">
                  <strong>{inteiro(difal.pedidosSemEstado)} pedido(s)</strong> sem
                  estado de entrega identificado, somando{" "}
                  <strong className="numerico">
                    {moeda(difal.receitaSemEstado)}
                  </strong>{" "}
                  — ficam de fora do calculo.
                </li>
              )}
            </ul>
          </div>
        )}

        <Cartao
          titulo="Para quais estados vai o DIFAL"
          descricao="Os maiores destinos do mes, pelo endereco de entrega de cada pedido."
        >
          <DifalPorEstado porEstado={difal.porEstado} total={difal.total} />
        </Cartao>

        <Cartao
          titulo="Aliquota interna de cada estado"
          descricao="Ja preenchidas e editaveis. O DIFAL e a diferenca entre a interna do destino e a interestadual."
        >
          <GestaoDifal
            aliquotas={aliquotasEstaduais}
            porEstado={difal.porEstado}
            ufOrigem={difal.ufOrigem}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
