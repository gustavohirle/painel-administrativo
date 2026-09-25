"use client";

import { useEffect, useRef, useState } from "react";

import { NumerosDoDia } from "@/components/NumerosDoDia";
import { escalaAgradavel, inteiro, mesAnoLongo, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DiaDeVenda, VendasDoMes } from "@/lib/metrics";

/*
 * Vendas por dia do mes, em colunas (5.16.1).
 *
 * Cada coluna e um dia; a altura e o valor vendido, e a parte de baixo, em
 * verde, e o que ja entrou. A mesma dupla do quadro "Vendas de hoje" acima --
 * valor e ja pago --, e a mesma tese da secao 1: o que se vendeu nao e o que
 * se recebeu.
 *
 * HTML em vez de SVG, e isso e de proposito. Texto dentro de SVG encolhe junto
 * com o viewBox, e por isso cada grafico SVG do painel precisa de dois
 * formatos (2.1). Aqui o texto e texto de verdade, em px de tela, e a mesma
 * marcacao serve do celular a tela da reuniao. Continua sem biblioteca.
 *
 * Tocar ou clicar numa coluna abre, abaixo do grafico, o quadro daquele dia --
 * o mesmo de "Vendas de hoje", com a lista por marca (25/09/2026, pedido do
 * dono). Os numeros ja vem prontos do servidor, dia a dia, e por isso o quadro
 * abre na hora.
 *
 * As cores seguem a regra "destaque e o resto em cinza": o verde e o mesmo do
 * "Ja pago hoje", e o cinza e o que nao entrou -- sem cor de proposito, para
 * a leitura cair no que entrou. Validado: contraste 3:1 contra o fundo branco
 * e separacao de 13 pontos para daltonismo (dataviz, `validate_palette`).
 */

/** Cinza do que nao entrou. Passa 3:1 contra o branco; o `borda-forte` nao passa. */
const COR_NAO_PAGO = "#8a94a6";

/** Altura da area das colunas, em px. O eixo dos dias fica abaixo, fora dela. */
const ALTURA = 200;

const DIAS_DA_SEMANA = ["dom.", "seg.", "ter.", "qua.", "qui.", "sex.", "sáb."];

/** "qua., 24/09" -- a partir de "2026-09-24", sem `new Date` no fuso local. */
function rotuloDoDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const semana = DIAS_DA_SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

const DIAS_POR_EXTENSO = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

/** "quarta-feira, 24/09" -- o titulo do quadro do dia escolhido. */
function rotuloLongoDoDia(dia: string): string {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const semana = DIAS_POR_EXTENSO[new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${semana}, ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

const numeroDoDia = (dia: string) => Number(dia.slice(8, 10));

/**
 * Quanto um dia disputa o numero no eixo do celular: o escolhido, depois hoje,
 * depois o 1 e os multiplos de 5; os outros, nada. Um numero colado num vizinho
 * de prioridade maior sai -- em ~10px por coluna, "24" e "25" lado a lado viram
 * "2425".
 */
function prioridadeNoEixo(dia: string, hoje: string | null, escolhido: string | null): number {
  if (dia === escolhido) return 3;
  if (dia === hoje) return 2;
  const n = numeroDoDia(dia);
  return n === 1 || n % 5 === 0 ? 1 : 0;
}

/**
 * Valor do eixo, curto: "R$ 90 mil", "R$ 7,5 mil", "R$ 1,2 mi".
 *
 * O `moedaCompacta` escreve "R$ 90,0 mil", e numa coluna estreita isso quebrava
 * em duas linhas ("R$ 90,0" / "mil") -- o eixo virava uma escada. O zero depois
 * da virgula nao diz nada aqui: a grade e de valores redondos por construcao.
 */
function valorDoEixo(valor: number): string {
  const curto = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (valor >= 1_000_000) return `R$ ${curto(valor / 1_000_000)} mi`;
  if (valor >= 1_000) return `R$ ${curto(valor / 1_000)} mil`;
  return `R$ ${curto(valor)}`;
}

interface VendasPorDiaProps {
  vendas: VendasDoMes;
  /**
   * O dia de hoje ("2026-09-24"), SO quando o mes mostrado e o atual. Ele ganha
   * destaque no eixo, e os dias depois dele ficam como espaco vazio, que e o
   * que dizem: ainda nao aconteceram.
   */
  hoje: string | null;
  /** Nome do que esta sendo somado; ausente = a operacao inteira. */
  marca?: string | null;
}

export function VendasPorDia({ vendas, hoje, marca }: VendasPorDiaProps) {
  // Dois estados, e nao um: `ativo` segue o mouse (a leitura do topo) e some
  // quando ele sai; `escolhido` e o dia clicado, cujo quadro fica aberto ate
  // ser fechado ou trocado.
  const [ativo, setAtivo] = useState<string | null>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const quadro = useRef<HTMLDivElement>(null);

  /*
   * O quadro abre abaixo do grafico, e no celular isso e fora da tela: sem
   * rolar, o toque pareceria nao ter feito nada. `nearest` rola o minimo; o
   * `scroll-mt` do quadro desconta o cabecalho grudado no topo.
   */
  useEffect(() => {
    if (escolhido) quadro.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [escolhido]);

  const { dias, total } = vendas;
  const maiorDia = Math.max(0, ...dias.map((d) => d.bruto));
  const { topo, marcas } = escalaAgradavel(maiorDia);
  const altura = (valor: number) => (topo > 0 ? (valor / topo) * ALTURA : 0);

  if (total.quantidade === 0) {
    return (
      <p className="text-sm text-tinta-media">
        Nenhuma venda em {mesAnoLongo(vendas.mes)}
        {marca ? ` na ${marca}` : ""}.
      </p>
    );
  }

  const foco = ativo ?? escolhido;
  const diaAtivo = foco ? (dias.find((d) => d.dia === foco) ?? null) : null;
  const diaEscolhido = escolhido ? (dias.find((d) => d.dia === escolhido) ?? null) : null;
  const passados = dias.filter((d) => !hoje || d.dia <= hoje);

  /*
   * A leitura no topo mostra o dia apontado e, sem dia apontado, o mes inteiro.
   * Ela e a etiqueta do grafico: um valor sobre cada coluna seriam 30 numeros
   * que ninguem le, e o toque no celular nao tem "passar o mouse".
   */
  const leitura = diaAtivo ?? { dia: null, ...total };

  return (
    <div>
      {/*
        Duas linhas, e altura minima reservada: o texto troca entre o mes e o
        dia apontado, e sem a reserva o grafico inteiro subia e descia a cada
        coluna tocada. No celular os numeros quebram em duas linhas, dai a
        reserva maior.
      */}
      <div className="min-h-[4.5rem] sm:min-h-[2.75rem]">
        <p className="text-sm font-semibold text-tinta">
          {leitura.dia
            ? rotuloDoDia(leitura.dia)
            : `No mês${marca ? ` — ${marca}` : ""}`}
        </p>
        <p className="numerico text-sm text-tinta-media">
          {inteiro(leitura.quantidade)} venda(s) · {moedaRedonda(leitura.bruto)} vendidos ·{" "}
          <span className="font-semibold text-real">{moedaRedonda(leitura.recebido)} já pagos</span>
          {leitura.bruto > 0 && ` (${percentual(razaoSegura(leitura.recebido, leitura.bruto))})`}
        </p>
      </div>

      {/* Legenda: duas series, sempre presente. O retangulo repete a marca. */}
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-tinta-media">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-real" />
          Já pago
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COR_NAO_PAGO }} />
          Não pago, cancelado ou estornado
        </span>
      </div>

      {/* Folga para o rotulo do topo do eixo, que fica centrado na linha de
          cima da grade e passa meia altura acima dela. */}
      <div className="mt-4 flex gap-2">
        {/* Eixo de valores, fora da area das colunas para nao disputar espaco. */}
        <div className="relative w-14 shrink-0" style={{ height: ALTURA }} aria-hidden>
          {marcas.map((valor) => (
            <span
              key={valor}
              // `bottom` + translate POSITIVO centraliza o rotulo na linha. O
              // `-translate-y-1/2` e o par de `top`: com `bottom` ele sobe meia
              // altura em vez de descer, e cada rotulo ficava ~16px acima da
              // sua linha -- o "R$ 0" boiando sobre a base.
              className="numerico absolute right-0 translate-y-1/2 whitespace-nowrap text-[11px] text-tinta-fraca"
              style={{ bottom: altura(valor) }}
            >
              {valorDoEixo(valor)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            className="relative"
            style={{ height: ALTURA }}
            onPointerLeave={() => setAtivo(null)}
          >
            {/* Grade: linhas finas, continuas, um tom acima do fundo. */}
            {marcas.map((valor) => (
              <div
                key={valor}
                className="absolute inset-x-0 border-t border-borda"
                style={{ bottom: altura(valor) }}
                aria-hidden
              />
            ))}

            <div className="absolute inset-0 flex items-end gap-[2px]">
              {dias.map((d) => (
                <Coluna
                  key={d.dia}
                  dia={d}
                  altura={altura}
                  futuro={hoje !== null && d.dia > hoje}
                  apagado={foco !== null && foco !== d.dia}
                  escolhido={escolhido === d.dia}
                  aoApontar={() => setAtivo(d.dia)}
                  // Clicar no dia aberto fecha o quadro.
                  aoEscolher={() => setEscolhido((atual) => (atual === d.dia ? null : d.dia))}
                />
              ))}
            </div>
          </div>

          {/*
            Eixo dos dias. No celular, de 5 em 5, o dia de hoje e o escolhido;
            da tela media para cima, todos -- trinta rotulos em ~290px nao
            cabem (`prioridadeNoEixo`).

            O rotulo escondido fica INVISIVEL, e nao fora do fluxo: com
            `hidden`, os que sobram se espalham pela largura e deixam de ficar
            embaixo do dia deles.
          */}
          <div className="mt-1 flex gap-[2px]" aria-hidden>
            {dias.map((d, i) => {
              const n = numeroDoDia(d.dia);
              const destaque = d.dia === hoje || d.dia === escolhido;
              const prioridade = prioridadeNoEixo(d.dia, hoje, escolhido);
              const vizinhoMaior = [dias[i - 1], dias[i + 1]].some(
                (v) => v !== undefined && prioridadeNoEixo(v.dia, hoje, escolhido) > prioridade,
              );
              const noCelular = prioridade > 0 && !vizinhoMaior;
              return (
                <span
                  key={d.dia}
                  className={`numerico min-w-0 flex-1 text-center text-[11px] ${
                    destaque ? "font-bold text-tinta" : "text-tinta-fraca"
                  } ${noCelular ? "" : "invisible md:visible"} ${
                    hoje !== null && d.dia > hoje ? "opacity-50" : ""
                  }`}
                >
                  {n}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {diaEscolhido && (
        <div
          ref={quadro}
          className="mt-5 scroll-mt-32 rounded-lg border border-borda-forte px-4 py-4 sm:px-5"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-tinta">
                {diaEscolhido.dia === hoje
                  ? "Vendas de hoje"
                  : `Vendas de ${rotuloLongoDoDia(diaEscolhido.dia)}`}
                {marca ? ` — ${marca}` : ""}
              </p>
              <p className="mt-0.5 text-sm text-tinta-media">
                Pedidos criados no dia, da meia-noite às 23h59, no horário de Brasília.
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border border-borda px-2.5 py-1 text-sm text-tinta-media hover:border-borda-forte hover:text-tinta"
              onClick={() => setEscolhido(null)}
            >
              Fechar
            </button>
          </div>
          <NumerosDoDia resumo={diaEscolhido} hoje={diaEscolhido.dia === hoje} />
        </div>
      )}

      {/* A tabela e o gemeo do grafico: todo numero que a leitura mostra ao
          apontar tambem esta aqui, sem precisar apontar nada. */}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-tinta-media hover:text-tinta">
          Ver os números dia a dia
        </summary>
        <table className="numerico mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs uppercase tracking-wider text-tinta-fraca">
              <th className="py-1.5 pr-2 font-semibold">Dia</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Vendas</th>
              <th className="py-1.5 pr-2 text-right font-semibold">Valor</th>
              <th className="py-1.5 text-right font-semibold">Já pago</th>
            </tr>
          </thead>
          <tbody>
            {passados.map((d) => (
              <tr key={d.dia} className="border-b border-borda">
                <td className={`py-1.5 pr-2 ${d.dia === hoje ? "font-semibold text-tinta" : "text-tinta-media"}`}>
                  {rotuloDoDia(d.dia)}
                </td>
                <td className="py-1.5 pr-2 text-right text-tinta-media">{inteiro(d.quantidade)}</td>
                <td className="py-1.5 pr-2 text-right text-tinta-media">{moedaRedonda(d.bruto)}</td>
                <td className="py-1.5 text-right font-semibold text-real">{moedaRedonda(d.recebido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Coluna({
  dia,
  altura,
  futuro,
  apagado,
  escolhido,
  aoApontar,
  aoEscolher,
}: {
  dia: DiaDeVenda;
  altura: (valor: number) => number;
  futuro: boolean;
  apagado: boolean;
  escolhido: boolean;
  aoApontar: () => void;
  aoEscolher: () => void;
}) {
  /*
   * Dia que ainda nao chegou nao tem barra, mesmo que tenha pedido. Em
   * producao isso nao acontece; na demonstracao sim, porque a base gera o mes
   * corrente inteiro (secao 12, "Armadilha do teste") -- e uma barra no dia 30
   * quando hoje e dia 24 afirmaria uma venda que nao existiu.
   */
  if (futuro) return <span className="h-full min-w-0 flex-1" aria-hidden />;

  const alturaPago = altura(dia.recebido);
  const alturaResto = altura(Math.max(0, dia.bruto - dia.recebido));
  // Dia com venda de valor pequeno ainda aparece: 2px e o minimo que se ve.
  const pago = dia.recebido > 0 ? Math.max(2, alturaPago) : 0;
  const resto = dia.bruto - dia.recebido > 0 ? Math.max(2, alturaResto) : 0;

  return (
    /*
     * A coluna inteira e o alvo -- a altura toda do grafico, e nao so a barra
     * pintada. Num dia de venda baixa a barra tem 3px; ninguem acerta isso com
     * o dedo.
     *
     * O dia escolhido ganha uma faixa de fundo na coluna inteira: com o mouse
     * passeando pelos outros dias, e ela que diz de qual dia e o quadro aberto.
     */
    <button
      type="button"
      className={`flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end rounded-t-[4px] transition-opacity ${
        apagado ? "opacity-40" : ""
      } ${escolhido ? "bg-fundo" : ""}`}
      onPointerEnter={aoApontar}
      onFocus={aoApontar}
      onClick={aoEscolher}
      aria-pressed={escolhido}
      aria-label={`${rotuloDoDia(dia.dia)}: ${inteiro(dia.quantidade)} vendas, ${moedaRedonda(dia.bruto)} vendidos, ${moedaRedonda(dia.recebido)} já pagos`}
    >
      {/* Barra de no maximo 24px: o espaco que sobra no dia e ar, nao barra. */}
      <span className="flex w-full max-w-[24px] flex-col gap-[2px]">
        {resto > 0 && (
          <span
            className="block w-full rounded-t-[4px]"
            style={{ height: resto, backgroundColor: COR_NAO_PAGO }}
          />
        )}
        {pago > 0 && (
          <span
            className={`block w-full bg-real ${resto > 0 ? "" : "rounded-t-[4px]"}`}
            style={{ height: pago }}
          />
        )}
      </span>
    </button>
  );
}
