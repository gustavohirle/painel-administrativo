"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import { cancelarOrdem, criarOrdemDeFabricacao } from "@/app/ordens/actions";
import { AssinaturaLida } from "@/components/AssinaturaLida";
import { FiltrosDeOrdens, type OpcaoInfluencer } from "@/components/FiltrosDeOrdens";
import { QuadroAssinatura } from "@/components/QuadroAssinatura";
import { dataCalendario, dataHora, inteiro } from "@/lib/format";
import type { FiltrosOrdens } from "@/lib/ordens";
import { ESTADO_INICIAL } from "@/types/formulario";
import {
  MAXIMO_DE_ITENS,
  QUANTIDADE_MAXIMA,
  ROTULO_SITUACAO,
  unidadesDaOrdem,
  type OrdemFabricacao,
  type SituacaoOrdem,
} from "@/types/ordemFabricacao";

export interface OpcaoProduto {
  chave: string;
  nome: string;
  sku: string | null;
  /** Saldo atual, para quem pede ja saber se falta mesmo. `null` sem contagem. */
  saldo: number | null;
}

interface GestaoOrdensProps {
  /** Ja filtradas e cortadas no teto pelo servidor. */
  ordens: OrdemFabricacao[];
  produtos: OpcaoProduto[];
  /** Nome de quem esta logado, para pre-preencher a assinatura. */
  nomeDoUsuario: string;

  filtros: FiltrosOrdens;
  influencers: OpcaoInfluencer[];
  /** Quantas casaram com o filtro, antes do corte. */
  encontradas: number;
  /** Quantas existem, sem filtro nenhum. */
  total: number;
  cortada: boolean;
}

interface LinhaDoFormulario {
  /** Chave local da linha; nao vai para o servidor. */
  id: number;
  chave: string;
  quantidade: string;
}

export function GestaoOrdens({
  ordens,
  produtos,
  nomeDoUsuario,
  filtros,
  influencers,
  encontradas,
  total,
  cortada,
}: GestaoOrdensProps) {
  const [aberto, setAberto] = useState(false);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-tinta-media">
          Cada ordem vira um link. Quem recebe o link confere, aprova e assina
          pelo celular &mdash; e o PDF assinado pelos dois lados fica guardado
          aqui, sem poder ser alterado depois.
        </p>
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white"
        >
          {aberto ? "Fechar" : "Nova ordem de fabricação"}
        </button>
      </div>

      {aberto && (
        <FormularioDeOrdem
          produtos={produtos}
          nomeDoUsuario={nomeDoUsuario}
          aoConcluir={() => setAberto(false)}
        />
      )}

      {/* A barra so aparece quando ha o que filtrar -- com tres ordens ela
          seria ruido, e com trezentas e a unica forma de achar uma. */}
      {total > 0 && (
        <FiltrosDeOrdens
          filtros={filtros}
          influencers={influencers}
          encontradas={encontradas}
          total={total}
          cortada={cortada}
        />
      )}

      {ordens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-borda-forte px-4 py-8 text-center text-sm text-tinta-media">
          {total === 0
            ? "Nenhuma ordem de fabricação ainda."
            : "Nenhuma ordem casa com este filtro."}
        </p>
      ) : (
        <ul className="space-y-3">
          {ordens.map((ordem) => (
            <CartaoDeOrdem key={ordem.id} ordem={ordem} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nova ordem
// ---------------------------------------------------------------------------

function FormularioDeOrdem({
  produtos,
  nomeDoUsuario,
  aoConcluir,
}: {
  produtos: OpcaoProduto[];
  nomeDoUsuario: string;
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

  const porChave = useMemo(
    () => new Map(produtos.map((p) => [p.chave, p])),
    [produtos],
  );

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
                        atual.map((l) =>
                          l.id === linha.id ? { ...l, chave: e.target.value } : l,
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2 text-sm text-tinta"
                  >
                    <option value="">Escolha um produto...</option>
                    {produtos.map((p) => (
                      <option key={p.chave} value={p.chave}>
                        {p.nome}
                        {p.sku ? ` (${p.sku})` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block sm:w-40">
                  <span className="mb-1 block text-xs font-medium text-tinta-media">
                    Quantidade
                  </span>
                  <input
                    value={linha.quantidade}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l) =>
                          l.id === linha.id
                            ? { ...l, quantidade: e.target.value.replace(/\D/g, "") }
                            : l,
                        ),
                      )
                    }
                    inputMode="numeric"
                    placeholder="0"
                    max={QUANTIDADE_MAXIMA}
                    className="w-full rounded-lg border border-borda-forte px-3 py-2 text-right text-lg"
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
                <p className="mt-2 text-xs text-tinta-fraca">
                  {escolhido.saldo === null
                    ? "Sem contagem de estoque registrada para este item."
                    : `Estoque atual: ${inteiro(escolhido.saldo)} unidade(s).`}
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
          className="mt-3 rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta"
        >
          Adicionar outro produto
        </button>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Precisa estar pronto em
          </span>
          <input
            type="date"
            name="dataLancamento"
            defaultValue={new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10)}
            className="w-full rounded-lg border border-borda-forte px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Campanha ou observação
          </span>
          <input
            name="observacao"
            placeholder="Lançamento de primavera, gravação dia 20..."
            className="w-full rounded-lg border border-borda-forte px-3 py-2 text-sm"
          />
        </label>
      </div>

      <div className="mt-6 border-t border-borda pt-5">
        <p className="text-sm font-semibold text-tinta">Sua assinatura</p>
        <p className="mb-3 mt-0.5 text-xs text-tinta-media">
          Fica no documento como quem pediu a fabricação, com a data e a hora.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-tinta">Nome completo</span>
            <input
              name="nome"
              defaultValue={nomeDoUsuario}
              className="w-full rounded-lg border border-borda-forte px-3 py-2 text-sm"
            />
          </label>

          <QuadroAssinatura campo="tracos" rotulo="Assine aqui" aoMudar={setTemAssinatura} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!podeEnviar}
          className="rounded-lg bg-tinta px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pendente ? "Criando..." : "Criar ordem e gerar link"}
        </button>

        {total > 0 && (
          <span className="text-sm text-tinta-media">
            {inteiro(total)} unidade(s) em {itens.length} item(ns)
          </span>
        )}

        {estado.mensagem && (
          <span className={`text-sm ${estado.ok ? "text-real" : "text-naopago"}`}>
            {estado.mensagem}
          </span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------------

const COR_DA_SITUACAO: Record<SituacaoOrdem, string> = {
  aguardando: "border-alerta-borda bg-alerta-fundo text-naopago",
  aprovada: "border-borda-forte bg-fundo text-real",
  recusada: "border-borda-forte bg-fundo text-naopago",
  cancelada: "border-borda bg-fundo text-tinta-fraca",
};

function CartaoDeOrdem({ ordem }: { ordem: OrdemFabricacao }) {
  const [cancelar, acaoCancelar, cancelando] = useActionState(cancelarOrdem, ESTADO_INICIAL);
  const atrasada =
    ordem.situacao === "aguardando" &&
    ordem.dataLancamento < new Date().toISOString().slice(0, 10);

  return (
    <li className="rounded-xl border border-borda bg-superficie px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="numerico text-base font-semibold text-tinta">{ordem.numero}</p>
          <p className="mt-0.5 text-xs text-tinta-fraca">
            Pedida por {ordem.solicitante.nome} em {dataHora(ordem.criadoEm)}
          </p>
        </div>

        <span
          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${COR_DA_SITUACAO[ordem.situacao]}`}
        >
          {ROTULO_SITUACAO[ordem.situacao]}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-tinta-fraca">Pronto em</dt>
          <dd className={`numerico font-semibold ${atrasada ? "text-naopago" : "text-tinta"}`}>
            {dataCalendario(ordem.dataLancamento)}
            {atrasada && <span className="ml-1 text-xs font-normal">(vencida)</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-tinta-fraca">Volume</dt>
          <dd className="numerico font-semibold text-tinta">
            {inteiro(unidadesDaOrdem(ordem))} un
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-xs text-tinta-fraca">Itens</dt>
          <dd className="text-tinta">
            {ordem.itens.map((i) => `${inteiro(i.quantidade)}x ${i.nome}`).join(", ")}
          </dd>
        </div>
      </dl>

      {ordem.observacao && (
        <p className="mt-3 rounded-lg bg-fundo px-3 py-2 text-sm text-tinta-media">
          {ordem.observacao}
        </p>
      )}

      {ordem.situacao === "recusada" && ordem.motivoRecusa && (
        <p className="mt-3 rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-2 text-sm text-naopago">
          <strong className="font-semibold">Recusada:</strong> {ordem.motivoRecusa}
        </p>
      )}

      {ordem.aprovador && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-borda pt-3">
          <span className="text-tinta">
            <AssinaturaLida
              tracos={ordem.aprovador.tracos}
              altura={34}
              rotulo={`Assinatura de ${ordem.aprovador.nome}`}
            />
          </span>
          <span className="text-xs text-tinta-media">
            Aprovada por <strong className="font-semibold text-tinta">{ordem.aprovador.nome}</strong>{" "}
            em {dataHora(ordem.aprovador.assinadoEm)}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {ordem.situacao === "aguardando" && <LinkDeAssinatura token={ordem.token} />}

        {ordem.documento && (
          <a
            href={`/ordens/${ordem.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta"
          >
            Abrir PDF assinado
          </a>
        )}

        {ordem.situacao === "aguardando" && (
          <form action={acaoCancelar}>
            <input type="hidden" name="id" value={ordem.id} />
            <button
              type="submit"
              disabled={cancelando}
              className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta-media disabled:opacity-60"
            >
              {cancelando ? "Cancelando..." : "Cancelar"}
            </button>
          </form>
        )}

        {cancelar.mensagem && (
          <span className={`text-sm ${cancelar.ok ? "text-real" : "text-naopago"}`}>
            {cancelar.mensagem}
          </span>
        )}
      </div>

      {ordem.documento && (
        <p className="numerico mt-2 text-[11px] text-tinta-fraca">
          SHA-256 {ordem.documento.sha256.slice(0, 16)}...
        </p>
      )}
    </li>
  );
}

/** IPv4 puro, sem nome. E o caso que o WhatsApp nao transforma em link. */
const EH_IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * O link, num campo que da para selecionar, mais os atalhos de enviar.
 *
 * O campo de texto NAO e enfeite. `navigator.clipboard` so existe em contexto
 * seguro -- HTTPS ou localhost -- e o painel e acessado de fora por HTTP puro
 * no IP fixo. Ali o botao de copiar simplesmente nao funcionaria, e sem o
 * campo visivel nao haveria como pegar o link de jeito nenhum.
 *
 * ---------------------------------------------------------------------------
 * O QUE NAO FAZER AQUI. Ja foi tentado, num mesmo dia, e falhou.
 *
 * Colado no WhatsApp, `http://177.223.44.178:3000/assinar/...` chega como
 * texto morto: o WhatsApp so linkifica o que tem dominio com terminacao
 * valida, e pinta o IP com a cor de TELEFONE, porque e como telefone que ele
 * o classifica.
 *
 * A correcao obvia e dar um nome ao IP -- `<ip>.sslip.io`, que e DNS curinga e
 * resolve de volta para o mesmo IP. E funciona: o WhatsApp passa a linkificar.
 * E ai o link para de ABRIR, com ERR_SSL_PROTOCOL_ERROR, porque o Chrome forca
 * HTTPS em endereco com NOME e o painel so fala HTTP. Endereco de IP e isento
 * dessa conversao -- e e exatamente por isso que o IP abre e o nome nao.
 *
 * Os dois requisitos sao incompativeis enquanto for HTTP puro:
 *   - para ser tocavel no WhatsApp, precisa de nome;
 *   - tendo nome, o navegador exige HTTPS.
 *
 * Entao o link continua sendo o IP, que ao menos ABRE quando colado num
 * navegador, e a tela diz o passo que falta. Link tocavel exige HTTPS de
 * verdade; ver DEMONSTRACAO.md.
 * ---------------------------------------------------------------------------
 */
function LinkDeAssinatura({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false);
  const [url, setUrl] = useState("");
  const [precisaColar, setPrecisaColar] = useState(false);
  const [soNestaMaquina, setSoNestaMaquina] = useState(false);

  // Montado no navegador: so ele sabe por qual endereco a pagina foi aberta.
  // No servidor, o host viria de um cabecalho que o cliente controla.
  useEffect(() => {
    const { origin, hostname } = window.location;
    setUrl(`${origin}/assinar/${token}`);

    const soLocal = hostname === "localhost" || hostname === "127.0.0.1";
    setSoNestaMaquina(soLocal);
    setPrecisaColar(EH_IPV4.test(hostname) && !soLocal);
  }, [token]);

  /*
   * Quando o endereco e IP, a mensagem leva a instrucao junto.
   *
   * Sem ela, quem recebe ve um texto cinza que nao responde ao toque e conclui
   * que o link esta quebrado -- foi o que aconteceu na primeira vez. Dizer
   * "copie e cole" transforma um beco sem saida num passo a mais.
   */
  const mensagem = precisaColar
    ? `Ordem de fabricacao para aprovar. Copie o endereco abaixo e cole no navegador (ele nao vira link aqui no WhatsApp):

${url}`
    : `Ordem de fabricacao para aprovar: ${url}`;

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem area de transferencia (HTTP puro): seleciona para copiar a mao.
      const campo = document.getElementById(`link-${token}`) as HTMLInputElement | null;
      campo?.select();
    }
  };

  return (
    <div className="w-full">
      <div className="flex w-full flex-wrap items-center gap-2">
        {/*
          * `basis-full` no celular: dividindo a linha com os dois botoes, o
          * campo sobrava com uns 90px e mostrava "http://177.223" -- inutil
          * justamente onde ele mais importa, que e quando a area de
          * transferencia nao existe e a pessoa precisa selecionar a mao.
          */}
        <input
          id={`link-${token}`}
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="numerico w-full min-w-0 basis-full rounded-lg border border-borda bg-fundo px-2.5 py-1.5 text-xs text-tinta-media sm:w-auto sm:flex-1 sm:basis-auto"
        />
        <button
          type="button"
          onClick={copiar}
          className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta"
        >
          {copiado ? "Copiado" : "Copiar"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg border border-borda-forte px-3 py-1.5 text-sm font-medium text-tinta"
        >
          WhatsApp
        </a>
      </div>

      {soNestaMaquina && (
        <p className="mt-1.5 rounded-lg border border-alerta-borda bg-alerta-fundo px-2.5 py-1.5 text-xs text-naopago">
          Este link começa com <strong className="font-semibold">localhost</strong> e
          só abre neste computador. Abra o painel pelo endereço de rede antes de
          copiar o link para enviar.
        </p>
      )}

      {precisaColar && (
        <p className="mt-1.5 text-xs text-tinta-fraca">
          Este endereço <strong className="font-semibold text-tinta-media">abre normalmente</strong>{" "}
          colado em qualquer navegador, mas o WhatsApp não o transforma em link
          tocável &mdash; ele lê endereço de IP como telefone. Quem receber
          precisa copiar e colar. Para chegar clicável, o painel tem que estar
          num endereço HTTPS.
        </p>
      )}
    </div>
  );
}
