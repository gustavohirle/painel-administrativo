import { Cabecalho } from "@/components/Cabecalho";
import { ControlesRelatorio } from "@/components/ControlesRelatorio";
import { TabelaRelatorio } from "@/components/TabelaRelatorio";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";
import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { ratearDespesas } from "@/lib/costing";
import { modoDemonstracao } from "@/lib/config";
import { mesesDisponiveis } from "@/lib/metrics";
import { montarRelatorio, metodoDoPedido, ufDoPedido } from "@/lib/relatorios";
import { exigirArea } from "@/lib/sessao";
import { lerConfiguracaoDaUrl } from "@/lib/relatoriosUrl";
import { COMBINACOES_PRONTAS } from "@/types/relatorio";

export const metadata = { title: "Relatorios | Painel Administrativo" };

/**
 * Tela de relatorios.
 *
 * A configuracao inteira mora na URL (`?agrupar=marca&metricas=...`). Duas
 * consequencias que valem o incomodo de serializar tudo:
 *
 * 1. O calculo continua no servidor. O navegador recebe algumas dezenas de
 *    linhas agregadas, nunca os 45 mil pedidos.
 * 2. Um relatorio vira um link. O cliente pode salvar nos favoritos ou mandar
 *    a combinacao exata para o contador, em vez de descrever quais caixinhas
 *    marcar.
 */
export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await exigirArea("financeiro");
  const params = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [
    pedidos,
    custos,
    influencers,
    impostos,
    produtos,
    aliquotasEstaduais,
    taxasPlataforma,
    despesasInfluencer,
  ] =
    await Promise.all([
      fonte.listarPedidos(),
      repositorio.listarCustos(),
      repositorio.listarInfluencers(),
      repositorio.listarImpostos(),
      repositorio.listarProdutos(),
      repositorio.listarAliquotasEstaduais(),
      repositorio.listarTaxasPlataforma(),
      repositorio.listarDespesasInfluencer(),
    ]);

  const configuracao = lerConfiguracaoDaUrl(params);
  const resultado = montarRelatorio(configuracao, {
    pedidos,
    custos,
    produtos,
    influencers,
    impostos,
    aliquotasEstaduais,
    taxasPlataforma,
    // Dividida com TODOS os pedidos, antes de qualquer filtro: a parte de cada
    // marca e a do mes inteiro, igual a da tela inicial.
    despesasInfluencer: ratearDespesas(despesasInfluencer, pedidos, influencers),
  });

  // Opcoes dos filtros saem dos proprios pedidos: um filtro que oferece um
  // valor inexistente devolve tela vazia e parece defeito.
  const meses = mesesDisponiveis(pedidos);
  const marcas = [...new Set(pedidos.map((p) => p.marca))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  const estados = [
    ...new Set(pedidos.map(ufDoPedido).filter((uf): uf is string => uf !== null)),
  ].sort();
  const pagamentos = [...new Set(pedidos.map(metodoDoPedido))].sort();

  return (
    <div className="folha-deitada min-h-screen">
      <Cabecalho demonstracao={modoDemonstracao()} usuario={usuario} />

      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-6 sm:py-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">
            Relatórios
          </h1>
          {/* Instrucao de uso: no papel nao ha o que marcar nem filtrar. */}
          <p className="sem-impressao mt-1 text-sm text-tinta-media">
            As mesmas contas do painel, quebradas por onde você quiser olhar.
            Escolha o agrupamento, marque as colunas e filtre o período.
          </p>
        </div>

        <ControlesRelatorio
          configuracao={configuracao}
          combinacoes={COMBINACOES_PRONTAS}
          meses={meses}
          marcas={marcas}
          estados={estados}
          pagamentos={pagamentos}
        />

        <TabelaRelatorio resultado={resultado} configuracao={configuracao} />

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
