import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DemonstrativoResultado } from "@/lib/costing";

/*
 * Para onde foi cada real faturado.
 *
 * Pizza, e nao cascata: com a cadeia completa a cascata virava onze barras em
 * degrau, com rotulos em alturas diferentes e textos de apoio se sobrepondo --
 * ilegivel justamente numa tela de reuniao, que e onde ela precisa funcionar.
 *
 * A pizza so fecha porque as parcelas somam EXATAMENTE o bruto:
 *
 *   bruto = nao pago + cancelado + reembolsado + frete + impostos + DIFAL
 *         + fabricacao + comissoes + lucro
 *
 * Se mexer nessa conta, a pizza deixa de fechar -- e e o primeiro lugar onde
 * o erro aparece.
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
}

function montarFatias(dre: DemonstrativoResultado): Fatia[] {
  const r = dre.reconciliacao;

  // O DIFAL ja esta dentro de `totalImpostos`; aqui ele sai para virar fatia
  // propria, e o que sobra e o resto da carga tributaria.
  const difal = dre.impostos?.difal.total ?? 0;
  const outrosImpostos = Math.max(0, dre.totalImpostos - difal);

  return [
    { rotulo: "Nao pagos", valor: r.naoPago, cor: "var(--color-naopago)" },
    { rotulo: "Cancelados", valor: r.cancelado, cor: "var(--color-cancelado)" },
    { rotulo: "Reembolsados", valor: r.reembolsado, cor: "var(--color-reembolsado)" },
    { rotulo: "Frete", valor: r.frete, cor: "var(--color-frete)" },
    { rotulo: "Impostos", valor: outrosImpostos, cor: "var(--color-imposto)" },
    { rotulo: "DIFAL", valor: difal, cor: "var(--color-difal)" },
    { rotulo: "Fabricacao", valor: dre.cmv.cmv, cor: "var(--color-custo)" },
    { rotulo: "Comissoes", valor: dre.totalComissoes, cor: "var(--color-comissao)" },
    {
      rotulo: "Lucro operacional",
      valor: dre.lucroOperacional,
      cor: "var(--color-real)",
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

export function ComposicaoFaturamento({ dre }: { dre: DemonstrativoResultado }) {
  const r = dre.reconciliacao;
  const fatias = montarFatias(dre);

  const prejuizo = dre.lucroOperacional < 0;

  /*
   * Com prejuizo nao ha fatia de lucro: as deducoes sozinhas ja passam de 100%
   * do bruto. A pizza mostra a proporcao entre elas e o prejuizo sai num aviso
   * separado -- em vez de uma fatia negativa, que nao existe.
   */
  const visiveis = fatias.filter((f) => f.valor > 0);
  const total = visiveis.reduce((soma, f) => soma + f.valor, 0) || 1;
  const desenhadas = desenhar(visiveis, total);

  return (
    <div>
      <p className="text-sm text-tinta-media">
        De cada real dos{" "}
        <strong className="numerico font-semibold text-tinta">
          {moedaRedonda(r.bruto)}
        </strong>{" "}
        faturados no mes:
      </p>

      <div className="mt-5 flex flex-col items-center gap-8 xl:flex-row xl:gap-10">
        {/* --- A pizza --------------------------------------------------- */}
        <svg
          viewBox={`0 0 ${TAMANHO} ${TAMANHO}`}
          className="h-auto w-full max-w-[400px] shrink-0"
          role="img"
          aria-label={`Composicao do faturamento de ${moedaRedonda(r.bruto)}: ${desenhadas
            .map((f) => `${f.rotulo} ${percentual(f.fracao)}`)
            .join(", ")}`}
        >
          {desenhadas.map((fatia) => (
            <path
              key={fatia.rotulo}
              d={fatia.caminho}
              fill={fatia.cor}
              stroke="var(--color-superficie)"
              strokeWidth={2}
            >
              <title>
                {`${fatia.rotulo}: ${moeda(fatia.valor)} (${percentual(fatia.fracao)})`}
              </title>
            </path>
          ))}

          {desenhadas
            .filter((f) => f.fracao * 100 >= FATIA_MINIMA_PARA_TEXTO)
            .map((fatia) => (
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
              >
                {percentual(fatia.fracao)}
              </text>
            ))}
        </svg>

        {/* --- Legenda ---------------------------------------------------- */}
        <div className="w-full flex-1">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {fatias.map((fatia) => (
              <div
                key={fatia.rotulo}
                className={`flex items-baseline gap-2.5 ${
                  fatia.resultado ? "rounded-md bg-real-claro px-2.5 py-1.5" : ""
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
                        ? "font-semibold text-real"
                        : "font-medium text-tinta"
                    }`}
                  >
                    {fatia.rotulo}
                  </span>
                  <span
                    className={`numerico block text-base font-semibold ${
                      fatia.resultado ? "text-real" : "text-tinta"
                    }`}
                  >
                    {moeda(fatia.valor)}
                  </span>
                </span>
                <span
                  className={`numerico shrink-0 text-sm font-semibold ${
                    fatia.resultado ? "text-real" : "text-tinta-media"
                  }`}
                >
                  {percentual(razaoSegura(fatia.valor, total))}
                </span>
              </div>
            ))}
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
        <p className="mt-4 rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm font-semibold text-naopago">
          As deducoes passaram do faturamento: prejuizo operacional de{" "}
          <span className="numerico">{moeda(Math.abs(dre.lucroOperacional))}</span>{" "}
          no mes. Por isso nao ha fatia de lucro na pizza.
        </p>
      )}

      <p className="mt-5 text-xs leading-relaxed text-tinta-fraca">
        As fatias somam exatamente o faturamento bruto. O DIFAL aparece separado
        dos demais impostos por ser devido ao estado de DESTINO, e nao ao de
        origem. A tabela do raio-x, logo abaixo, traz a mesma conta em sequencia.
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
