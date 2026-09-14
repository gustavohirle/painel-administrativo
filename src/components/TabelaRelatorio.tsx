import { Fragment } from "react";

import { inteiro, mesAno, moeda, percentual, rotuloMetodo } from "@/lib/format";
import type { LinhaRelatorio, ResultadoRelatorio, Valores } from "@/lib/relatorios";
import {
  EXPLICACAO_METRICA,
  FORMATO_METRICA,
  ROTULO_DIMENSAO,
  ROTULO_METRICA,
  type ConfiguracaoRelatorio,
  type Metrica,
} from "@/types/relatorio";

/**
 * Celula vazia.
 *
 * Um traco, nunca "R$ 0,00". Zero e uma afirmacao -- diz que a conta foi feita
 * e deu nada. O traco diz que a conta nao existe ali, e o rodape explica por
 * que. A diferenca importa quando o numero e comissao devida.
 */
const VAZIO = "--";

function formatar(valor: number | null | undefined, metrica: Metrica): string {
  if (valor === null || valor === undefined) return VAZIO;
  switch (FORMATO_METRICA[metrica]) {
    case "moeda": return moeda(valor);
    case "inteiro": return inteiro(valor);
    case "percentual": return percentual(valor);
  }
}

/** Negativo em vermelho: prejuizo nao pode passar despercebido numa lista. */
function corDoValor(valor: number | null | undefined): string | undefined {
  return typeof valor === "number" && valor < 0 ? "var(--color-naopago)" : undefined;
}

/**
 * Junta as colunas recusadas pelo MESMO motivo numa nota so.
 *
 * Quatro colunas caem juntas quando um filtro corta a marca, e repetir a mesma
 * explicacao quatro vezes tomava um terco da folha impressa -- o leitor para
 * de ler na segunda e perde as notas seguintes, que sao diferentes.
 */
function agruparPorMotivo(
  recusadas: Array<{ metrica: Metrica; motivo: string }>,
): Array<{ motivo: string; metricas: Metrica[] }> {
  const porMotivo = new Map<string, Metrica[]>();

  for (const { metrica, motivo } of recusadas) {
    const atual = porMotivo.get(motivo);
    if (atual) atual.push(metrica);
    else porMotivo.set(motivo, [metrica]);
  }

  return [...porMotivo.entries()].map(([motivo, metricas]) => ({ motivo, metricas }));
}

/** Filtros ativos em texto. Lista vazia quando nada foi filtrado. */
function resumoDosFiltros(configuracao: ConfiguracaoRelatorio): string[] {
  const { filtros } = configuracao;
  const resumo: string[] = [];

  if (filtros.marcas.length) resumo.push(`Marcas: ${filtros.marcas.join(", ")}`);
  if (filtros.estados.length) resumo.push(`Estados: ${filtros.estados.join(", ")}`);
  if (filtros.pagamentos.length) {
    resumo.push(`Pagamento: ${filtros.pagamentos.map(rotuloMetodo).join(", ")}`);
  }

  return resumo;
}

interface TabelaRelatorioProps {
  resultado: ResultadoRelatorio;
  configuracao: ConfiguracaoRelatorio;
}

export function TabelaRelatorio({ resultado, configuracao }: TabelaRelatorioProps) {
  const { linhas, metricas, total, recusadas, avisos } = resultado;

  if (metricas.length === 0) {
    return (
      <div className="rounded-xl border border-borda bg-superficie px-6 py-8 text-center">
        <p className="text-base font-medium text-tinta">
          Nenhuma coluna sobrou nesta combinação.
        </p>
        <p className="mt-1 text-sm text-tinta-media">
          Marque ao menos uma métrica que valha para {ROTULO_DIMENSAO[configuracao.agruparPor].toLowerCase()}.
        </p>
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="rounded-xl border border-borda bg-superficie px-6 py-8 text-center">
        <p className="text-base font-medium text-tinta">
          Nenhum pedido no período escolhido.
        </p>
        <p className="mt-1 text-sm text-tinta-media">
          Amplie o intervalo de meses ou remova algum filtro.
        </p>
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-borda bg-superficie shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <header className="border-b border-borda px-4 py-4 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight text-tinta">
          {ROTULO_DIMENSAO[configuracao.agruparPor]}
          {configuracao.depoisPor && `, depois ${ROTULO_DIMENSAO[configuracao.depoisPor].toLowerCase()}`}
        </h2>
        <p className="mt-0.5 text-sm text-tinta-media">
          {inteiro(resultado.pedidosNoPeriodo)} pedidos
          {resultado.periodo.inicio &&
            ` de ${mesAno(resultado.periodo.inicio)} a ${mesAno(resultado.periodo.fim)}`}
          , em {inteiro(linhas.length)} linha(s).
        </p>

        {/*
          Periodo e filtros ficam escritos no proprio relatorio.
          Impresso, ele vira um documento que sai da tela e vai para outra
          pessoa -- e "45.024 pedidos no periodo" sem dizer QUAL periodo nem
          sobre quais marcas e um numero que o leitor nao tem como conferir.
        */}
        {resumoDosFiltros(configuracao).length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tinta-media">
            {resumoDosFiltros(configuracao).map((filtro) => (
              <li key={filtro}>{filtro}</li>
            ))}
          </ul>
        )}
      </header>

      {/* Celular: cartoes empilhados. A tabela larga so aparece do sm para cima. */}
      <div className="cartoes-do-celular sm:hidden">
        {linhas.map((linha) => (
          <CartaoLinha
            key={linha.chave}
            linha={linha}
            metricas={metricas}
            destaque={configuracao.ordenarPor}
          />
        ))}
        <CartaoLinha
          linha={{ chave: "total", rotulo: "Total do período", valores: total, filhas: [] }}
          metricas={metricas}
          destaque={configuracao.ordenarPor}
          ehTotal
        />
      </div>

      <div className="tabela-larga hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda text-left">
              <th className="sticky left-0 z-10 bg-superficie px-4 py-3 font-semibold text-tinta sm:px-6">
                {ROTULO_DIMENSAO[configuracao.agruparPor]}
              </th>
              {metricas.map((metrica) => (
                <th
                  key={metrica}
                  title={EXPLICACAO_METRICA[metrica]}
                  className="whitespace-nowrap px-4 py-3 text-right font-semibold text-tinta"
                >
                  {ROTULO_METRICA[metrica]}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {linhas.map((linha) => (
              <Fragment key={linha.chave}>
                <tr className="border-b border-borda/60">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-superficie px-4 py-3 text-left font-medium text-tinta sm:px-6"
                  >
                    {linha.rotulo}
                  </th>
                  {metricas.map((metrica) => (
                    <td
                      key={metrica}
                      className="numerico whitespace-nowrap px-4 py-3 text-right text-tinta"
                      style={{ color: corDoValor(linha.valores[metrica]) }}
                    >
                      {formatar(linha.valores[metrica], metrica)}
                    </td>
                  ))}
                </tr>

                {linha.filhas.map((filha) => (
                  <tr key={`${linha.chave}-${filha.chave}`} className="border-b border-borda/40">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-superficie py-2 pl-8 pr-4 text-left font-normal text-tinta-media sm:pl-12 sm:pr-6"
                    >
                      {filha.rotulo}
                    </th>
                    {metricas.map((metrica) => (
                      <td
                        key={metrica}
                        className="numerico whitespace-nowrap px-4 py-2 text-right text-tinta-media"
                        style={{ color: corDoValor(filha.valores[metrica]) }}
                      >
                        {formatar(filha.valores[metrica], metrica)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-borda-forte">
              <th className="sticky left-0 z-10 bg-superficie px-4 py-3 text-left font-semibold text-tinta sm:px-6">
                Total do período
              </th>
              {metricas.map((metrica) => (
                <td
                  key={metrica}
                  className="numerico whitespace-nowrap px-4 py-3 text-right font-semibold text-tinta"
                  style={{ color: corDoValor(total[metrica]) }}
                >
                  {formatar(total[metrica], metrica)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {(recusadas.length > 0 || avisos.length > 0) && (
        <footer className="space-y-2 border-t border-borda px-4 py-4 text-xs text-tinta-media sm:px-6">
          {agruparPorMotivo(recusadas).map(({ motivo, metricas }) => (
            <p key={motivo}>
              <strong className="font-semibold text-tinta">
                {metricas.map((m) => ROTULO_METRICA[m]).join(", ")}{" "}
                {metricas.length > 1 ? "ficaram" : "ficou"} de fora:
              </strong>{" "}
              {motivo}
            </p>
          ))}
          {avisos.map((aviso) => (
            <p key={aviso}>{aviso}</p>
          ))}
        </footer>
      )}
    </section>
  );
}

/**
 * Uma linha do relatorio como cartao, para telas estreitas.
 *
 * Arrastar uma tabela de 8 colunas no telefone esconde justamente as colunas
 * da direita, que sao as que carregam a conclusao (lucro, diferenca). Empilhado
 * o leitor ve tudo de uma linha sem arrastar nada.
 */
function CartaoLinha({
  linha,
  metricas,
  destaque,
  ehTotal = false,
}: {
  linha: LinhaRelatorio;
  metricas: Metrica[];
  destaque: Metrica;
  ehTotal?: boolean;
}) {
  return (
    <div
      className={`border-b border-borda px-4 py-4 ${ehTotal ? "bg-fundo" : ""}`}
    >
      <p className={`text-sm ${ehTotal ? "font-semibold" : "font-medium"} text-tinta`}>
        {linha.rotulo}
      </p>

      <dl className="mt-2 space-y-1">
        {metricas.map((metrica) => (
          <div key={metrica} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-tinta-media">{ROTULO_METRICA[metrica]}</dt>
            <dd
              className={`numerico text-right text-sm ${
                metrica === destaque ? "font-semibold text-tinta" : "text-tinta"
              }`}
              style={{ color: corDoValor(linha.valores[metrica]) }}
            >
              {formatar(linha.valores[metrica], metrica)}
            </dd>
          </div>
        ))}
      </dl>

      {linha.filhas.length > 0 && (
        <div className="mt-3 space-y-2 border-l-2 border-borda pl-3">
          {linha.filhas.map((filha) => (
            <div key={filha.chave}>
              <p className="text-xs font-medium text-tinta-media">{filha.rotulo}</p>
              <dl className="mt-0.5 space-y-0.5">
                {metricas.map((metrica) => (
                  <div key={metrica} className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-tinta-fraca">{ROTULO_METRICA[metrica]}</dt>
                    <dd
                      className="numerico text-xs text-tinta-media"
                      style={{ color: corDoValor(filha.valores[metrica]) }}
                    >
                      {formatar(filha.valores[metrica], metrica)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type { Valores };
