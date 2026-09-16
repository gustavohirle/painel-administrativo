import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { GestaoKits } from "@/components/GestaoKits";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { inteiro, mesAnoLongo } from "@/lib/format";
import { listarKits, rotulosParaEscolha } from "@/lib/kits";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { exigirArea } from "@/lib/sessao";
import { podeAcessar } from "@/types/usuario";

export const dynamic = "force-dynamic";

/**
 * Aba Kits: de que cada kit e feito.
 *
 * A Nuvemshop nao informa a composicao (secao 5.11.1), entao ela e montada
 * aqui, item por item, a partir dos produtos do cadastro. Area `produtos`,
 * como a aba Produtos: a conversa e sobre o que vai dentro da caixa. O custo
 * so aparece para quem tem a area `custos`.
 */
export default async function PaginaKits({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("produtos");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, produtos, custos] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarProdutos(),
    repositorio.listarCustos(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  const kits = listarKits(produtos, custos, pedidosDoMes);
  const mostrarCusto = podeAcessar(usuario.perfil, "custos");

  const aMontar = kits.filter((k) => k.itens.length === 0).length;
  const comCusto = kits.filter((k) => k.custoUnitario !== null).length;
  const vendidosAMontar = kits
    .filter((k) => k.itens.length === 0)
    .reduce((s, k) => s + k.vendidos, 0);

  const naoKits = rotulosParaEscolha(produtos.filter((p) => !p.ehKit)).map((o) => ({
    id: produtos.find((p) => p.chave === o.chave)!.id,
    rotulo: o.rotulo,
  }));

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
          <h1 className="text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">Kits</h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            A Nuvemshop vende o kit como um produto só e não informa o que vai
            dentro dele. Aqui se diz de que cada kit é feito: com isso o custo do
            kit sai da soma dos itens e o estoque baixa os produtos certos.
            Vendas de referência: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 sm:px-6 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Kits cadastrados"
            valor={inteiro(kits.length)}
            apoio={`${inteiro(kits.length - aMontar)} já montado(s)`}
          />
          <NumeroDestaque
            rotulo="A montar"
            valor={inteiro(aMontar)}
            apoio={`${inteiro(vendidosAMontar)} unidade(s) vendida(s) no mês sem composição`}
            cor={aMontar > 0 ? "var(--color-naopago)" : "var(--color-real)"}
          />
          {mostrarCusto && (
            <NumeroDestaque
              rotulo="Com custo calculado"
              valor={`${inteiro(comCusto)} de ${inteiro(kits.length)}`}
              apoio="Pela soma dos itens ou pela ficha do próprio kit"
            />
          )}
          <NumeroDestaque
            rotulo="Kits vendidos no mês"
            valor={inteiro(kits.reduce((s, k) => s + k.vendidos, 0))}
            apoio="Só pedidos pagos"
          />
        </div>

        <Cartao
          titulo="Composição dos kits"
          descricao="Os mais vendidos primeiro. Toque em Montar e escolha, na lista de produtos, cada item que vai dentro do kit."
        >
          <GestaoKits
            kits={kits}
            opcoes={rotulosParaEscolha(produtos)}
            naoKits={naoKits}
            mostrarCusto={mostrarCusto}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
