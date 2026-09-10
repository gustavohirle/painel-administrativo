import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { GestaoProdutos } from "@/components/GestaoProdutos";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { unidadesConsumidas } from "@/lib/estoque";
import { indexarProdutos } from "@/lib/impostos";
import { inteiro, mesAnoLongo } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis, pedidosRecebidos } from "@/lib/metrics";
import { chaveProduto } from "@/types/produto";
import { exigirArea } from "@/lib/sessao";
import { podeAcessar } from "@/types/usuario";

export const dynamic = "force-dynamic";

export default async function PaginaProdutos({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await exigirArea("produtos");
  const { mes: mesPedido } = await searchParams;

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [todosOsPedidos, produtos, impostos, influencers] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarProdutos(),
    repositorio.listarImpostos(),
    repositorio.listarInfluencers(),
  ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado =
    mesPedido && meses.includes(mesPedido) ? mesPedido : (meses[0] ?? "");
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  // Duas leituras diferentes de "vendas", e cada linha precisa da sua:
  //   - item avulso: unidades que sairam da prateleira, ja somando o que foi
  //     dentro de kit;
  //   - kit: quantos kits foram vendidos. Pelo consumo decomposto o kit daria
  //     sempre zero, porque ele nao consome a si mesmo.
  const consumo = unidadesConsumidas(pedidosDoMes, indexarProdutos(produtos));

  const vendasDiretas = new Map<string, number>();
  for (const pedido of pedidosRecebidos(pedidosDoMes)) {
    for (const item of pedido.products) {
      const chave = chaveProduto(item.product_id, item.variant_id);
      vendasDiretas.set(chave, (vendasDiretas.get(chave) ?? 0) + item.quantity);
    }
  }

  const vendasPorChave = Object.fromEntries(
    produtos.map((p) => [
      p.chave,
      (p.ehKit ? vendasDiretas.get(p.chave) : consumo.get(p.chave)) ?? 0,
    ]),
  );

  const kits = produtos.filter((p) => p.ehKit);
  const semDono = produtos.filter((p) => !p.influencerId);

  // So o que a tela precisa saber de cada influencer -- nao o contrato inteiro.
  const opcoesInfluencer = influencers
    .filter((i) => i.ativo)
    .map((i) => ({ id: i.id, nome: i.nome, marca: i.marca, regime: i.regime }));
  const podeVerFinanceiro = podeAcessar(usuario.perfil, "financeiro");

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
            Produtos
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-tinta-media">
            A lista chega da Nuvemshop. O que se cadastra aqui e o que ela nao
            sabe: de qual influencer o produto e, o NCM, e de que componentes um
            kit e feito. Os impostos vem sozinhos, do regime tributario do
            influencer dono. Referencia: {mesAnoLongo(mesSelecionado)}.
          </p>
        </div>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-6 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-2 xl:grid-cols-4">
          <NumeroDestaque
            rotulo="Produtos cadastrados"
            valor={inteiro(produtos.length)}
            apoio={`${produtos.filter((p) => p.origem === "manual").length} cadastrado(s) a mao`}
          />
          <NumeroDestaque
            rotulo="Vendidos como kit"
            valor={inteiro(kits.length)}
            apoio="Baixam o estoque dos componentes"
          />
          <NumeroDestaque
            rotulo="Sem influencer vinculado"
            valor={inteiro(semDono.length)}
            apoio="Sem dono nao ha regime, e sem regime nao ha imposto"
            cor={semDono.length > 0 ? "var(--color-naopago)" : "var(--color-real)"}
          />
          <NumeroDestaque
            rotulo="Regimes em uso"
            valor={inteiro(new Set(opcoesInfluencer.map((i) => i.regime)).size)}
            apoio={`${opcoesInfluencer.length} influencer(s) ativo(s)`}
          />
        </div>

        <Cartao
          titulo="Cadastro de produtos"
          descricao="Vincule cada produto ao seu influencer: os impostos do regime dele entram automaticamente."
        >
          <GestaoProdutos
            produtos={produtos}
            impostos={impostos}
            influencers={opcoesInfluencer}
            vendasPorChave={vendasPorChave}
            podeVerFinanceiro={podeVerFinanceiro}
          />
        </Cartao>

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}
