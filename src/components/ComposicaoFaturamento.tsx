import Link from "next/link";

import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DemonstrativoResultado } from "@/lib/costing";
import { INTERMEDIARIO_FRETE } from "@/lib/config";
import { fecharMes, type MesFechado } from "@/lib/fechamento";
import type { CampoFechamento } from "@/types/fechamento";

import { BotaoResultado, Oculto, VALOR_OCULTO } from "./ResultadoOculto";
import { ValorDoFechamento } from "./ValorDoFechamento";

/** Cor da fatia e do quadro do resultado enquanto ele esta oculto (5.1.5). */
const COR_OCULTA = "var(--color-borda-forte)";

/*
 * Para onde foi cada real faturado.
 *
 * Pizza, e nao cascata: com a cadeia completa a cascata virava onze barras em
 * degrau, com rotulos em alturas diferentes e textos de apoio se sobrepondo --
 * ilegivel justamente numa tela de reuniao, que e onde ela precisa funcionar.
 *
 * A pizza so fecha porque as parcelas somam EXATAMENTE o bruto:
 *
 *   bruto = nao pago + cancelado + reembolsado + frete da transportadora
 *         + intermediario de frete + impostos + DIFAL + taxas + fabricacao
 *         + influencers + socios + lucro
 *
 * Se mexer nessa conta, a pizza deixa de fechar -- e e o primeiro lugar onde
 * o erro aparece.
 *
 * Frete da transportadora, impostos e DIFAL podem vir do FECHAMENTO do mes
 * (5.1.3): o valor informado entra no lugar do calculado, e a diferenca sai do
 * lucro -- por isso a soma continua sendo o bruto.
 */

const TAMANHO = 360;
const CENTRO = TAMANHO / 2;
const RAIO = 148;
/** O quanto a fatia do lucro sai do circulo, para chamar atencao. */
const DESTAQUE = 12;
/** Abaixo desta fatia o percentual nao cabe dentro dela. */
const FATIA_MINIMA_PARA_TEXTO = 4;

interface Fatia {
  rotulo: string;
  valor: number;
  cor: string;
  /** O que sobra no fim -- sai do circulo e ganha destaque na legenda. */
  resultado?: boolean;
  /** Some da legenda quando e zero: fatia que so existe em algumas lojas. */
  opcional?: boolean;
  /** Valor que o fechamento do mes pode substituir. */
  campo?: CampoFechamento;
  /** Fatia com memoria de calculo (5.1.4): clicar abre a conta. */
  detalhe?: "impostos" | "difal";
}

function montarFatias(dre: DemonstrativoResultado, fechado: MesFechado): Fatia[] {
  const r = dre.reconciliacao;
  // O DIFAL ja esta dentro de `totalImpostos`; `fecharMes` o separa, e cada
  // um dos tres vem do fechamento quando foi informado.
  const { usado } = fechado;
  const lucro = fechado.lucroOperacional;

  return [
    { rotulo: "Não pagos", valor: r.naoPago, cor: "var(--color-naopago)" },
    { rotulo: "Cancelados", valor: r.cancelado, cor: "var(--color-cancelado)" },
    { rotulo: "Reembolsados", valor: r.reembolsado, cor: "var(--color-reembolsado)" },
    // O frete cobrado se divide entre quem o recebe; as duas somam r.frete.
    {
      rotulo: "Frete (transportadora)",
      valor: usado.frete,
      cor: "var(--color-frete)",
      campo: "frete",
    },
    {
      rotulo: INTERMEDIARIO_FRETE,
      valor: r.freteIntermediario,
      cor: "var(--color-intermediario-frete)",
      opcional: true,
    },
    {
      rotulo: "Impostos",
      valor: usado.impostos,
      cor: "var(--color-imposto)",
      campo: "impostos",
      detalhe: "impostos",
    },
    { rotulo: "DIFAL", valor: usado.difal, cor: "var(--color-difal)", campo: "difal", detalhe: "difal" },
    // Fatia propria, nao somada aos impostos: taxa e preco de servico, a unica
    // das duas que da para renegociar.
    // Todas as taxas juntas: a da Nuvemshop e as do cartao e do pix.
    {
      rotulo: "Taxas Nuvemshop, cartão e pix",
      valor: dre.totalTaxasPlataforma,
      cor: "var(--color-taxa)",
    },
    { rotulo: "Fabricação", valor: dre.cmv.cmv, cor: "var(--color-custo)" },
    /*
     * O custo dos influencers em TRES fatias, e nao numa so (23/09/2026). As
     * tres somam `dre.totalInfluencers`, entao a pizza continua fechando.
     *
     * Antes era uma fatia "Influencers" com tudo dentro, e ela escondia a
     * pergunta que o dono faz: quanto disso e comissao (que se renegocia no
     * contrato), quanto e midia paga (que se liga e desliga no mes) e quanto e
     * o resto da estrutura. Sao tres decisoes diferentes, e uma fatia so nao
     * separava nenhuma delas.
     *
     * Marketing e "outras" somem quando sao zero: na demonstracao a unica
     * despesa semeada e o operacional, e uma fatia de R$ 0,00 na legenda diria
     * que existe uma linha de marketing rendendo nada.
     */
    {
      rotulo: "Comissão de influencers",
      valor: dre.totalComissoes,
      cor: "var(--color-comissao)",
    },
    {
      rotulo: "Marketing",
      valor: dre.totalDespesasMarketing,
      cor: "var(--color-marketing)",
      opcional: true,
    },
    {
      rotulo: "Outras despesas",
      valor: dre.totalDespesasOutras,
      cor: "var(--color-despesa)",
      opcional: true,
    },
    // Custo fixo sobre o recebido; sai antes do lucro, entao tem fatia propria.
    { rotulo: "Sócios", valor: dre.participacaoSocios, cor: "var(--color-socios)" },
    // Com prejuizo o valor fica negativo -- e por isso nao entra no desenho
    // (so fatias positivas) --, mas a legenda tem que dizer "prejuizo", em
    // vermelho: "Lucro operacional" verde com numero negativo se contradiz.
    {
      rotulo: lucro < 0 ? "Prejuízo operacional" : "Lucro operacional",
      valor: lucro,
      cor: lucro < 0 ? "var(--color-naopago)" : "var(--color-real)",
      resultado: true,
    },
  ];
}

/** Ponto na circunferencia, com 0 grau no topo e sentido horario. */
function ponto(angulo: number, raio: number, deslocamento = { x: 0, y: 0 }) {
  const radianos = ((angulo - 90) * Math.PI) / 180;
  return {
    x: CENTRO + deslocamento.x + raio * Math.cos(radianos),
    y: CENTRO + deslocamento.y + raio * Math.sin(radianos),
  };
}

interface FatiaDesenhada extends Fatia {
  fracao: number;
  caminho: string;
  rotuloX: number;
  rotuloY: number;
}

function desenhar(fatias: Fatia[], total: number): FatiaDesenhada[] {
  let anguloAtual = 0;

  return fatias.map((fatia) => {
    const fracao = fatia.valor / total;
    const varredura = fracao * 360;
    const inicio = anguloAtual;
    const fim = anguloAtual + varredura;
    anguloAtual = fim;

    const meio = (inicio + fim) / 2;
    const radianosMeio = ((meio - 90) * Math.PI) / 180;

    // A fatia do lucro sai do circulo pela bissetriz.
    const deslocamento = fatia.resultado
      ? {
          x: DESTAQUE * Math.cos(radianosMeio),
          y: DESTAQUE * Math.sin(radianosMeio),
        }
      : { x: 0, y: 0 };

    const a = ponto(inicio, RAIO, deslocamento);
    const b = ponto(fim, RAIO, deslocamento);
    const arcoGrande = varredura > 180 ? 1 : 0;

    /*
     * Fatia unica de 100% seria um arco que comeca e termina no mesmo ponto --
     * o SVG nao desenha nada. Nesse caso, dois semicirculos.
     */
    const caminho =
      fracao >= 0.9999
        ? `M ${CENTRO} ${CENTRO - RAIO} A ${RAIO} ${RAIO} 0 1 1 ${CENTRO} ${CENTRO + RAIO} A ${RAIO} ${RAIO} 0 1 1 ${CENTRO} ${CENTRO - RAIO} Z`
        : `M ${CENTRO + deslocamento.x} ${CENTRO + deslocamento.y} L ${a.x} ${a.y} A ${RAIO} ${RAIO} 0 ${arcoGrande} 1 ${b.x} ${b.y} Z`;

    const centroide = ponto(meio, RAIO * 0.64, deslocamento);

    return {
      ...fatia,
      fracao,
      caminho,
      rotuloX: centroide.x,
      rotuloY: centroide.y,
    };
  });
}

export function ComposicaoFaturamento({
  dre,
  fechado = fecharMes(dre, null),
  mes,
}: {
  dre: DemonstrativoResultado;
  fechado?: MesFechado;
  /** Com o mes, frete, impostos e DIFAL ganham o campo do fechamento. */
  mes?: string;
}) {
  const r = dre.reconciliacao;
  const fatias = montarFatias(dre, fechado).filter((f) => !(f.opcional && f.valor === 0));

  const prejuizo = fechado.lucroOperacional < 0;
  // A memoria de calculo precisa do mes: sem ele (fora da tela inicial), sem link.
  const linkDe = (fatia: Fatia) =>
    fatia.detalhe && mes ? `/calculo?item=${fatia.detalhe}&mes=${mes}` : null;

  /*
   * Com prejuizo nao ha fatia de lucro: as deducoes sozinhas ja passam de 100%
   * do bruto. A pizza mostra a proporção entre elas e o prejuizo sai num aviso
   * separado -- em vez de uma fatia negativa, que nao existe.
   */
  const visiveis = fatias.filter((f) => f.valor > 0);
  const total = visiveis.reduce((soma, f) => soma + f.valor, 0) || 1;
  const desenhadas = desenhar(visiveis, total);

  return (
    <div>
      {/*
        Com prejuizo, o percentual de cada fatia passa a ser sobre a SOMA DAS
        DEDUCOES, nao sobre o bruto -- e essa soma e maior que o bruto, senao
        nao haveria prejuizo. Dizer "de cada real faturado" ali afirmaria que
        as fatias cabem dentro do faturamento, que e justamente o que deixou de
        ser verdade.
      */}
      <p className="text-sm text-tinta-media">
        {prejuizo ? (
          // "As deducoes passaram do faturamento" ja diz que ha prejuizo.
          <Oculto
            mascara={
              <>
                Composição dos{" "}
                <strong className="numerico font-semibold text-tinta">
                  {moedaRedonda(r.bruto)}
                </strong>{" "}
                faturados no mês:
              </>
            }
          >
            As deduções do mês somam{" "}
            <strong className="numerico font-semibold text-tinta">
              {moedaRedonda(total)}
            </strong>{" "}
            contra{" "}
            <strong className="numerico font-semibold text-tinta">
              {moedaRedonda(r.bruto)}
            </strong>{" "}
            faturados. A pizza mostra a proporção entre elas:
          </Oculto>
        ) : (
          <>
            De cada real dos{" "}
            <strong className="numerico font-semibold text-tinta">
              {moedaRedonda(r.bruto)}
            </strong>{" "}
            faturados no mês:
          </>
        )}
      </p>

      <div className="mt-5 flex flex-col items-center gap-8 xl:flex-row xl:gap-10">
        {/* --- A pizza --------------------------------------------------- */}
        <svg
          viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
          className="h-auto w-full max-w-[400px] shrink-0"
          role="img"
          // Sem o resultado: ele fica oculto ate alguem pedir (5.1.5).
          aria-label={`Composicao do faturamento de ${moedaRedonda(r.bruto)}: ${desenhadas
            .filter((f) => !f.resultado)
            .map((f) => `${f.rotulo} ${percentual(f.fracao)}`)
            .join(", ")}`}
        >
          {desenhadas.map((fatia) => {
            const href = linkDe(fatia);
            const caminho = (
              <path
                key={fatia.rotulo}
                d={fatia.caminho}
                fill={fatia.cor}
                stroke="var(--color-superficie)"
                strokeWidth={2}
                className={href ? "cursor-pointer hover:opacity-85" : undefined}
              >
                <title>
                  {`${fatia.rotulo}: ${moeda(fatia.valor)} (${percentual(fatia.fracao)})${
                    href ? " — clique para ver a conta" : ""
                  }`}
                </title>
              </path>
            );
            // O resultado oculto fica cinza e sem valor no balao.
            if (fatia.resultado) {
              return (
                <Oculto
                  key={fatia.rotulo}
                  mascara={
                    <path d={fatia.caminho} fill={COR_OCULTA} stroke="var(--color-superficie)" strokeWidth={2}>
                      <title>Resultado operacional (oculto)</title>
                    </path>
                  }
                >
                  {caminho}
                </Oculto>
              );
            }
            // <a> do SVG: o Link do Next nao funciona dentro de <svg>.
            return href ? (
              <a key={fatia.rotulo} href={href}>
                {caminho}
              </a>
            ) : (
              caminho
            );
          })}

          {desenhadas
            .filter((f) => f.fracao * 100 >= FATIA_MINIMA_PARA_TEXTO)
            .map((fatia) => {
              const texto = (
                <text
                  key={`rotulo-${fatia.rotulo}`}
                  x={fatia.rotuloX}
                  y={fatia.rotuloY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="numerico"
                  fontSize={15}
                  fontWeight={700}
                  fill="#ffffff"
                  // O clique atravessa o numero e chega na fatia.
                  pointerEvents="none"
                >
                  {percentual(fatia.fracao)}
                </text>
              );
              // O percentual da fatia do resultado some junto com o valor.
              return fatia.resultado ? (
                <Oculto key={`rotulo-${fatia.rotulo}`}>{texto}</Oculto>
              ) : (
                texto
              );
            })}
        </svg>

        {/* --- Legenda ---------------------------------------------------- */}
        <div className="w-full flex-1">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {fatias.map((fatia) => {
              // O rotulo ja diz "prejuizo"; o valor sai sem sinal para nao
              // virar "prejuizo de menos R$ 75 mil".
              const negativo = fatia.resultado === true && fatia.valor < 0;
              const corResultado = negativo ? "text-naopago" : "text-real";

              const item = (
                <div
                  key={fatia.rotulo}
                  className={`flex items-baseline gap-2.5 ${
                    fatia.resultado
                      ? `rounded-md px-2.5 py-1.5 ${
                          negativo ? "border border-alerta-borda bg-alerta-fundo" : "bg-real-claro"
                        }`
                      : ""
                  }`}
                >
                  <span
                    className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                    style={{ backgroundColor: fatia.cor }}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm ${
                        fatia.resultado
                          ? `font-semibold ${corResultado}`
                          : "font-medium text-tinta"
                      }`}
                    >
                      {linkDe(fatia) ? (
                        <Link
                          href={linkDe(fatia)!}
                          className="underline decoration-borda-forte underline-offset-2 hover:decoration-tinta"
                        >
                          {fatia.rotulo}
                          <span className="ml-1 text-xs font-normal text-tinta-fraca">ver a conta →</span>
                        </Link>
                      ) : (
                        fatia.rotulo
                      )}
                    </span>
                    <span
                      className={`numerico block text-base font-semibold ${
                        fatia.resultado ? corResultado : "text-tinta"
                      }`}
                    >
                      {moeda(Math.abs(fatia.valor))}
                    </span>
                    {fatia.campo && mes && (
                      <ValorDoFechamento
                        mes={mes}
                        campo={fatia.campo}
                        calculado={fechado.calculado[fatia.campo]}
                        informado={fechado.informado[fatia.campo]}
                      />
                    )}
                  </span>
                  <span
                    className={`numerico shrink-0 text-sm font-semibold ${
                      fatia.resultado ? corResultado : "text-tinta-media"
                    }`}
                  >
                    {percentual(razaoSegura(Math.abs(fatia.valor), total))}
                  </span>
                  {fatia.resultado && <BotaoResultado className="self-center" />}
                </div>
              );
              if (!fatia.resultado) return item;

              // Oculto: sem valor, sem cor e sem "lucro" ou "prejuizo" no rotulo.
              return (
                <Oculto
                  key={fatia.rotulo}
                  mascara={
                    <div className="flex items-baseline gap-2.5 rounded-md border border-borda bg-fundo px-2.5 py-1.5">
                      <span
                        className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                        style={{ backgroundColor: COR_OCULTA }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-tinta">
                          Resultado operacional
                        </span>
                        <span className="numerico block text-base font-semibold text-tinta-media">
                          {VALOR_OCULTO}
                        </span>
                      </span>
                      <BotaoResultado className="self-center" />
                    </div>
                  }
                >
                  {item}
                </Oculto>
              );
            })}
          </div>

          {/*
            Os dois subtotais que a leitura sequencial dava de graca. Sem eles,
            "recebido" e "receita real" -- que sustentam a conversa sobre a base
            da comissao -- sumiriam do grafico.
          */}
          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-2 border-t border-borda pt-4">
            <Subtotal
              rotulo="Recebido"
              valor={r.recebido}
              fracao={razaoSegura(r.recebido, r.bruto)}
            />
            <Subtotal
              rotulo="Receita real"
              valor={r.receitaReal}
              fracao={razaoSegura(r.receitaReal, r.bruto)}
              destaque
            />
          </div>
        </div>
      </div>

      {prejuizo && (
        <Oculto>
          <p className="mt-4 rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm font-semibold text-naopago">
            As deduções passaram do faturamento: prejuízo operacional de{" "}
            <span className="numerico">{moeda(Math.abs(fechado.lucroOperacional))}</span>{" "}
            no mês. Por isso não há fatia de lucro na pizza.
          </p>
        </Oculto>
      )}

      <p className="mt-5 text-xs leading-relaxed text-tinta-fraca">
        <Oculto mascara="As fatias mostram para onde foi o faturamento do mês; o resultado está oculto. ">
          {prejuizo
            ? "As fatias somam as deduções do mês, que passaram do faturamento bruto -- a diferença é o prejuízo acima. "
            : "As fatias somam exatamente o faturamento bruto. "}
        </Oculto>
        O DIFAL aparece separado
        dos demais impostos por ser devido ao estado de DESTINO, e não ao de
        origem. A tabela do raio-x, logo abaixo, traz a mesma conta em sequência.
        {fechado.temInformado &&
          " Frete, impostos ou DIFAL marcados como informados vêm do fechamento do mês; a diferença para o calculado sai do lucro. Comissões e receita real seguem o calculado."}
      </p>
    </div>
  );
}

function Subtotal({
  rotulo,
  valor,
  fracao,
  destaque,
}: {
  rotulo: string;
  valor: number;
  fracao: number;
  destaque?: boolean;
}) {
  return (
    <span>
      <span className="block text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
        {rotulo}
      </span>
      <span
        className={`numerico text-base font-semibold ${
          destaque ? "text-real" : "text-tinta"
        }`}
      >
        {moedaRedonda(valor)}
      </span>
      <span className="numerico ml-2 text-sm text-tinta-media">
        {percentual(fracao)}
      </span>
    </span>
  );
}
