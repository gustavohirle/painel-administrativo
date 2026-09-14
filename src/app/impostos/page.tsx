import { Cabecalho } from "@/components/Cabecalho";
import { Cartao } from "@/components/Cartao";
import { CargaTributaria } from "@/components/CargaTributaria";
import { GestaoImpostos } from "@/components/GestaoImpostos";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { apurarImpostos } from "@/lib/impostos";
import { apurarTaxasPlataforma } from "@/lib/plataforma";
import { GestaoTaxas } from "@/components/GestaoTaxas";
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

  const [
    todosOsPedidos,
    impostosCadastrados,
    produtos,
    influencers,
    aliquotasEstaduais,
    taxasCadastradas,
  ] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarImpostos(),
    repositorio.listarProdutos(),
    repositorio.listarInfluencers(),
    repositorio.listarAliquotasEstaduais(),
    repositorio.listarTaxasPlataforma(),
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

  const taxas = apurarTaxasPlataforma(pedidosDoMes, taxasCadastradas);

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
            O catálogo de tributos que podem incidir sobre um produto, já
            cadastrado com os básicos e editável. Quem define qual conjunto vale
            para cada item é o <strong>regime do influencer dono</strong> — e
            esse regime se edita no cadastro de comissões, marca a marca.
            Referência: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="rounded-xl border border-alerta-borda bg-alerta-fundo px-6 py-5">
          <p className="text-sm font-semibold text-naopago">
            Confirme as alíquotas com o contador antes de usar para apurar
          </p>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
            A tabela do Simples Nacional usada aqui é a oficial do Anexo II, e as
            alíquotas de PIS, COFINS, IRPJ e CSLL do Lucro Presumido são as
            legais. Já o ICMS e o IPI dependem do NCM, do destino da venda e dos
            créditos de insumo -- o que vem preenchido é ponto de partida, não
            apuração. Tudo marcado como &quot;a confirmar&quot; precisa passar
            pelo contador.
          </p>
        </div>

        <Cartao
          titulo="Impostos que podem incidir sobre um produto"
          descricao="Organizados pelo regime em que valem. No cadastro do produto, escolher o influencer já traz marcados os do regime dele."
        >
          <GestaoImpostos
            impostos={impostosCadastrados}
            usoPorImposto={usoPorImposto}
            operacoes={operacoes}
            valorPorImposto={valorPorImposto}
          />
        </Cartao>

        <Cartao
          titulo="Apuração do mês, marca a marca"
          descricao="Cada influencer no seu regime, com o acompanhamento dos limites de quem está no Simples."
        >
          <CargaTributaria resultado={resultado} />
        </Cartao>

        <Cartao
          titulo="Taxa da Nuvemshop e do meio de pagamento"
          descricao="Não é tributo: é preço de serviço, retido no ato da venda. Fica aqui por sair do mesmo lugar -- do dinheiro que entrou -- mas em seção própria, porque é a única das duas que dá para renegociar."
        >
          <GestaoTaxas taxas={taxasCadastradas} apuracao={taxas} />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
