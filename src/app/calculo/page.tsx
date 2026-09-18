import Link from "next/link";

import { Cabecalho } from "@/components/Cabecalho";
import { Cartao, NumeroDestaque } from "@/components/Cartao";
import { RodapeDemonstracao } from "@/components/RodapeDemonstracao";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { apurarImpostos } from "@/lib/impostos";
import { inteiro, mesAnoLongo, moeda, moedaRedonda, percentual } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import {
  memoriaDosImpostos,
  type MemoriaDaMarca,
  type PassoDoImposto,
} from "@/lib/memoriaCalculo";
import { mesDaTela } from "@/lib/mesDaTelaServidor";
import { exigirArea } from "@/lib/sessao";
import type { RegimeTributario } from "@/types/fiscal";

export const dynamic = "force-dynamic";

/*
 * Memoria de calculo (secao 5.1.4): o caminho de cada fatia de imposto da
 * pizza ate o numero. Aberta pelo clique em "Impostos" ou "DIFAL" na tela
 * inicial. Nenhuma conta nova: tudo sai de `apurarImpostos`.
 */

type Item = "impostos" | "difal";

const ROTULO_REGIME: Record<RegimeTributario, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

/** Aliquota em percentual (4 = 4%), com as casas que ela tiver. */
const aliquota = (valor: number) =>
  `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%`;

export default async function PaginaCalculo({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; item?: string }>;
}) {
  const usuario = await exigirArea("fiscal");
  const { mes: mesPedido, item: itemPedido } = await searchParams;
  const item: Item = itemPedido === "difal" ? "difal" : "impostos";

  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();
  const [todosOsPedidos, impostos, produtos, influencers, aliquotas, fechamentos] =
    await Promise.all([
      fonte.listarPedidos(),
      repositorio.listarImpostos(),
      repositorio.listarProdutos(),
      repositorio.listarInfluencers(),
      repositorio.listarAliquotasEstaduais(),
      repositorio.listarFechamentos(),
    ]);

  const meses = mesesDisponiveis(todosOsPedidos);
  const mesSelecionado = await mesDaTela(meses, mesPedido);
  const pedidosDoMes = filtrarPorMes(todosOsPedidos, mesSelecionado);

  const resultado = apurarImpostos(
    pedidosDoMes,
    todosOsPedidos,
    produtos,
    impostos,
    influencers,
    aliquotas,
  );
  const memoria = memoriaDosImpostos(resultado, pedidosDoMes, impostos, produtos);
  const fechamento = fechamentos.find((f) => f.mes === mesSelecionado) ?? null;
  const informado = item === "difal" ? (fechamento?.difal ?? null) : (fechamento?.impostos ?? null);
  const calculado = item === "difal" ? memoria.totalDifal : memoria.totalImpostos;

  const endereco = (outro: Item) => `/calculo?item=${outro}&mes=${mesSelecionado}`;

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
          <Link href="/" className="text-sm font-medium text-tinta-media hover:text-tinta">
            ← Voltar ao resultado
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-tinta xl:text-3xl">
            Como chegamos {item === "difal" ? "no DIFAL" : "nos impostos"} de{" "}
            {mesAnoLongo(mesSelecionado)}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-tinta-media">
            {item === "difal"
              ? "O DIFAL é calculado pedido a pedido, pelo estado de entrega, e somado por marca. Abaixo, a conta de cada marca e de cada estado."
              : "Cada marca é apurada no regime do seu influencer. Abaixo, cada tributo com a base, a alíquota e o valor — base × alíquota = valor."}
          </p>
        </div>

        <nav className="flex overflow-hidden rounded-lg border border-borda-forte sm:w-fit">
          {(["impostos", "difal"] as const).map((opcao) => (
            <Link
              key={opcao}
              href={endereco(opcao)}
              aria-current={opcao === item ? "page" : undefined}
              className={`flex-1 px-4 py-2 text-center text-sm font-medium ${
                opcao === item ? "bg-tinta text-white" : "bg-superficie text-tinta-media hover:text-tinta"
              }`}
            >
              {opcao === "difal" ? "DIFAL" : "Impostos"}
            </Link>
          ))}
        </nav>

        <div className="grid gap-4 rounded-xl border border-borda bg-superficie px-4 py-5 shadow-[0_1px_2px_rgba(16,24,40,0.05)] sm:grid-cols-3 sm:px-6">
          <NumeroDestaque
            rotulo={item === "difal" ? "DIFAL calculado" : "Impostos calculados (sem DIFAL)"}
            valor={moeda(calculado)}
            apoio={`Soma das ${memoria.marcas.length} marca(s) abaixo`}
            cor="var(--color-imposto)"
          />
          <NumeroDestaque
            rotulo="Valor na pizza"
            valor={moeda(informado ?? calculado)}
            apoio={
              informado === null
                ? "É o calculado: nenhum valor informado no fechamento"
                : `Informado no fechamento · diferença de ${moeda(informado - calculado)}`
            }
          />
          <NumeroDestaque
            rotulo={item === "difal" ? "Base interestadual" : "Base do imposto"}
            valor={moedaRedonda(
              item === "difal"
                ? resultado.difal.baseInterestadual
                : memoria.marcas.reduce((s, m) => s + m.baseDoImposto, 0),
            )}
            apoio={
              item === "difal"
                ? `Venda para fora de ${resultado.difal.ufOrigem}, com o frete`
                : "O recebido das marcas, com o frete cobrado do cliente"
            }
          />
        </div>

        {item === "impostos" ? (
          <>
            {memoria.receitaSemCadastro > 0 && (
              <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm text-naopago">
                {inteiro(memoria.produtosSemCadastro)} produto(s) vendido(s) sem cadastro fiscal,
                com {moeda(memoria.receitaSemCadastro)} de receita: os tributos sobre a receita não
                incidem sobre eles nesta conta.
              </p>
            )}
            {memoria.marcas.map((marca) => (
              <MarcaImpostos key={`${marca.marca}-${marca.nome}`} marca={marca} />
            ))}
          </>
        ) : (
          <DifalPorMarca marcas={memoria.marcas} ufOrigem={resultado.difal.ufOrigem} />
        )}

        <RodapeDemonstracao demonstracao={modoDemonstracao()} />
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------

function MarcaImpostos({ marca }: { marca: MemoriaDaMarca }) {
  return (
    <Cartao
      titulo={`${marca.marca} — ${moeda(marca.total)}`}
      descricao={`${marca.semInfluencer ? "Sem influencer cadastrado" : marca.nome} · ${ROTULO_REGIME[marca.regime]}`}
    >
      {/* De onde vem a base do imposto: o recebido, com o frete dentro. */}
      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <Par rotulo="Faturamento bruto" valor={moeda(marca.bruto)} />
        <Par rotulo="− Não pago, cancelado e reembolsado" valor={moeda(marca.bruto - marca.recebido)} />
        <Par rotulo="= Base do imposto (com frete)" valor={moeda(marca.baseDoImposto)} forte />
        <Par rotulo="dos quais, frete" valor={moeda(marca.frete)} />
      </dl>

      {marca.passos.length === 0 ? (
        <p className="mt-5 text-sm text-tinta-media">Nenhum tributo incidiu nesta marca no mês.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="tabela-ancorada w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
                <th className="py-2.5 pr-4 font-semibold">Tributo</th>
                <th className="py-2.5 pr-4 font-semibold">Como a base foi formada</th>
                <th className="py-2.5 pr-4 text-right font-semibold">Base</th>
                <th className="py-2.5 pr-4 text-right font-semibold">× Alíquota</th>
                <th className="py-2.5 text-right font-semibold">= Valor</th>
              </tr>
            </thead>
            <tbody>
              {marca.passos.map((passo) => (
                <tr key={passo.sigla} className="border-b border-borda align-top">
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-tinta">{passo.sigla}</p>
                    <p className="text-xs text-tinta-fraca">{passo.nome}</p>
                    {!passo.confirmado && (
                      <p className="text-xs font-semibold text-naopago">alíquota a confirmar</p>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-tinta-media">
                    <ComoABase passo={passo} />
                  </td>
                  <td className="numerico py-3 pr-4 text-right text-tinta">{moeda(passo.base)}</td>
                  <td className="numerico py-3 pr-4 text-right text-tinta">{aliquota(passo.aliquota)}</td>
                  <td className="numerico py-3 text-right font-semibold text-tinta">{moeda(passo.valor)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-3 pr-4 font-semibold text-tinta" colSpan={4}>
                  Total da marca (sem DIFAL)
                </td>
                <td className="numerico py-3 text-right text-base font-semibold text-tinta">
                  {moeda(marca.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {marca.foraDaConta.length > 0 && (
        <p className="mt-3 text-xs text-tinta-fraca">
          Fora da conta (inativos ou com alíquota zero no cadastro de impostos):{" "}
          {marca.foraDaConta.join(", ")}.
        </p>
      )}
    </Cartao>
  );
}

function ComoABase({ passo }: { passo: PassoDoImposto }) {
  const o = passo.origem;
  if (o.tipo === "das") {
    return (
      <>
        Guia única do Simples sobre o recebido do mês, com frete. Alíquota efetiva pela receita de 12
        meses ({moeda(o.rbt12)}
        {o.rbt12Projetado ? ", projetada" : ""}): faixa {o.faixa}, nominal {aliquota(o.aliquotaNominal)}.
      </>
    );
  }
  if (o.tipo === "lucro") {
    return (
      <>
        Lucro presumido: {aliquota(o.presuncao)} × recebido {moeda(o.baseDoImposto)}
        {o.deducao > 0 ? ` − dedução de ${moeda(o.deducao)} por mês` : ""}. Vale para a marca
        inteira, não por produto.
      </>
    );
  }
  return (
    <>
      Receita dos produtos com {passo.sigla} marcado ({inteiro(o.produtosMarcados)} de{" "}
      {inteiro(o.produtosDaMarca)} produtos da marca)
      {o.baseDoImposto > 0 ? `: ${percentual(passo.base / o.baseDoImposto)} do recebido` : ""}.
    </>
  );
}

function DifalPorMarca({ marcas, ufOrigem }: { marcas: MemoriaDaMarca[]; ufOrigem: string }) {
  return (
    <>
      <Cartao
        titulo="A conta"
        descricao="Por pedido recebido, pelo estado de entrega."
      >
        <p className="numerico rounded-lg bg-fundo px-4 py-3 text-sm text-tinta">
          DIFAL = valor do pedido (com o frete) × (alíquota interna do destino − alíquota interestadual)
        </p>
        <ul className="mt-3 space-y-1 text-sm leading-relaxed text-tinta-media">
          <li>Venda dentro de {ufOrigem} não tem DIFAL.</li>
          <li>
            Interestadual de 12% a partir de {ufOrigem}; 7% só quando a origem é Sul ou Sudeste
            (exceto ES) e o destino é Norte, Nordeste, Centro-Oeste ou ES.
          </li>
          <li>Marca no Simples Nacional não recolhe DIFAL como remetente: aparece com zero.</li>
          <li>
            A apuração oficial usa base dupla; o painel não faz esse ajuste, e o valor fica um
            pouco abaixo do devido.
          </li>
        </ul>
      </Cartao>

      {marcas.map((marca) => {
        const d = marca.difal;
        const noSimples = marca.regime === "simples_nacional";
        return (
          <Cartao
            key={`${marca.marca}-${marca.nome}`}
            titulo={`${marca.marca} — ${moeda(d.total)}`}
            descricao={`${ROTULO_REGIME[marca.regime]} · base interestadual ${moeda(d.baseInterestadual)} · dentro de ${d.ufOrigem} ${moeda(d.baseInterna)}`}
          >
            {noSimples && (
              <p className="mb-3 text-sm text-tinta-media">
                No Simples Nacional: a distribuição por estado aparece, mas o DIFAL fica zerado.
              </p>
            )}
            {d.porEstado.length === 0 ? (
              <p className="text-sm text-tinta-media">Nenhum pedido recebido no mês.</p>
            ) : (
              <details open={!noSimples}>
                <summary className="cursor-pointer text-sm font-semibold text-tinta">
                  {d.porEstado.length} estado(s) de destino
                </summary>
                <div className="mt-3 overflow-x-auto">
                  <table className="tabela-ancorada w-full min-w-[760px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
                        <th className="py-2.5 pr-4 font-semibold">Estado</th>
                        <th className="py-2.5 pr-4 text-right font-semibold">Pedidos</th>
                        <th className="py-2.5 pr-4 text-right font-semibold">Base (com frete)</th>
                        <th className="py-2.5 pr-4 text-right font-semibold">Interna</th>
                        <th className="py-2.5 pr-4 text-right font-semibold">− Interestadual</th>
                        <th className="py-2.5 pr-4 text-right font-semibold">= Diferença</th>
                        <th className="py-2.5 text-right font-semibold">DIFAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.porEstado.map((linha) => (
                        <tr key={linha.uf} className="border-b border-borda">
                          <td className="py-2.5 pr-4">
                            <span className="font-semibold text-tinta">{linha.uf}</span>{" "}
                            <span className="text-xs text-tinta-fraca">
                              {linha.nome}
                              {linha.interna ? " · venda interna" : ""}
                              {!linha.interna && !linha.confirmado ? " · alíquota a confirmar" : ""}
                            </span>
                          </td>
                          <td className="numerico py-2.5 pr-4 text-right text-tinta-media">
                            {inteiro(linha.pedidos)}
                          </td>
                          <td className="numerico py-2.5 pr-4 text-right text-tinta">{moeda(linha.base)}</td>
                          <td className="numerico py-2.5 pr-4 text-right text-tinta-media">
                            {aliquota(linha.aliquotaInterna)}
                          </td>
                          <td className="numerico py-2.5 pr-4 text-right text-tinta-media">
                            {linha.interna ? "—" : aliquota(linha.aliquotaInterestadual)}
                          </td>
                          <td className="numerico py-2.5 pr-4 text-right text-tinta">
                            {aliquota(linha.diferenca)}
                          </td>
                          <td className="numerico py-2.5 text-right font-semibold text-tinta">
                            {moeda(linha.difal)}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-3 pr-4 font-semibold text-tinta" colSpan={6}>
                          Total da marca
                        </td>
                        <td className="numerico py-3 text-right text-base font-semibold text-tinta">
                          {moeda(d.total)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {d.pedidosSemEstado > 0 && (
                  <p className="mt-2 text-xs text-naopago">
                    {inteiro(d.pedidosSemEstado)} pedido(s) sem estado de entrega (
                    {moeda(d.baseSemEstado)}) ficaram fora da conta.
                  </p>
                )}
              </details>
            )}
          </Cartao>
        );
      })}
    </>
  );
}

function Par({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-tinta-fraca">{rotulo}</dt>
      <dd className={`numerico mt-0.5 ${forte ? "font-semibold text-tinta" : "text-tinta-media"}`}>
        {valor}
      </dd>
    </div>
  );
}
