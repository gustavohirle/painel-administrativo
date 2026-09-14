"use client";

import { Fragment, useActionState, useEffect, useState } from "react";

import {
  removerDespesaInfluencer,
  salvarDespesaInfluencer,
} from "@/app/influencers/acoesDespesas";
import { dataCalendario, mesAno, moeda, percentual } from "@/lib/format";
import { ESTADO_INICIAL } from "@/types/formulario";
import {
  CATEGORIAS_DESPESA,
  idDeOrigem,
  ROTULO_CATEGORIA_DESPESA,
  type DespesaAtribuida,
  type DespesaInfluencer,
} from "@/types/dominio";

export interface ComissaoDoMes {
  valor: number;
  valorBase: number;
  percentual: number;
  /** Rotulo da base do contrato, ex.: "Faturamento bruto". */
  rotuloBase: string;
}

interface GestaoDespesasInfluencerProps {
  influencerId: string;
  nomeInfluencer: string;
  /** "aaaa-mm" do mes aberto. */
  mes: string;
  /** `null` quando o contrato esta inativo ou a marca nao vendeu no mes. */
  comissao: ComissaoDoMes | null;
  /** O que escrever no lugar da comissao quando ela e `null`. */
  motivoSemComissao: string;
  /** Despesas deste influencer no mes aberto, com a parte das compartilhadas. */
  despesas: DespesaAtribuida[];
  /** Data sugerida para despesa nova. Vem do servidor para nao haver
   *  divergencia de fuso entre o HTML e a hidratacao. */
  dataPadrao: string;
}

/**
 * O registro gravado por tras de uma linha da grade. Numa compartilhada, a
 * linha mostra a PARTE deste influencer, mas editar mexe no total, que e o que
 * foi cadastrado -- e a divisao se refaz sozinha para todos.
 */
function registroGravado(despesa: DespesaAtribuida): DespesaInfluencer {
  return {
    id: idDeOrigem(despesa),
    influencerId: despesa.rateio ? null : despesa.influencerId,
    data: despesa.data,
    categoria: despesa.categoria,
    descricao: despesa.descricao,
    valor: despesa.rateio ? despesa.rateio.total : despesa.valor,
    atualizadoEm: despesa.atualizadoEm,
  };
}

/**
 * Grade de custos de um influencer no mes.
 *
 * A primeira linha e SEMPRE a comissao, e ela nao se edita aqui: e calculada
 * dos pedidos do mes e do contrato (secao 5.2), e gravar o valor faria a grade
 * mostrar um numero velho quando as vendas mudassem. Para mudar a comissao,
 * muda-se o contrato. As linhas de baixo sao as despesas, essas editaveis, e
 * tudo junto sai do lucro operacional.
 *
 * Despesa compartilhada aparece com a parte deste influencer e a fracao que
 * coube a ele. A parte segue a mesma logica da comissao: e calculada, nao
 * gravada.
 *
 * E tabela de cadastro, entao continua tabela no celular, com a coluna ancorada
 * e o formulario de edicao na linha de baixo (secao 2.1).
 */
export function GestaoDespesasInfluencer({
  influencerId,
  nomeInfluencer,
  mes,
  comissao,
  motivoSemComissao,
  despesas,
  dataPadrao,
}: GestaoDespesasInfluencerProps) {
  const [novaAberta, setNovaAberta] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");

  const totalDespesas = despesas.reduce((soma, d) => soma + d.valor, 0);
  const total = totalDespesas + (comissao?.valor ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-tinta-media">
          A primeira linha é a comissão do contrato, calculada com os pedidos do
          mês: ela não se edita aqui e acompanha as vendas sozinha. As outras são
          as despesas. Numa despesa compartilhada, como o operacional, aparece a
          parte deste influencer, proporcional ao faturamento sem frete da marca —
          ela se refaz sozinha quando as vendas mudam. Tudo isso sai do lucro
          operacional do painel.
        </p>
        <button
          type="button"
          onClick={() => {
            setNovaAberta((v) => !v);
            setEditando(null);
            setAviso("");
          }}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white"
        >
          {novaAberta ? "Fechar" : "Nova despesa"}
        </button>
      </div>

      {aviso && (
        <p className="rounded-lg bg-fundo px-3 py-2 text-sm text-real">{aviso}</p>
      )}

      {novaAberta && (
        <FormularioDespesa
          influencerId={influencerId}
          nomeInfluencer={nomeInfluencer}
          mes={mes}
          despesa={null}
          dataPadrao={dataPadrao}
          aoConcluir={(mensagem) => {
            setNovaAberta(false);
            setAviso(mensagem);
          }}
          aoFechar={() => setNovaAberta(false)}
        />
      )}

      <div className="tabela-ancorada overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-2.5 pr-4 font-semibold">Descrição</th>
              <th className="py-2.5 pr-4 font-semibold">Categoria</th>
              <th className="py-2.5 pr-4 font-semibold">Data</th>
              <th className="py-2.5 pr-4 text-right font-semibold">Valor</th>
              <th className="py-2.5 font-semibold">&nbsp;</th>
            </tr>
          </thead>

          <tbody>
            <tr className="border-b border-borda bg-fundo">
              <td className="py-3 pr-4">
                <span className="font-semibold text-tinta">Comissão do contrato</span>
                <span className="mt-0.5 block text-xs text-tinta-fraca">
                  {comissao
                    ? `${comissao.percentual.toLocaleString("pt-BR")}% sobre ${moeda(comissao.valorBase)} (${comissao.rotuloBase})`
                    : motivoSemComissao}
                </span>
              </td>
              <td className="py-3 pr-4">
                <span className="rounded-full border border-borda-forte px-2 py-0.5 text-xs font-semibold text-tinta-media">
                  Comissão
                </span>
              </td>
              <td className="py-3 pr-4 text-tinta-media">{mesAno(mes)}</td>
              <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                {comissao ? moeda(comissao.valor) : "—"}
              </td>
              <td
                className="py-3 text-right text-xs text-tinta-fraca"
                title="Calculada com os pedidos do mês e o contrato. Para mudar, edite o contrato na visão geral."
              >
                automática
              </td>
            </tr>

            {despesas.map((despesa) => {
              const origem = idDeOrigem(despesa);
              const aberta = editando === origem;
              const rateio = despesa.rateio;

              return (
                <Fragment key={despesa.id}>
                  <tr className="border-b border-borda">
                    <td className="py-3 pr-4">
                      <span className="font-medium text-tinta">{despesa.descricao}</span>
                      {rateio && (
                        <span className="mt-0.5 block text-xs text-tinta-fraca">
                          {percentual(rateio.fracao)} de {moeda(rateio.total)}, pelo
                          faturamento sem frete
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-tinta-media">
                      {ROTULO_CATEGORIA_DESPESA[despesa.categoria]}
                      {rateio && (
                        <span className="ml-2 rounded-full border border-borda-forte px-2 py-0.5 text-xs font-semibold text-tinta-media">
                          Compartilhada
                        </span>
                      )}
                    </td>
                    <td className="numerico py-3 pr-4 text-tinta-media">
                      {dataCalendario(despesa.data)}
                    </td>
                    <td className="numerico py-3 pr-4 text-right font-semibold text-tinta">
                      {moeda(despesa.valor)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditando(aberta ? null : origem);
                            setNovaAberta(false);
                            setAviso("");
                          }}
                          className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta"
                        >
                          {aberta ? "Fechar" : "Editar"}
                        </button>
                        <BotaoRemover id={origem} compartilhada={rateio !== null} />
                      </div>
                    </td>
                  </tr>

                  {aberta && (
                    <tr>
                      <td colSpan={5} className="p-0 pb-4">
                        <div className="linha-de-edicao">
                          <FormularioDespesa
                            influencerId={influencerId}
                            nomeInfluencer={nomeInfluencer}
                            mes={mes}
                            despesa={registroGravado(despesa)}
                            dataPadrao={despesa.data}
                            aoConcluir={(mensagem) => {
                              setEditando(null);
                              setAviso(mensagem);
                            }}
                            aoFechar={() => setEditando(null)}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}

            {despesas.length === 0 && (
              <tr className="border-b border-borda">
                <td colSpan={5} className="py-6 text-sm text-tinta-media">
                  Nenhuma despesa para {nomeInfluencer} em {mesAno(mes)}.
                </td>
              </tr>
            )}
          </tbody>

          <tfoot>
            <tr className="border-t-2 border-borda-forte font-semibold text-tinta">
              <td className="py-3 pr-4">Custo total no mês</td>
              <td className="py-3 pr-4 text-xs font-normal text-tinta-media">
                comissão + {despesas.length} despesa(s)
              </td>
              <td className="py-3 pr-4" />
              <td className="numerico py-3 pr-4 text-right">{moeda(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * Remover em dois passos, sem `window.confirm`.
 *
 * O dialogo nativo do navegador some atras de outras abas no celular e quebra
 * a auditoria automatizada, que nao sabe responder a ele. Um segundo botao na
 * propria linha faz o mesmo papel: ninguem apaga uma despesa com um toque so.
 * Na compartilhada o botao diz que sai de todos, porque sai.
 */
function BotaoRemover({ id, compartilhada }: { id: string; compartilhada: boolean }) {
  const [estado, acao, pendente] = useActionState(removerDespesaInfluencer, ESTADO_INICIAL);
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta-media"
      >
        Remover
      </button>
    );
  }

  return (
    <form action={acao} className="flex items-center gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pendente}
        className="rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-1.5 text-sm font-semibold text-naopago disabled:opacity-60"
      >
        {pendente ? "Removendo..." : compartilhada ? "Remover de todos" : "Confirmar"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmando(false)}
        className="px-2 py-1.5 text-sm text-tinta-media"
      >
        Não
      </button>
      {estado.mensagem && !estado.ok && (
        <span className="text-xs text-naopago">{estado.mensagem}</span>
      )}
    </form>
  );
}

function FormularioDespesa({
  influencerId,
  nomeInfluencer,
  mes,
  despesa,
  dataPadrao,
  aoConcluir,
  aoFechar,
}: {
  influencerId: string;
  nomeInfluencer: string;
  mes: string;
  /** Registro gravado; numa compartilhada, com o valor TOTAL. */
  despesa: DespesaInfluencer | null;
  dataPadrao: string;
  aoConcluir: (mensagem: string) => void;
  aoFechar: () => void;
}) {
  const [estado, acao, pendente] = useActionState(salvarDespesaInfluencer, ESTADO_INICIAL);
  const [compartilhada, setCompartilhada] = useState(despesa ? despesa.influencerId === null : false);

  // So o resultado da action dispara o fechamento; a funcao de callback muda a
  // cada render e, como dependencia, faria o efeito rodar sem motivo.
  useEffect(() => {
    if (estado.ok) aoConcluir(estado.mensagem);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  const valorInicial = despesa
    ? despesa.valor.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false,
      })
    : "";

  return (
    <form
      action={acao}
      className="rounded-lg border border-borda-forte bg-superficie px-4 py-4 sm:px-5"
    >
      <input type="hidden" name="influencerId" value={influencerId} />
      <input type="hidden" name="mes" value={mes} />
      {despesa && <input type="hidden" name="id" value={despesa.id} />}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-semibold text-tinta">
          {despesa ? "Editar despesa" : "Nova despesa"}
        </p>
        <button
          type="button"
          onClick={aoFechar}
          className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm text-tinta-media"
        >
          Fechar
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-tinta">Descrição</span>
          <input
            name="descricao"
            defaultValue={despesa?.descricao ?? ""}
            placeholder="Operacional, kit enviado para gravação, passagem, cachê..."
            className="w-full rounded-lg border border-borda-forte px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">Categoria</span>
          <select
            name="categoria"
            defaultValue={despesa?.categoria ?? "produto_enviado"}
            className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
          >
            {CATEGORIAS_DESPESA.map((categoria) => (
              <option key={categoria} value={categoria}>
                {ROTULO_CATEGORIA_DESPESA[categoria]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">Data</span>
          <input
            type="date"
            name="data"
            defaultValue={dataPadrao}
            className="w-full rounded-lg border border-borda-forte px-3 py-2 text-sm"
          />
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-borda px-3 py-3 sm:col-span-2">
          <input
            type="checkbox"
            name="compartilhada"
            checked={compartilhada}
            onChange={(e) => setCompartilhada(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0"
          />
          <span>
            <span className="block text-sm font-medium text-tinta">Despesa compartilhada</span>
            <span className="mt-0.5 block text-xs text-tinta-media">
              {compartilhada
                ? "Informe o valor total. Ele é dividido entre todos os influencers ativos, proporcional ao faturamento sem frete de cada marca no mês, e a divisão se refaz sozinha quando as vendas mudam."
                : `Desmarcada, a despesa é só de ${nomeInfluencer}.`}
            </span>
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            {compartilhada ? "Valor total a dividir (R$)" : "Valor (R$)"}
          </span>
          <input
            name="valor"
            inputMode="decimal"
            defaultValue={valorInicial}
            placeholder="0,00"
            className="w-full rounded-lg border border-borda-forte px-3 py-2 text-right text-lg"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendente}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {pendente ? "Salvando..." : despesa ? "Salvar alterações" : "Cadastrar despesa"}
        </button>
        {estado.mensagem && !estado.ok && (
          <span className="text-sm text-naopago">{estado.mensagem}</span>
        )}
      </div>
    </form>
  );
}
