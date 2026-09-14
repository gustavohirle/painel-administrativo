import type { Metadata } from "next";

import { AssinaturaLida } from "@/components/AssinaturaLida";
import { DecisaoDaOrdem } from "@/components/DecisaoDaOrdem";
import { SeloDemonstracao } from "@/components/Cabecalho";

import { obterFonteDePedidos, obterRepositorioCadastros } from "@/data";
import { modoDemonstracao } from "@/lib/config";
import { calcularSaldos } from "@/lib/estoque";
import { dataCalendario, dataHora, inteiro } from "@/lib/format";
import { filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import {
  EXPLICACAO_SITUACAO,
  ROTULO_SITUACAO,
  unidadesDaOrdem,
  type OrdemFabricacao,
} from "@/types/ordemFabricacao";

export const dynamic = "force-dynamic";

/*
 * Documento assinado nao entra em buscador, e o link nao pode vazar pelo
 * `Referer` quando a pessoa clicar em qualquer coisa daqui. O `noindex` cobre
 * o primeiro; a ausencia de links para fora cobre o segundo.
 */
export const metadata: Metadata = {
  title: "Aprovar ordem de fabricacao",
  robots: { index: false, follow: false },
};

/**
 * Pagina PUBLICA de assinatura. Nao ha `exigirArea` aqui, e e proposital.
 *
 * Quem toca a producao nao tem conta no painel; o que autoriza e o token de
 * 32 bytes no endereco. Em troca, esta tela mostra o MINIMO: produto,
 * quantidade, data e o saldo de estoque dos itens pedidos. Nenhum valor
 * financeiro -- nem preco, nem custo, nem margem -- pelo mesmo criterio da
 * secao 5.13, que ja separa quem esta na fabrica de quem ve dinheiro.
 */
export default async function PaginaAssinar({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: tokenBruto } = await params;
  const token = decodeURIComponent(tokenBruto);

  const repositorio = await obterRepositorioCadastros();
  const ordem = await repositorio.buscarOrdemPorToken(token);

  if (!ordem) return <LinkInvalido />;

  const saldos = await saldoDosItens(ordem);

  return (
    <div className="min-h-screen bg-fundo">
      <header className="border-b border-borda bg-superficie">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tinta text-sm font-bold text-white">
            PA
          </span>
          <span className="text-sm font-semibold tracking-tight text-tinta">
            Ordem de fabricação
          </span>
          <span className="ml-auto">{modoDemonstracao() && <SeloDemonstracao />}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="rounded-xl border border-borda bg-superficie px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h1 className="numerico text-xl font-semibold text-tinta">{ordem.numero}</h1>
            <span className="text-sm text-tinta-media">
              {ROTULO_SITUACAO[ordem.situacao]}
            </span>
          </div>

          <p className="mt-3 text-sm text-tinta-media">
            <strong className="font-semibold text-tinta">{ordem.solicitante.nome}</strong>{" "}
            pediu a fabricação dos itens abaixo em{" "}
            {dataHora(ordem.solicitante.assinadoEm)}, para estarem prontos em{" "}
            <strong className="numerico font-semibold text-tinta">
              {dataCalendario(ordem.dataLancamento)}
            </strong>
            .
          </p>

          {ordem.observacao && (
            <p className="mt-3 rounded-lg bg-fundo px-3 py-2 text-sm text-tinta-media">
              {ordem.observacao}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-borda bg-superficie px-4 py-5 sm:px-6">
          <h2 className="text-base font-semibold text-tinta">O que foi pedido</h2>
          <p className="mt-0.5 text-xs text-tinta-media">
            O estoque atual está ao lado de cada item, para conferir antes de
            aprovar.
          </p>

          <ul className="mt-4 divide-y divide-borda">
            {ordem.itens.map((item) => {
              const saldo = saldos.get(item.chave) ?? null;

              return (
                <li key={item.chave} className="flex flex-wrap gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-tinta">{item.nome}</p>
                    <p className="numerico text-xs text-tinta-fraca">
                      {item.sku ?? "sem SKU"}
                      {" -- "}
                      {saldo === null
                        ? "sem contagem de estoque"
                        : `${inteiro(saldo)} em estoque hoje`}
                    </p>
                  </div>
                  <p className="numerico shrink-0 text-lg font-semibold text-tinta">
                    {inteiro(item.quantidade)} un
                  </p>
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex items-baseline justify-between border-t-2 border-borda-forte pt-3">
            <span className="text-sm font-semibold text-tinta">Total a fabricar</span>
            <span className="numerico text-lg font-semibold text-tinta">
              {inteiro(unidadesDaOrdem(ordem))} un
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-borda bg-superficie px-4 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
            Quem pediu
          </p>
          <div className="mt-2 text-tinta">
            <AssinaturaLida
              tracos={ordem.solicitante.tracos}
              altura={52}
              rotulo={`Assinatura de ${ordem.solicitante.nome}`}
            />
          </div>
          <p className="mt-1 border-t border-borda pt-2 text-sm font-semibold text-tinta">
            {ordem.solicitante.nome}
          </p>
          <p className="text-xs text-tinta-fraca">
            Assinado em {dataHora(ordem.solicitante.assinadoEm)}
          </p>
        </div>

        {ordem.situacao === "aguardando" ? (
          <div className="rounded-xl border border-borda-forte bg-superficie px-4 py-5 sm:px-6">
            <h2 className="text-base font-semibold text-tinta">Sua resposta</h2>
            <p className="mb-4 mt-0.5 text-sm text-tinta-media">
              Ao assinar, você confirma que recebeu o pedido e que a fabricação
              vai acontecer no prazo acima. Sua assinatura e a data entram no
              mesmo documento que a de quem pediu.
            </p>
            <DecisaoDaOrdem token={token} />
          </div>
        ) : (
          <Fechada ordem={ordem} token={token} />
        )}

        <p className="px-1 pb-8 text-xs text-tinta-fraca">
          Esta página abre por um link privado. Quem tem o link pode assinar,
          então repasse só para quem precisa responder.
        </p>
      </main>
    </div>
  );
}

function Fechada({ ordem, token }: { ordem: OrdemFabricacao; token: string }) {
  return (
    <div className="rounded-xl border border-borda bg-superficie px-4 py-5 sm:px-6">
      <h2 className="text-base font-semibold text-tinta">
        {ROTULO_SITUACAO[ordem.situacao]}
      </h2>
      <p className="mt-1 text-sm text-tinta-media">
        {EXPLICACAO_SITUACAO[ordem.situacao]}
      </p>

      {ordem.aprovador && (
        <div className="mt-4 border-t border-borda pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
            Quem aprovou
          </p>
          <div className="mt-2 text-tinta">
            <AssinaturaLida
              tracos={ordem.aprovador.tracos}
              altura={52}
              rotulo={`Assinatura de ${ordem.aprovador.nome}`}
            />
          </div>
          <p className="mt-1 border-t border-borda pt-2 text-sm font-semibold text-tinta">
            {ordem.aprovador.nome}
          </p>
          <p className="text-xs text-tinta-fraca">
            Assinado em {dataHora(ordem.aprovador.assinadoEm)}
          </p>
        </div>
      )}

      {ordem.motivoRecusa && (
        <p className="mt-4 rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-2 text-sm text-naopago">
          {ordem.motivoRecusa}
        </p>
      )}

      {ordem.documento && (
        <a
          href={`/assinar/${encodeURIComponent(token)}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="mt-5 block rounded-lg bg-tinta px-4 py-3 text-center text-base font-semibold text-white"
        >
          Abrir o PDF assinado
        </a>
      )}
    </div>
  );
}

function LinkInvalido() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-fundo px-4">
      <div className="max-w-md rounded-xl border border-borda bg-superficie px-6 py-8 text-center">
        <p className="text-lg font-semibold text-tinta">Este link não vale mais</p>
        <p className="mt-2 text-sm text-tinta-media">
          Ou o endereço foi copiado pela metade, ou a ordem foi cancelada. Peça
          um link novo para quem enviou.
        </p>
      </div>
    </div>
  );
}

/**
 * Saldo dos itens pedidos, so para conferencia visual.
 *
 * E o "ele checa o estoque" do pedido original: quem aprova precisa saber
 * quanto ja existe antes de mandar produzir mais. Nao entra em conta nenhuma,
 * e a ordem nao desconta nada daqui.
 */
async function saldoDosItens(ordem: OrdemFabricacao): Promise<Map<string, number | null>> {
  const fonte = obterFonteDePedidos();
  const repositorio = await obterRepositorioCadastros();

  const [pedidos, produtos, contagens] = await Promise.all([
    fonte.listarPedidos(),
    repositorio.listarProdutos(),
    repositorio.listarContagens(),
  ]);

  const meses = mesesDisponiveis(pedidos);
  const mes = meses[0] ?? "";

  const saldos = calcularSaldos(produtos, contagens, {
    pedidosDoPeriodo: filtrarPorMes(pedidos, mes),
    pedidosHistorico: pedidos,
    diasDoPeriodo: 30,
  });

  const pedidas = new Set(ordem.itens.map((i) => i.chave));
  return new Map(
    saldos.filter((s) => pedidas.has(s.chave)).map((s) => [s.chave, s.saldoAtual]),
  );
}
