import Link from "next/link";

import { Cabecalho } from "@/components/Cabecalho";
import { Cartao } from "@/components/Cartao";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";
import { SimuladorInfluencer } from "@/components/SimuladorInfluencer";
import { SimuladorPreco } from "@/components/SimuladorPreco";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { ratearDespesas } from "@/lib/costing";
import { mesAnoLongo } from "@/lib/format";
import { apurarImpostos } from "@/lib/impostos";
import { diaDeHoje, filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { exigirArea } from "@/lib/sessao";
import { montarReferencia } from "@/lib/simulacaoInfluencer";
import { mesDeReferenciaDoSimulador, montarPerfisDeCusto } from "@/lib/simulacaoPreco";

export const dynamic = "force-dynamic";

type Aba = "produto" | "influencer";

/**
 * Simulador (secao 5.17), em duas abas:
 *
 * - "Preço de produto": fabrico por X, vendo por Y -- ganho ou perco?
 * - "Comissão de influencer": fecho a X% com quem fatura Y -- sobra dinheiro?
 *   O simulador de base dos contratos atuais (secao 5.2) morou aqui embaixo
 *   por um tempo e saiu a pedido do cliente: com a estimativa funcionando, ele
 *   repetia a mesma conversa com outra tela.
 *
 * A aba mora na URL (?aba=), como o influencer escolhido na aba Influencers:
 * o seletor de mes do cabecalho a preserva, e da para mandar o link.
 *
 * O servidor mede as medias com as mesmas funcoes do painel; o navegador so
 * faz a conta no toque do botao. Area `financeiro`: comissao e margem, que o
 * perfil `estoque` nao ve (secao 5.13).
 */
export default async function PaginaSimulador({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; aba?: string }>;
}) {
  const usuario = await exigirArea("financeiro");
  const { mes: mesPedido, aba: abaPedida } = await searchParams;
  const aba: Aba = abaPedida === "influencer" ? "influencer" : "produto";

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [
    todosOsPedidos,
    influencers,
    impostosCadastrados,
    produtos,
    aliquotas,
    taxas,
    despesas,
    custos,
  ] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarInfluencers(),
    repositorio.listarImpostos(),
    repositorio.listarProdutos(),
    repositorio.listarAliquotasEstaduais(),
    repositorio.listarTaxasPlataforma(),
    repositorio.listarDespesasInfluencer(),
    repositorio.listarCustos(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);
  /*
   * As medias saem do mes do cabecalho, a menos que ele seja o mes corrente:
   * ai, do anterior (25/09/2026, pedido do dono). O mes aberto nao tem as
   * despesas lancadas, e a venda sairia mais lucrativa do que e. Ver
   * `mesDeReferenciaDoSimulador`.
   */
  const mesDaSimulacao = mesDeReferenciaDoSimulador(
    mesSelecionado,
    diaDeHoje().slice(0, 7),
    meses,
  );
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesDaSimulacao);
  const rotuloMes = mesAnoLongo(mesDaSimulacao);

  const impostos = apurarImpostos(
    pedidosDoMes,
    todosOsPedidos,
    produtos,
    impostosCadastrados,
    influencers,
    aliquotas,
  );

  const endereco = (destino: Aba) => {
    // A URL guarda o mes do CABECALHO, e nao o da simulacao: trocar de aba nao
    // pode mudar o mes escolhido.
    const params = new URLSearchParams();
    if (mesSelecionado) params.set("mes", mesSelecionado);
    if (destino !== "produto") params.set("aba", destino);
    const consulta = params.toString();
    return consulta ? `/simulador?${consulta}` : "/simulador";
  };

  const abas: Array<{ chave: Aba; rotulo: string }> = [
    { chave: "produto", rotulo: "Preço de produto" },
    { chave: "influencer", rotulo: "Comissão de influencer" },
  ];

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
            Simulador
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            {aba === "produto"
              ? `Escolha o influencer, informe quanto custa fabricar e por quanto pretende vender. O painel desconta impostos, DIFAL, taxa, comissão e a participação dos sócios pelas médias de ${rotuloMes} da marca e mostra se a venda dá lucro ou prejuízo. O frete é pago pelo cliente à parte — no TikTok, dá para simular com frete grátis.`
              : `Informe o percentual de comissão e o faturamento esperado de um influencer. O painel estima o resultado com os custos médios das marcas atuais em ${rotuloMes}.`}
          </p>
          {/* O cabecalho diz um mes e a conta usa outro: sem esta frase, a
              pessoa leria as medias de agosto achando que sao de setembro. */}
          {mesDaSimulacao !== mesSelecionado && (
            <p className="mt-2 max-w-3xl text-sm text-tinta-media">
              <strong className="text-tinta">As médias são de {rotuloMes}, e não de {mesAnoLongo(mesSelecionado)}.</strong>{" "}
              O mês corrente ainda está aberto: as despesas com influencers só são
              lançadas depois que ele fecha, e as taxas do TikTok chegam dias depois de
              cada venda. Com ele, a venda pareceria mais lucrativa do que é.
            </p>
          )}
        </div>

        <nav
          aria-label="Tipo de simulação"
          className="grid grid-cols-2 gap-1 rounded-xl border border-borda bg-superficie p-1 sm:inline-grid"
        >
          {abas.map((item) => {
            const ativa = item.chave === aba;
            return (
              <Link
                key={item.chave}
                href={endereco(item.chave)}
                aria-current={ativa ? "page" : undefined}
                className={`rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${
                  ativa ? "bg-tinta text-white" : "text-tinta-media hover:bg-fundo"
                }`}
              >
                {item.rotulo}
              </Link>
            );
          })}
        </nav>

        {aba === "produto" ? (
          (() => {
            const perfis = montarPerfisDeCusto({
              pedidosDoMes,
              influencers,
              impostos,
              taxas,
              // Compartilhada dividida com todos os pedidos, como no painel.
              despesas: ratearDespesas(despesas, todosOsPedidos, influencers),
            });

            // Quem ficou de fora e dito na tela, em vez de sumir da lista em silencio.
            const semVendas = influencers
              .filter((i) => i.ativo && !perfis.some((p) => p.influencerId === i.id))
              .map((i) => `${i.nome} (${i.marca})`);

            return (
              <Cartao
                titulo="Simular um produto"
                descricao="Uma unidade vendida e paga. Os custos são médias do mês, não uma apuração."
              >
                <SimuladorPreco perfis={perfis} rotuloMes={rotuloMes} semVendas={semVendas} />
              </Cartao>
            );
          })()
        ) : (
          <>
            <Cartao
              titulo="Simular um contrato de influencer"
              descricao="Percentual e faturamento esperado por mês, os dois sem frete. Os custos são médias das marcas atuais, não uma apuração."
            >
              <SimuladorInfluencer
                referencia={montarReferencia({
                  mes: mesDaSimulacao,
                  pedidosDoMes,
                  todosOsPedidos,
                  influencers,
                  custos,
                  produtos,
                  impostos,
                  taxas,
                  despesas,
                })}
                rotuloMes={rotuloMes}
              />
            </Cartao>
          </>
        )}

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
