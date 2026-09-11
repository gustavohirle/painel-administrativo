import { Cabecalho } from "@/components/Cabecalho";
import { Cartao } from "@/components/Cartao";
import { CargaTributaria } from "@/components/CargaTributaria";
import { GestaoImpostos } from "@/components/GestaoImpostos";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { apurarImpostos } from "@/lib/impostos";
import { mesAnoLongo } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { exigirArea } from "@/lib/sessao";

export const dynamic = "force-dynamic";

export default async function PaginaImpostos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("fiscal");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, impostosCadastrados, produtos, influencers] =
    await Promise.all([
      fonte.listarPedidos(),
      repositorio.listarImpostos(),
      repositorio.listarProdutos(),
      repositorio.listarInfluencers(),
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
  );

  // Quantos produtos marcaram cada imposto -- liga o catalogo ao cadastro.
  const usoPorImposto: Record<string, number> = {};
  for (const produto of produtos) {
    if (!produto.ativo) continue;
    for (const id of produto.impostosIds) {
      usoPorImposto[id] = (usoPorImposto[id] ?? 0) + 1;
    }
  }

  // Valor apurado por imposto, somando as marcas. Sai da propria apuracao
  // para nao divergir do que a tela de baixo mostra.
  const valorPorImposto: Record<string, number> = {};
  for (const apuracao of resultado.porInfluencer) {
    for (const linha of apuracao.linhas) {
      valorPorImposto[linha.impostoId] =
        (valorPorImposto[linha.impostoId] ?? 0) + linha.valor;
    }
  }

  const operacoes = influencers
    .filter((i) => i.ativo)
    .map((i) => ({ marca: i.marca, nome: i.nome, regime: i.regime }));

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
            Impostos sobre os produtos
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-tinta-media">
            O catalogo de tributos que podem incidir sobre um produto, ja
            cadastrado com os basicos e editavel. Quem define qual conjunto vale
            para cada item e o <strong>regime do influencer dono</strong> — e
            esse regime se edita no cadastro de comissoes, marca a marca.
            Referencia: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="rounded-xl border border-alerta-borda bg-alerta-fundo px-6 py-5">
          <p className="text-sm font-semibold text-naopago">
            Confirme as aliquotas com o contador antes de usar para apurar
          </p>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
            A tabela do Simples Nacional usada aqui e a oficial do Anexo II, e as
            aliquotas de PIS, COFINS, IRPJ e CSLL do Lucro Presumido sao as
            legais. Ja o ICMS e o IPI dependem do NCM, do destino da venda e dos
            creditos de insumo -- o que vem preenchido e ponto de partida, nao
            apuracao. Tudo marcado como &quot;a confirmar&quot; precisa passar
            pelo contador.
          </p>
        </div>

        <Cartao
          titulo="Impostos que podem incidir sobre um produto"
          descricao="Organizados pelo regime em que valem. No cadastro do produto, escolher o influencer ja traz marcados os do regime dele."
        >
          <GestaoImpostos
            impostos={impostosCadastrados}
            usoPorImposto={usoPorImposto}
            operacoes={operacoes}
            valorPorImposto={valorPorImposto}
          />
        </Cartao>

        <Cartao
          titulo="Apuracao do mes, marca a marca"
          descricao="Cada influencer no seu regime, com o acompanhamento dos limites de quem esta no Simples."
        >
          <CargaTributaria resultado={resultado} />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
