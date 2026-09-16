"use client";

import { useState, type FormEvent } from "react";

import { lerReais, moeda, percentual } from "@/lib/format";
import {
  MARGENS_DE_REFERENCIA,
  precoComercial,
  precoParaMargem,
  simularPreco,
  type PerfilDeCusto,
  type ResultadoSimulacao,
} from "@/lib/simulacaoPreco";
import { ROTULO_BASE } from "@/types/dominio";
import { ROTULO_REGIME } from "@/types/fiscal";

interface SimuladorPrecoProps {
  perfis: PerfilDeCusto[];
  /** "setembro de 2026" */
  rotuloMes: string;
  /** Influencers ativos cuja marca nao vendeu no mes. */
  semVendas: string[];
}

interface Simulacao {
  influencerId: string;
  custoTexto: string;
  precoTexto: string;
  resultado: ResultadoSimulacao;
}

/**
 * Formulario do simulador e o resultado ao lado.
 *
 * O calculo roda no toque do botao, como pedido, e o resultado guarda os
 * valores que o produziram. Se a pessoa mexer num campo depois, a tela avisa
 * que o numero exibido e da simulacao anterior -- senao ela leria o lucro de
 * um preco que ja nao esta escrito ali.
 */
export function SimuladorPreco({ perfis, rotuloMes, semVendas }: SimuladorPrecoProps) {
  const [influencerId, setInfluencerId] = useState(perfis[0]?.influencerId ?? "");
  const [custoTexto, setCustoTexto] = useState("");
  const [precoTexto, setPrecoTexto] = useState("");
  const [erro, setErro] = useState("");
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);

  const perfil = perfis.find((p) => p.influencerId === influencerId) ?? null;

  if (perfis.length === 0) {
    return (
      <p className="text-sm text-tinta-media">
        Nenhuma marca com influencer ativo teve venda paga em {rotuloMes}. Sem
        vendas não há média de impostos, taxa e frete para simular — escolha
        outro mês no alto da tela.
      </p>
    );
  }

  function executar(idEscolhido: string, custoDigitado: string, precoDigitado: string) {
    const escolhido = perfis.find((p) => p.influencerId === idEscolhido);
    if (!escolhido) {
      setErro("Escolha o influencer.");
      return;
    }

    const custo = lerReais(custoDigitado);
    const preco = lerReais(precoDigitado);

    if (custo === null || custo < 0) {
      setErro("Informe o custo de fabricação por unidade.");
      return;
    }
    if (preco === null || preco <= 0) {
      setErro("Informe o preço de venda por unidade.");
      return;
    }

    setErro("");
    setSimulacao({
      influencerId: idEscolhido,
      custoTexto: custoDigitado,
      precoTexto: precoDigitado,
      resultado: simularPreco(escolhido, custo, preco),
    });
  }

  function simular(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    executar(influencerId, custoTexto, precoTexto);
  }

  /**
   * "Simular com este preço": escreve o preço sugerido no campo e simula na
   * hora, com o influencer e o custo DA SIMULAÇÃO que gerou a sugestão -- se a
   * pessoa tinha mexido nos campos depois, a sugestão não vale para eles.
   */
  function usarPreco(preco: number) {
    if (!simulacao) return;
    const texto = preco.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: false,
    });
    setInfluencerId(simulacao.influencerId);
    setCustoTexto(simulacao.custoTexto);
    setPrecoTexto(texto);
    executar(simulacao.influencerId, simulacao.custoTexto, texto);

    // No celular as sugestões ficam abaixo do veredito; sem isto o número
    // muda fora da tela e o toque parece não ter feito nada.
    requestAnimationFrame(() =>
      document.getElementById("resultado-simulacao")?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  const desatualizada =
    simulacao !== null &&
    (simulacao.influencerId !== influencerId ||
      simulacao.custoTexto !== custoTexto ||
      simulacao.precoTexto !== precoTexto);

  const perfilSimulado = simulacao
    ? (perfis.find((p) => p.influencerId === simulacao.influencerId) ?? null)
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <form onSubmit={simular} className="space-y-4" noValidate>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">Influencer</span>
          <select
            value={influencerId}
            onChange={(e) => setInfluencerId(e.target.value)}
            className="w-full rounded-lg border border-borda-forte bg-superficie px-3 py-2.5 text-base text-tinta"
          >
            {perfis.map((p) => (
              <option key={p.influencerId} value={p.influencerId}>
                {p.nome} — {p.marca}
              </option>
            ))}
          </select>
          {perfil && (
            <span className="mt-1.5 block text-sm text-tinta-media">
              Regime: <strong className="text-tinta">{ROTULO_REGIME[perfil.regime]}</strong>
              {" · "}contrato de {perfil.percentualContrato.toLocaleString("pt-BR")}% sobre{" "}
              {ROTULO_BASE[perfil.baseComissao].toLowerCase()}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Custo de fabricação por unidade (R$)
          </span>
          <input
            name="custo"
            inputMode="decimal"
            autoComplete="off"
            value={custoTexto}
            onChange={(e) => setCustoTexto(e.target.value)}
            placeholder="0,00"
            className="w-full rounded-lg border border-borda-forte px-3 py-2.5 text-right text-lg"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-tinta">
            Preço de venda por unidade (R$)
          </span>
          <input
            name="preco"
            inputMode="decimal"
            autoComplete="off"
            value={precoTexto}
            onChange={(e) => setPrecoTexto(e.target.value)}
            placeholder="0,00"
            className="w-full rounded-lg border border-borda-forte px-3 py-2.5 text-right text-lg"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-tinta px-4 py-3 text-base font-semibold text-white"
        >
          Simular
        </button>

        {erro && (
          <p role="alert" className="text-sm font-medium text-naopago">
            {erro}
          </p>
        )}

        {semVendas.length > 0 && (
          <p className="text-xs text-tinta-fraca">
            Fora da lista por não terem venda paga em {rotuloMes}: {semVendas.join(", ")}.
          </p>
        )}
      </form>

      <div id="resultado-simulacao" aria-live="polite" className="min-w-0 scroll-mt-32">
        {simulacao && perfilSimulado ? (
          <Resultado
            perfil={perfilSimulado}
            resultado={simulacao.resultado}
            rotuloMes={rotuloMes}
            desatualizada={desatualizada}
            aoUsarPreco={usarPreco}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-borda-forte px-5 py-8 text-sm text-tinta-media">
            Preencha o custo de fabricação e o preço de venda e toque em{" "}
            <strong className="text-tinta">Simular</strong>. O resultado mostra
            quanto sobra por unidade depois de cada custo, e o menor preço que
            não dá prejuízo.
          </div>
        )}
      </div>
    </div>
  );
}

function Resultado({
  perfil,
  resultado,
  rotuloMes,
  desatualizada,
  aoUsarPreco,
}: {
  perfil: PerfilDeCusto;
  resultado: ResultadoSimulacao;
  rotuloMes: string;
  desatualizada: boolean;
  aoUsarPreco: (preco: number) => void;
}) {
  // Meio centavo: abaixo disso o "lucro" e so arredondamento.
  const empate = Math.abs(resultado.lucro) < 0.005;
  const ganha = !empate && resultado.lucro > 0;

  const cor = empate
    ? "var(--color-tinta)"
    : ganha
      ? "var(--color-real)"
      : "var(--color-naopago)";

  const sobrePreco = (valor: number) => percentual(resultado.preco ? valor / resultado.preco : 0);

  const linhas: Array<{ rotulo: string; detalhe: string; valor: number; cor: string }> = [
    {
      rotulo: `Impostos (${ROTULO_REGIME[perfil.regime]})`,
      detalhe: `Média de ${percentual(perfil.cargaImpostos)} da receita sem frete da marca`,
      valor: resultado.impostos,
      cor: "var(--color-imposto)",
    },
    {
      rotulo: "DIFAL",
      detalhe: perfil.recolheDifal
        ? `Média de ${percentual(perfil.cargaDifal, 2)}: ${percentual(perfil.fracaoInterestadual, 0)} das vendas vão para outro estado`
        : "Marca no Simples Nacional não recolhe DIFAL como remetente",
      valor: resultado.difal,
      cor: "var(--color-difal)",
    },
    {
      rotulo: "Taxa da plataforma e do pagamento",
      detalhe: `Média de ${percentual(perfil.cargaTaxas)} sobre o valor pago com frete (${moeda(resultado.preco + resultado.frete)}), com a mistura de cartão, Pix e boleto da marca`,
      valor: resultado.taxas,
      cor: "var(--color-taxa)",
    },
    {
      rotulo: "Comissão do influencer",
      // Numa venda paga, bruto, recebido e receita real valem o preco. So o
      // contrato sobre o que cai na conta desconta a taxa -- e a linha mostra
      // sobre quanto o percentual incidiu.
      detalhe:
        perfil.baseComissao === "liquido"
          ? `${perfil.percentualContrato.toLocaleString("pt-BR")}% sobre o que cai na conta, sem frete (${moeda(resultado.preco - (resultado.preco + resultado.frete) * perfil.taxaForaDaComissao)})`
          : `${perfil.percentualContrato.toLocaleString("pt-BR")}% sobre o preço do produto, sem frete (contrato sobre ${ROTULO_BASE[perfil.baseComissao].toLowerCase()})`,
      valor: resultado.comissao,
      cor: "var(--color-comissao)",
    },
  ];

  if (perfil.cargaDespesas > 0) {
    linhas.push({
      rotulo: "Despesas com o influencer",
      detalhe: `Produto enviado, viagem, cachê: ${percentual(perfil.cargaDespesas)} do faturamento sem frete no mês`,
      valor: resultado.despesas,
      cor: "var(--color-comissao)",
    });
  }

  if (perfil.cargaSocios > 0) {
    linhas.push({
      rotulo: "Participação dos sócios",
      detalhe: `${(perfil.cargaSocios * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do valor pago com frete`,
      valor: resultado.socios,
      cor: "var(--color-socios)",
    });
  }

  linhas.push({
    rotulo: "Custo de fabricação",
    detalhe: "O valor que você informou",
    valor: resultado.custoFabricacao,
    cor: "var(--color-custo)",
  });

  return (
    <div className={`space-y-4 ${desatualizada ? "opacity-60" : ""}`}>
      {desatualizada && (
        <p className="rounded-lg border border-alerta-borda bg-alerta-fundo px-3 py-2 text-sm text-naopago">
          Você mudou os campos depois desta simulação. Toque em Simular para atualizar.
        </p>
      )}

      <div
        className="rounded-xl border-2 px-5 py-4"
        style={{ borderColor: cor }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: cor }}>
          {empate ? "Empata" : ganha ? "Dá lucro" : "Dá prejuízo"}
        </p>
        <p className="numerico mt-1 text-4xl font-semibold tracking-tight xl:text-5xl" style={{ color: cor }}>
          {moeda(resultado.lucro)}
        </p>
        <p className="mt-1 text-sm text-tinta-media">
          por unidade vendida a {moeda(resultado.preco)} — margem de{" "}
          {percentual(resultado.margem)} sobre o preço
        </p>
        <p className="mt-3 border-t border-borda pt-3 text-sm text-tinta">
          {resultado.precoMinimo !== null ? (
            <>
              Preço mínimo para não ter prejuízo:{" "}
              <strong className="numerico">{moeda(resultado.precoMinimo)}</strong>
            </>
          ) : (
            <>
              Nenhum preço cobre estes custos: impostos, taxa e comissão somam{" "}
              {percentual(resultado.cargaProporcional)} de cada venda.
            </>
          )}
        </p>
      </div>

      <SugestaoDePreco perfil={perfil} resultado={resultado} aoUsarPreco={aoUsarPreco} />

      <div className="rounded-xl border border-borda">
        <Linha rotulo="Preço de venda" valor={resultado.preco} percentualTexto="100%" forte />
        {linhas.map((linha) => (
          <Linha
            key={linha.rotulo}
            rotulo={linha.rotulo}
            detalhe={linha.detalhe}
            valor={-linha.valor}
            percentualTexto={sobrePreco(linha.valor)}
            marcador={linha.cor}
          />
        ))}
        <Linha
          rotulo={empate ? "Resultado" : ganha ? "Lucro por unidade" : "Prejuízo por unidade"}
          valor={resultado.lucro}
          percentualTexto={percentual(resultado.margem)}
          forte
          cor={cor}
        />
      </div>

      {/* O frete saiu da lista de custos: o cliente paga por fora e ele vai
          para a transportadora. A frase existe para ninguem achar que foi
          esquecido. */}
      <p className="text-sm text-tinta-media">
        O cliente paga o frete à parte: em média {moeda(resultado.frete)} por unidade (
        {moeda(perfil.fretePorPedido)} por pedido), que vão para a transportadora. O frete
        não entra em imposto, comissão nem custo — só a taxa do pagamento e a participação
        dos sócios incidem sobre o valor pago com ele, {moeda(resultado.preco + resultado.frete)}.
      </p>

      <p className="text-xs text-tinta-fraca">
        Médias de {rotuloMes} da {perfil.marca}, tiradas de{" "}
        {perfil.pedidosPagos.toLocaleString("pt-BR")} pedidos pagos. É uma estimativa
        para decidir preço, não uma apuração: o imposto e o DIFAL de um produto
        mudam com o NCM e com o destino de cada venda.
        {(perfil.impostosNaoConfirmados || perfil.taxasNaoConfirmadas) &&
          " Parte das alíquotas e taxas usadas ainda não foi confirmada pelo contador ou pela fatura."}
      </p>
    </div>
  );
}

const FORMATO_MULTIPLO = { minimumFractionDigits: 0, maximumFractionDigits: 1 } as const;

/**
 * Preço sugerido pelas margens de referência (MARGENS_DE_REFERENCIA).
 *
 * Três faixas e não um número só: "o preço correto" depende de quanto risco a
 * marca aceita, e uma faixa mostra a conversa inteira -- abaixo de quanto é
 * arriscado, onde fica o saudável, até onde dá para ir. O campo de outra
 * margem existe porque a referência é ordem de grandeza, não regra.
 */
function SugestaoDePreco({
  perfil,
  resultado,
  aoUsarPreco,
}: {
  perfil: PerfilDeCusto;
  resultado: ResultadoSimulacao;
  aoUsarPreco: (preco: number) => void;
}) {
  const [outraTexto, setOutraTexto] = useState("25");
  const custo = resultado.custoFabricacao;

  const sugestoes = MARGENS_DE_REFERENCIA.map((referencia) => {
    const exato = precoParaMargem(perfil, custo, referencia.margem);
    const comercial = exato === null ? null : precoComercial(exato);
    return {
      ...referencia,
      exato,
      comercial,
      naVenda: comercial === null ? null : simularPreco(perfil, custo, comercial),
    };
  });

  const [minima, recomendada, forte] = MARGENS_DE_REFERENCIA;
  const m = resultado.margem;
  const posicao =
    resultado.lucro < 0
      ? "dá prejuízo"
      : m < minima!.margem
        ? `fica abaixo da margem mínima saudável (${percentual(minima!.margem, 0)})`
        : m < recomendada!.margem
          ? `fica entre a mínima (${percentual(minima!.margem, 0)}) e a recomendada (${percentual(recomendada!.margem, 0)})`
          : m < forte!.margem
            ? `fica entre a recomendada (${percentual(recomendada!.margem, 0)}) e a forte (${percentual(forte!.margem, 0)})`
            : `fica acima da margem forte (${percentual(forte!.margem, 0)})`;

  const outraPercentual = lerReais(outraTexto);
  const outraValida = outraPercentual !== null && outraPercentual >= 0 && outraPercentual < 100;
  const outraPreco = outraValida ? precoParaMargem(perfil, custo, outraPercentual / 100) : null;

  return (
    <div className="rounded-xl border border-borda px-4 py-4 sm:px-5">
      <p className="font-semibold text-tinta">Preço sugerido para um mercado saudável</p>
      <p className="mt-0.5 text-sm text-tinta-media">
        Seu preço de {moeda(resultado.preco)} dá margem de {percentual(m)} e {posicao}.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {sugestoes.map((s) => {
          const destaque = s.chave === "recomendada";
          return (
            <div
              key={s.chave}
              className={`flex flex-col rounded-lg border px-4 py-3 ${
                destaque ? "border-real ring-1 ring-real" : "border-borda"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-tinta">{s.rotulo}</p>
                <p className="numerico text-xs font-semibold text-tinta-media">
                  {percentual(s.margem, 0)} de margem
                </p>
              </div>

              {s.comercial !== null && s.naVenda ? (
                <>
                  <p
                    className="numerico mt-2 text-2xl font-semibold tracking-tight"
                    style={{ color: destaque ? "var(--color-real)" : "var(--color-tinta)" }}
                  >
                    {moeda(s.comercial)}
                  </p>
                  <p className="text-xs text-tinta-fraca">
                    {moeda(s.exato!)} exato, arredondado para ,90
                  </p>
                  <p className="mt-2 text-sm text-tinta-media">
                    Lucro de {moeda(s.naVenda.lucro)} por unidade
                    {custo > 0 &&
                      ` · ${(s.comercial / custo).toLocaleString("pt-BR", FORMATO_MULTIPLO)}× o custo de fabricação`}
                  </p>
                  <p className="mt-1 text-xs text-tinta-fraca">{s.explicacao}</p>
                  <button
                    type="button"
                    onClick={() => aoUsarPreco(s.comercial!)}
                    className={`mt-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                      destaque
                        ? "bg-real text-white"
                        : "border border-borda-forte text-tinta"
                    }`}
                  >
                    Simular com este preço
                  </button>
                </>
              ) : (
                <p className="mt-2 text-sm text-naopago">
                  Nenhum preço chega a esta margem: impostos, taxa, comissão e
                  despesas já levam {percentual(resultado.cargaProporcional)} de cada venda.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-tinta">
        <label className="flex items-center gap-2">
          <span className="font-medium">Outra margem</span>
          <input
            inputMode="decimal"
            autoComplete="off"
            aria-label="Outra margem, em porcentagem"
            value={outraTexto}
            onChange={(e) => setOutraTexto(e.target.value)}
            className="w-16 rounded-lg border border-borda-forte px-2 py-1.5 text-right"
          />
          <span>%</span>
        </label>
        <span className="text-tinta-media">
          {!outraValida
            ? "Informe uma margem entre 0 e 99%."
            : outraPreco === null
              ? "Nenhum preço chega a esta margem com estes custos."
              : `precisa de ${moeda(precoComercial(outraPreco))} (${moeda(outraPreco)} exato)`}
        </span>
      </div>

      <p className="mt-3 text-xs text-tinta-fraca">
        Referência de mercado, não estudo: empresas de cosméticos saudáveis
        costumam operar entre 10% e 20% de margem operacional. A margem aqui é o
        lucro por unidade sobre o preço, depois de todos os custos da lista abaixo.
      </p>
    </div>
  );
}

export function Linha({
  rotulo,
  detalhe,
  valor,
  percentualTexto,
  forte = false,
  marcador,
  cor,
}: {
  rotulo: string;
  detalhe?: string;
  valor: number;
  percentualTexto: string;
  forte?: boolean;
  marcador?: string;
  cor?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 border-b border-borda px-4 py-3 last:border-b-0 ${
        forte ? "bg-fundo" : ""
      }`}
    >
      <div className="flex min-w-0 items-start gap-2">
        {marcador && (
          <span
            aria-hidden
            className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: marcador }}
          />
        )}
        <div className="min-w-0">
          <p className={`text-sm ${forte ? "font-semibold text-tinta" : "font-medium text-tinta"}`}>
            {rotulo}
          </p>
          {detalhe && <p className="mt-0.5 text-xs text-tinta-fraca">{detalhe}</p>}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`numerico text-sm ${forte ? "text-base font-semibold" : "font-medium text-tinta"}`}
          style={cor ? { color: cor } : undefined}
        >
          {moeda(valor)}
        </p>
        <p className="numerico text-xs text-tinta-fraca">{percentualTexto}</p>
      </div>
    </div>
  );
}
