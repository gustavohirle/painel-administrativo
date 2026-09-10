import { Cabecalho } from "@/components/Cabecalho";
import { Cartao } from "@/components/Cartao";
import { CargaTributaria } from "@/components/CargaTributaria";
import {
  FormularioConfiguracaoFiscal,
  GestaoImpostos,
} from "@/components/GestaoImpostos";
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

  const [todosOsPedidos, impostosCadastrados, produtos, influencers, configFiscal] =
    await Promise.all([
      fonte.listarPedidos(),
      repositorio.listarImpostos(),
      repositorio.listarProdutos(),
      repositorio.listarInfluencers(),
      repositorio.obterConfiguracaoFiscal(),
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
    configFiscal,
  );

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
            Impostos
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            Cada influencer tem o proprio regime, e a apuracao e feita marca a
            marca. O regime de cada um se edita no cadastro de comissoes.
            Referencia: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="rounded-xl border border-alerta-borda bg-alerta-fundo px-6 py-5">
          <p className="text-sm font-semibold text-naopago">
            Confirme as aliquotas com o contador antes de usar para apurar
          </p>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
            A tabela do Simples Nacional usada aqui e a oficial do Anexo II, mas
            o enquadramento no anexo, a segregacao de receitas e cada tributo
            recolhido por fora dependem do NCM, do destino da venda e de
            beneficios fiscais estaduais. O painel serve para enxergar a ordem de
            grandeza e simular cenarios -- nao substitui a apuracao.
          </p>
        </div>

        <Cartao
          titulo="Regime padrao"
          descricao="Vale apenas para marcas que ainda nao tem influencer vinculado. O regime de cada marca fica no cadastro do influencer."
        >
          <FormularioConfiguracaoFiscal config={configFiscal} />
        </Cartao>

        <Cartao
          titulo="Apuracao do mes"
          descricao="Quanto do que entrou vira imposto, marca a marca, e o acompanhamento dos limites de quem esta no Simples."
        >
          <CargaTributaria resultado={resultado} />
        </Cartao>

        <Cartao
          titulo="Cadastro de impostos"
          descricao="Cada tributo vale para um ou mais regimes. E dessa lista que o cadastro de produto se preenche sozinho."
        >
          <GestaoImpostos
            impostos={impostosCadastrados}
            baseReceita={resultado.baseReceita}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
