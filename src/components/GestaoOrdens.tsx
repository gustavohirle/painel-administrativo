"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";

import {
  assinarEtapa,
  cancelarOrdem,
  criarOrdemDeFabricacao,
  removerOrdem,
  retomarOrdem,
} from "@/app/ordens/actions";
import { LinhaDoTempoDaOrdem } from "@/components/LinhaDoTempoDaOrdem";
import { QuadroAssinatura } from "@/components/QuadroAssinatura";
import { dataCalendario, dataHora, inteiro } from "@/lib/format";
import { conferenciaAprova, motivosDaConferencia, type OrdemNaFila } from "@/lib/processoOrdem";
import { ESTADO_INICIAL } from "@/types/formulario";
import {
  ITENS_DE_CONFERENCIA,
  MAXIMO_DE_ITENS,
  PERGUNTA_DE_CONFERENCIA,
  ROTULO_ETAPA,
  ROTULO_SITUACAO,
  passoDaEtapa,
  unidadesDaOrdem,
  type EtapaOrdem,
  type OrdemFabricacao,
} from "@/types/ordemFabricacao";

export interface OpcaoProduto {
  chave: string;
  nome: string;
  sku: string | null;
  /** Saldo atual, para quem pede ja saber se falta mesmo. `null` sem contagem. */
  saldo: number | null;
  /** Dias de cobertura no ritmo do mes. `null` quando nao da para medir. */
  coberturaDias: number | null;
}

interface GestaoOrdensProps {
  fila: OrdemNaFila[];
  produtos: OpcaoProduto[];
  /** Nome de quem esta logado, para pre-preencher a assinatura. */
  nomeDoUsuario: string;
  ehAdministrador: boolean;
  /** "aaaa-mm-dd" em Brasilia, vindo do servidor. */
  hoje: string;
  abertaPorPadrao: string | null;
  totalNaBase: number;
}

const CAMPO =
  "w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta";

export function GestaoOrdens({
  fila,
  produtos,
  nomeDoUsuario,
  ehAdministrador,
  hoje,
  abertaPorPadrao,
  totalNaBase,
}: GestaoOrdensProps) {
  const [novaAberta, setNovaAberta] = useState(false);
  /*
   * Uma ordem por vez, e so a que a pessoa abriu.
   *
   * Nada abre sozinho: com a fila ordenada, a primeira aberta automaticamente
   * seria quase sempre a certa -- mas "quase sempre" numa tela que assina
   * documento e pior que um clique.
   */
  const [abertaId, setAbertaId] = useState<string | null>(abertaPorPadrao);
  const [aviso, setAviso] = useState<string | null>(null);

  /*
   * Assinou: FECHA o cartao.
   *
   * Duas razoes, e a segunda e um defeito que so aparece usando. A ordem
   * andou, entao o que estava na tela nao vale mais -- e, deixando o cartao
   * aberto, o quadro de assinatura nao e desmontado e chega na etapa seguinte
   * com o traco anterior ainda desenhado. Fechar resolve os dois: o proximo
   * passo se abre com um clique, e o quadro nasce limpo.
   */
  // `useCallback` porque ela e dependencia de um efeito la embaixo: recriada a
  // cada render, o efeito rodaria de novo a cada render.
  const concluir = useCallback((mensagem: string) => {
    setAbertaId(null);
    setAviso(mensagem);
  }, []);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-tinta-media">
          Cada etapa é assinada por quem a cumpriu, e a assinatura fica no
          documento. A ordem só anda quando alguém assina.
        </p>
        {ehAdministrador && (
          <button
            type="button"
            onClick={() => setNovaAberta((v) => !v)}
            className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white"
          >
            {novaAberta ? "Fechar" : "Abrir ordem de fabricação"}
          </button>
        )}
      </div>

      {novaAberta && (
        <FormularioDeOrdem
          produtos={produtos}
          nomeDoUsuario={nomeDoUsuario}
          hoje={hoje}
          aoConcluir={() => setNovaAberta(false)}
        />
      )}

      {/* O aviso fica AQUI, e nao dentro do cartao: o cartao fechou. */}
      {aviso && (
        <p className="mb-4 rounded-lg border border-borda bg-real-claro px-4 py-3 text-sm text-real">
          {aviso}
        </p>
      )}

      {fila.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda-forte px-4 py-8 text-center text-sm text-tinta-media">
          {totalNaBase === 0
            ? "Nenhuma ordem de fabricação ainda."
            : "Nenhuma ordem para mostrar."}
        </p>
      ) : (
        <ul className="space-y-3">
          {fila.map((item) => (
            <CartaoDeOrdem
              key={item.ordem.id}
              item={item}
              aberta={abertaId === item.ordem.id}
              aoAbrir={() => {
                setAviso(null);
                setAbertaId((atual) => (atual === item.ordem.id ? null : item.ordem.id));
              }}
              aoConcluir={concluir}
              nomeDoUsuario={nomeDoUsuario}
              ehAdministrador={ehAdministrador}
              hoje={hoje}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Um cartao da fila
// ---------------------------------------------------------------------------

/** "faltam 9 dias", "hoje", "3 dias atrasada". */
function prazoEmTexto(dias: number): string {
  if (dias === 0) return "o lançamento é hoje";
  if (dias > 0) return `faltam ${dias} dia(s)`;
  return `${Math.abs(dias)} dia(s) atrasada`;
}

function CartaoDeOrdem({
  item,
  aberta,
  aoAbrir,
  aoConcluir,
  nomeDoUsuario,
  ehAdministrador,
  hoje,
}: {
  item: OrdemNaFila;
  aberta: boolean;
  aoAbrir: () => void;
  aoConcluir: (mensagem: string) => void;
  nomeDoUsuario: string;
  ehAdministrador: boolean;
  hoje: string;
}) {
  const { ordem, minha, dias } = item;
  const emAberto = ordem.situacao === "andamento" || ordem.situacao === "revisao";
  const atrasada = emAberto && dias < 0;

  return (
    <li
      className={`overflow-hidden rounded-xl border bg-superficie shadow-[0_1px_2px_rgba(16,24,40,0.05)] ${
        minha ? "border-tinta" : "border-borda"
      }`}
    >
      <button
        type="button"
        onClick={aoAbrir}
        className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 text-left hover:bg-fundo sm:px-6"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="numerico text-sm font-semibold text-tinta">{ordem.numero}</span>
            {minha && (
              <span className="rounded-full bg-tinta px-2 py-0.5 text-xs font-semibold text-white">
                com você
              </span>
            )}
            {atrasada && (
              <span className="rounded-full border border-alerta-borda bg-alerta-fundo px-2 py-0.5 text-xs font-semibold text-naopago">
                atrasada
              </span>
            )}
            {ordem.situacao === "revisao" && (
              <span className="rounded-full border border-alerta-borda bg-alerta-fundo px-2 py-0.5 text-xs font-semibold text-naopago">
                voltou para o administrador
              </span>
            )}
          </span>
          <span className="mt-1 block text-sm text-tinta-media">
            {ordem.etapaAtual && emAberto
              ? `Etapa: ${ROTULO_ETAPA[ordem.etapaAtual]}`
              : ROTULO_SITUACAO[ordem.situacao]}
            {" · "}
            {inteiro(unidadesDaOrdem(ordem))} un em {ordem.itens.length} item(ns)
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-sm font-semibold text-tinta">
            {dataCalendario(ordem.dataLancamento)}
          </span>
          <span className={`block text-xs ${atrasada ? "text-naopago" : "text-tinta-media"}`}>
            {emAberto ? prazoEmTexto(dias) : "encerrada"}
          </span>
        </span>

        <span className="shrink-0 text-sm font-medium text-tinta-media">
          {aberta ? "fechar" : "abrir"}
        </span>
      </button>

      {aberta && (
        <DetalheDaOrdem
          ordem={ordem}
          minha={minha}
          aoConcluir={aoConcluir}
          nomeDoUsuario={nomeDoUsuario}
          ehAdministrador={ehAdministrador}
          hoje={hoje}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// A ordem aberta
// ---------------------------------------------------------------------------

function DetalheDaOrdem({
  ordem,
  minha,
  aoConcluir,
  nomeDoUsuario,
  ehAdministrador,
  hoje,
}: {
  ordem: OrdemFabricacao;
  minha: boolean;
  aoConcluir: (mensagem: string) => void;
  nomeDoUsuario: string;
  ehAdministrador: boolean;
  hoje: string;
}) {
  const conferencia = passoDaEtapa(ordem, "conferencia");
  const reprovou =
    ordem.situacao === "revisao" && conferencia?.conferencia
      ? motivosDaConferencia(conferencia.conferencia)
      : [];

  return (
    <div className="space-y-5 border-t border-borda bg-fundo px-4 py-5 sm:px-6">
      <LinhaDoTempoDaOrdem ordem={ordem} />

      {ordem.observacao && (
        <p className="text-sm text-tinta-media">
          <span className="font-semibold text-tinta">Observação do pedido: </span>
          {ordem.observacao}
        </p>
      )}

      <TabelaDeItens ordem={ordem} />

      {reprovou.length > 0 && (
        <div className="rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3">
          <p className="text-sm font-semibold text-naopago">
            A conferência não passou. A ordem voltou para quem abriu.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-tinta-media">
            {reprovou.map((motivo) => (
              <li key={motivo}>{motivo}</li>
            ))}
          </ul>
        </div>
      )}

      {/* O formulario da etapa vem ABERTO: quem entrou aqui tem uma coisa para
          fazer, e esconder atras de um botao seria um clique para nada. */}
      {ordem.situacao === "andamento" && ordem.etapaAtual && minha && (
        <FormularioDaEtapa
          /* A chave inclui o passo: a ordem que anda troca de formulario, e com
             ele o quadro de assinatura -- que nasce limpo. */
          key={`${ordem.etapaAtual}-${ordem.passos.length}`}
          ordem={ordem}
          etapa={ordem.etapaAtual}
          aoConcluir={aoConcluir}
          nomeDoUsuario={nomeDoUsuario}
          hoje={hoje}
        />
      )}

      {ordem.situacao === "revisao" && ehAdministrador && (
        <FormularioDeRevisao
          key={`revisao-${ordem.passos.length}`}
          ordem={ordem}
          aoConcluir={aoConcluir}
          nomeDoUsuario={nomeDoUsuario}
          hoje={hoje}
        />
      )}

      <HistoricoDosPassos ordem={ordem} />

      <AcoesDaOrdem ordem={ordem} ehAdministrador={ehAdministrador} />
    </div>
  );
}

function TabelaDeItens({ ordem }: { ordem: OrdemFabricacao }) {
  const fabricacao = passoDaEtapa(ordem, "fabricacao")?.fabricacao;
  const recebimento = passoDaEtapa(ordem, "recebimento")?.recebimento;

  return (
    <div className="overflow-x-auto">
      <table className="tabela-ancorada w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
            <th className="py-2 pr-4 font-semibold">Produto</th>
            <th className="py-2 pr-4 text-right font-semibold">Pedido</th>
            <th className="py-2 pr-4 text-right font-semibold">Fabricado</th>
            <th className="py-2 text-right font-semibold">Recebido</th>
          </tr>
        </thead>
        <tbody>
          {ordem.itens.map((item) => {
            const fab = fabricacao?.quantidades[item.chave];
            const rec = recebimento?.quantidades[item.chave];
            // Fabricou menos do que foi pedido: e onde a confianca se decide.
            const faltou = fab !== undefined && fab < item.quantidade;

            return (
              <tr key={item.chave} className="border-b border-borda">
                <td className="py-2 pr-4">
                  <span className="font-medium text-tinta">{item.nome}</span>
                  {item.sku && <span className="ml-2 text-xs text-tinta-fraca">{item.sku}</span>}
                </td>
                <td className="numerico py-2 pr-4 text-right text-tinta-media">
                  {inteiro(item.quantidade)}
                </td>
                <td
                  className={`numerico py-2 pr-4 text-right ${
                    faltou ? "font-semibold text-naopago" : "text-tinta-media"
                  }`}
                >
                  {fab === undefined ? "—" : inteiro(fab)}
                </td>
                <td className="numerico py-2 text-right font-semibold text-tinta">
                  {rec === undefined ? "—" : inteiro(rec)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistoricoDosPassos({ ordem }: { ordem: OrdemFabricacao }) {
  if (ordem.passos.length === 0) return null;

  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-tinta">
        Histórico ({ordem.passos.length} assinatura(s))
      </summary>
      <ul className="mt-2 space-y-1.5 text-sm text-tinta-media">
        {ordem.passos.map((passo, indice) => (
          <li key={`${passo.etapa}-${indice}`} className="flex flex-wrap gap-x-2">
            <span className="font-medium text-tinta">{ROTULO_ETAPA[passo.etapa]}</span>
            <span>
              {passo.assinatura.nome} · {dataHora(passo.assinatura.assinadoEm)}
            </span>
            {passo.observacao && <span className="w-full text-xs">“{passo.observacao}”</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------------------
// O formulario de cada etapa
// ---------------------------------------------------------------------------

/** O que a etapa anterior registrou, para o campo ja vir preenchido. */
function quantidadePadrao(ordem: OrdemFabricacao, etapa: EtapaOrdem, chave: string): number {
  const anterior =
    etapa === "fabricacao"
      ? undefined
      : etapa === "contagem"
        ? passoDaEtapa(ordem, "fabricacao")?.fabricacao?.quantidades
        : passoDaEtapa(ordem, "contagem")?.contagem?.quantidades;

  const item = ordem.itens.find((i) => i.chave === chave);
  return anterior?.[chave] ?? item?.quantidade ?? 0;
}

function FormularioDaEtapa({
  ordem,
  etapa,
  aoConcluir,
  nomeDoUsuario,
  hoje,
}: {
  ordem: OrdemFabricacao;
  etapa: EtapaOrdem;
  aoConcluir: (mensagem: string) => void;
  nomeDoUsuario: string;
  hoje: string;
}) {
  const [estado, acao, pendente] = useActionState(assinarEtapa, ESTADO_INICIAL);

  // Assinou: quem fecha o cartao e a lista, e o formulario sai da tela junto
  // com o quadro de assinatura -- que e o que impede o traco de sobrar.
  useEffect(() => {
    if (estado.ok && estado.mensagem) aoConcluir(estado.mensagem);
  }, [estado.ok, estado.mensagem, aoConcluir]);
  const [temAssinatura, setTemAssinatura] = useState(false);
  const [respostas, setRespostas] = useState<Record<string, boolean>>({});
  const [cumpre, setCumpre] = useState(true);

  const conferindo = etapa === "conferencia";
  const contando = etapa === "fabricacao" || etapa === "contagem" || etapa === "recebimento";

  const vaiVoltar =
    conferindo &&
    !conferenciaAprova({
      respostas: Object.fromEntries(
        ITENS_DE_CONFERENCIA.map((i) => [i, respostas[i] === true]),
      ) as never,
      cumpreAData: cumpre,
      dataPossivel: null,
    });

  return (
    <form action={acao} className="rounded-xl border border-borda-forte bg-superficie px-4 py-5 sm:px-6">
      <input type="hidden" name="id" value={ordem.id} />
      <input type="hidden" name="etapa" value={etapa} />

      <p className="text-sm font-semibold text-tinta">{ROTULO_ETAPA[etapa]}</p>

      {conferindo && (
        <div className="mt-3 space-y-2">
          {ITENS_DE_CONFERENCIA.map((item) => (
            <label key={item} className="flex items-start gap-2 text-sm text-tinta">
              <input
                type="checkbox"
                name={`conferencia:${item}`}
                value="sim"
                checked={respostas[item] === true}
                onChange={(e) =>
                  setRespostas((atual) => ({ ...atual, [item]: e.target.checked }))
                }
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span>{PERGUNTA_DE_CONFERENCIA[item]}</span>
            </label>
          ))}

          <label className="flex items-start gap-2 border-t border-borda pt-3 text-sm font-medium text-tinta">
            <input
              type="checkbox"
              name="cumpreAData"
              value="sim"
              checked={cumpre}
              onChange={(e) => setCumpre(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Consigo fabricar até {dataCalendario(ordem.dataLancamento)}
            </span>
          </label>

          {!cumpre && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-tinta-media">
                Para quando fica pronto?
              </span>
              <input type="date" name="dataPossivel" min={hoje} className={CAMPO} />
            </label>
          )}

          {vaiVoltar && (
            <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-2 text-sm text-naopago">
              Com alguma resposta em falta, a ordem volta para quem abriu — é o
              que o processo manda. Assine assim mesmo: o registro é o que
              importa.
            </p>
          )}
        </div>
      )}

      {contando && (
        <div className="mt-3 space-y-3">
          <label className="block sm:max-w-xs">
            <span className="mb-1 block text-xs font-medium text-tinta-media">
              {etapa === "fabricacao"
                ? "Data em que a fabricação terminou"
                : etapa === "contagem"
                  ? "Data da contagem"
                  : "Data do recebimento"}
            </span>
            <input
              type="date"
              name={
                etapa === "fabricacao"
                  ? "dataFabricacao"
                  : etapa === "contagem"
                    ? "dataContagem"
                    : "dataRecebimento"
              }
              defaultValue={hoje}
              className={CAMPO}
            />
          </label>

          {ordem.itens.map((item) => (
            <label key={item.chave} className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 text-sm text-tinta">
                {item.nome}
                <span className="ml-2 text-xs text-tinta-fraca">
                  pedido: {inteiro(item.quantidade)}
                </span>
              </span>
              <input
                type="number"
                name={`quantidade:${item.chave}`}
                defaultValue={quantidadePadrao(ordem, etapa, item.chave)}
                min={0}
                step={1}
                className="w-32 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-right text-sm text-tinta"
              />
            </label>
          ))}

          {etapa === "recebimento" && (
            <p className="text-xs text-tinta-media">
              O que você contar aqui entra como contagem na aba Estoque, com
              esta data. É o mesmo lançamento — não precisa fazer duas vezes.
            </p>
          )}
        </div>
      )}

      {etapa === "envio" && (
        <div className="mt-3 space-y-3 sm:flex sm:gap-3 sm:space-y-0">
          <label className="block sm:w-48">
            <span className="mb-1 block text-xs font-medium text-tinta-media">Data do envio</span>
            <input type="date" name="dataEnvio" defaultValue={hoje} className={CAMPO} />
          </label>
          <label className="block flex-1">
            <span className="mb-1 block text-xs font-medium text-tinta-media">
              Transportadora, placa ou nota (opcional)
            </span>
            <input type="text" name="referencia" maxLength={120} className={CAMPO} />
          </label>
        </div>
      )}

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-tinta-media">
          Observação (opcional)
        </span>
        <input type="text" name="observacao" maxLength={300} className={CAMPO} />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta-media">Seu nome</span>
          <input
            type="text"
            name="nome"
            defaultValue={nomeDoUsuario}
            required
            minLength={3}
            className={CAMPO}
          />
        </label>
        <QuadroAssinatura campo="tracos" rotulo="Assine para seguir" aoMudar={setTemAssinatura} />
      </div>

      {estado.mensagem && (
        <p
          className={`mt-3 rounded-lg px-4 py-3 text-sm ${
            estado.ok
              ? "border border-borda bg-real-claro text-real"
              : "border border-alerta-borda bg-alerta-fundo text-naopago"
          }`}
        >
          {estado.mensagem}
        </p>
      )}

      <button
        type="submit"
        disabled={!temAssinatura || pendente}
        className="mt-4 rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pendente ? "Enviando..." : "Assinar e seguir para a próxima etapa"}
      </button>
    </form>
  );
}

function FormularioDeRevisao({
  ordem,
  aoConcluir,
  nomeDoUsuario,
  hoje,
}: {
  ordem: OrdemFabricacao;
  aoConcluir: (mensagem: string) => void;
  nomeDoUsuario: string;
  hoje: string;
}) {
  const [estado, acao, pendente] = useActionState(retomarOrdem, ESTADO_INICIAL);

  useEffect(() => {
    if (estado.ok && estado.mensagem) aoConcluir(estado.mensagem);
  }, [estado.ok, estado.mensagem, aoConcluir]);
  const [temAssinatura, setTemAssinatura] = useState(false);
  const sugerida = passoDaEtapa(ordem, "conferencia")?.conferencia?.dataPossivel;

  return (
    <form action={acao} className="rounded-xl border border-borda-forte bg-superficie px-4 py-5 sm:px-6">
      <input type="hidden" name="id" value={ordem.id} />

      <p className="text-sm font-semibold text-tinta">Aceitar a nova data e devolver</p>
      <p className="mt-1 text-sm text-tinta-media">
        A ordem volta para a conferência com a data que você aceitar. Se não
        servir, cancele a ordem abaixo.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta-media">
            Nova data de lançamento
          </span>
          <input
            type="date"
            name="dataLancamento"
            defaultValue={sugerida ?? ordem.dataLancamento}
            min={hoje}
            required
            className={CAMPO}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta-media">Seu nome</span>
          <input
            type="text"
            name="nome"
            defaultValue={nomeDoUsuario}
            required
            minLength={3}
            className={CAMPO}
          />
        </label>
      </div>

      <div className="mt-3">
        <QuadroAssinatura campo="tracos" rotulo="Assine para devolver" aoMudar={setTemAssinatura} />
      </div>

      {estado.mensagem && (
        <p
          className={`mt-3 rounded-lg px-4 py-3 text-sm ${
            estado.ok
              ? "border border-borda bg-real-claro text-real"
              : "border border-alerta-borda bg-alerta-fundo text-naopago"
          }`}
        >
          {estado.mensagem}
        </p>
      )}

      <button
        type="submit"
        disabled={!temAssinatura || pendente}
        className="mt-4 rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pendente ? "Enviando..." : "Aceitar a data e devolver para a conferência"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Cancelar, apagar, baixar
// ---------------------------------------------------------------------------

function AcoesDaOrdem({
  ordem,
  ehAdministrador,
}: {
  ordem: OrdemFabricacao;
  ehAdministrador: boolean;
}) {
  const [cancelamento, acaoCancelar, cancelando] = useActionState(cancelarOrdem, ESTADO_INICIAL);
  const [remocao, acaoRemover, removendo] = useActionState(removerOrdem, ESTADO_INICIAL);
  const [confirmando, setConfirmando] = useState(false);

  const emAberto = ordem.situacao === "andamento" || ordem.situacao === "revisao";

  return (
    <div className="space-y-3 border-t border-borda pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {ordem.documento && (
          <a
            href={`/ordens/${ordem.id}/pdf`}
            className="rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm font-medium text-tinta"
          >
            Baixar o PDF assinado
          </a>
        )}

        {ehAdministrador && emAberto && (
          <form action={acaoCancelar} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={ordem.id} />
            <input
              type="text"
              name="motivo"
              placeholder="Motivo do cancelamento"
              maxLength={200}
              className="w-56 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
            />
            <button
              type="submit"
              disabled={cancelando}
              className="rounded-lg border border-borda-forte px-3 py-2 text-sm font-medium text-tinta-media disabled:opacity-60"
            >
              {cancelando ? "Cancelando..." : "Cancelar ordem"}
            </button>
          </form>
        )}
      </div>

      {/*
       * Apagar existe para a FASE DE TESTE, a pedido do dono.
       *
       * Dois passos na propria linha, sem `window.confirm` -- que some atras de
       * abas no celular e trava a auditoria automatizada (5.16). O aviso diz
       * que o caminho normal e cancelar, para o botao nao virar habito.
       */}
      {ehAdministrador && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {confirmando ? (
            <form action={acaoRemover} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={ordem.id} />
              <span className="text-naopago">
                Apagar de vez? O registro some, não fica histórico.
              </span>
              <button
                type="submit"
                disabled={removendo}
                className="rounded-lg bg-naopago px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {removendo ? "Apagando..." : "Sim, apagar"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm text-tinta-media"
              >
                Não
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="text-xs text-tinta-fraca underline"
            >
              apagar esta ordem (só para teste — o normal é cancelar)
            </button>
          )}
        </div>
      )}

      {[cancelamento, remocao].map(
        (estado, indice) =>
          estado.mensagem && (
            <p
              key={indice}
              className={`rounded-lg px-4 py-3 text-sm ${
                estado.ok
                  ? "border border-borda bg-real-claro text-real"
                  : "border border-alerta-borda bg-alerta-fundo text-naopago"
              }`}
            >
              {estado.mensagem}
            </p>
          ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nova ordem
// ---------------------------------------------------------------------------

interface LinhaDoFormulario {
  /** Chave local da linha; nao vai para o servidor. */
  id: number;
  chave: string;
  quantidade: string;
}

function FormularioDeOrdem({
  produtos,
  nomeDoUsuario,
  hoje,
  aoConcluir,
}: {
  produtos: OpcaoProduto[];
  nomeDoUsuario: string;
  hoje: string;
  aoConcluir: () => void;
}) {
  const [estado, acao, pendente] = useActionState(criarOrdemDeFabricacao, ESTADO_INICIAL);
  const [linhas, setLinhas] = useState<LinhaDoFormulario[]>([
    { id: 1, chave: "", quantidade: "" },
  ]);
  const [temAssinatura, setTemAssinatura] = useState(false);

  useEffect(() => {
    if (estado.ok) aoConcluir();
  }, [estado.ok, aoConcluir]);

  const porChave = useMemo(() => new Map(produtos.map((p) => [p.chave, p])), [produtos]);

  /*
   * O que vai para o servidor e so { chave, quantidade }.
   *
   * Nome e SKU sao resolvidos la, contra o cadastro. Mandar o nome daqui
   * deixaria assinar um documento cujo texto nao corresponde ao produto.
   */
  const itens = linhas
    .filter((l) => l.chave !== "" && Number(l.quantidade) > 0)
    .map((l) => ({ chave: l.chave, quantidade: Number(l.quantidade) }));

  const total = itens.reduce((soma, i) => soma + i.quantidade, 0);
  const podeEnviar = itens.length > 0 && temAssinatura && !pendente;

  return (
    <form
      action={acao}
      className="mb-6 rounded-xl border border-borda-forte bg-fundo px-4 py-5 sm:px-6"
    >
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      <p className="text-sm font-semibold text-tinta">O que precisa ser fabricado</p>
      <p className="mt-0.5 text-xs text-tinta-media">
        A lista começa pelo que acaba antes, no ritmo de venda deste mês.
      </p>

      <div className="mt-3 space-y-3">
        {linhas.map((linha, indice) => {
          const escolhido = porChave.get(linha.chave);

          return (
            <div key={linha.id} className="rounded-lg border border-borda bg-superficie p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-tinta-media">
                    Produto {indice + 1}
                  </span>
                  <select
                    value={linha.chave}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l) => (l.id === linha.id ? { ...l, chave: e.target.value } : l)),
                      )
                    }
                    className={CAMPO}
                  >
                    <option value="">Escolha um produto...</option>
                    {produtos.map((p) => (
                      <option key={p.chave} value={p.chave}>
                        {p.nome}
                        {p.sku ? ` (${p.sku})` : ""}
                        {p.coberturaDias !== null && p.coberturaDias <= 21
                          ? ` — acaba em ${Math.round(p.coberturaDias)} dia(s)`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block sm:w-40">
                  <span className="mb-1 block text-xs font-medium text-tinta-media">
                    Quantidade
                  </span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={linha.quantidade}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l) =>
                          l.id === linha.id ? { ...l, quantidade: e.target.value } : l,
                        ),
                      )
                    }
                    className={CAMPO}
                  />
                </label>

                {linhas.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setLinhas((atual) => atual.filter((l) => l.id !== linha.id))
                    }
                    className="rounded-lg border border-borda-forte px-3 py-2 text-sm text-tinta-media"
                  >
                    Remover
                  </button>
                )}
              </div>

              {escolhido && (
                <p className="mt-2 text-xs text-tinta-media">
                  Saldo hoje:{" "}
                  {escolhido.saldo === null ? "sem contagem" : `${inteiro(escolhido.saldo)} un`}
                  {escolhido.coberturaDias !== null
                    ? ` · cobre ${Math.round(escolhido.coberturaDias)} dia(s)`
                    : ""}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {linhas.length < MAXIMO_DE_ITENS && (
        <button
          type="button"
          onClick={() =>
            setLinhas((atual) => [
              ...atual,
              { id: Math.max(0, ...atual.map((l) => l.id)) + 1, chave: "", quantidade: "" },
            ])
          }
          className="mt-3 rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm font-medium text-tinta"
        >
          Adicionar produto
        </button>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta-media">
            Data de lançamento
          </span>
          <input type="date" name="dataLancamento" min={hoje} required className={CAMPO} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-tinta-media">Seu nome</span>
          <input
            type="text"
            name="nome"
            defaultValue={nomeDoUsuario}
            required
            minLength={3}
            className={CAMPO}
          />
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-tinta-media">
          Observação para a fábrica (opcional)
        </span>
        <input type="text" name="observacao" maxLength={600} className={CAMPO} />
      </label>

      <div className="mt-3">
        <QuadroAssinatura campo="tracos" rotulo="Assine o pedido" aoMudar={setTemAssinatura} />
      </div>

      {total > 0 && (
        <p className="mt-3 text-sm text-tinta-media">
          Total do pedido: <strong className="text-tinta">{inteiro(total)} unidade(s)</strong>
        </p>
      )}

      {estado.mensagem && (
        <p
          className={`mt-3 rounded-lg px-4 py-3 text-sm ${
            estado.ok
              ? "border border-borda bg-real-claro text-real"
              : "border border-alerta-borda bg-alerta-fundo text-naopago"
          }`}
        >
          {estado.mensagem}
        </p>
      )}

      <button
        type="submit"
        disabled={!podeEnviar}
        className="mt-4 rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pendente ? "Abrindo..." : "Abrir ordem e assinar"}
      </button>
    </form>
  );
}
