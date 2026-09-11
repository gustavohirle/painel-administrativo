import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DemonstrativoResultado } from "@/lib/costing";

/*
 * Para onde foi cada real faturado.
 *
 * Uma barra so, dividida em fatias proporcionais. A versao anterior era uma
 * cascata de onze barras em degrau: correta, mas com os rotulos em alturas
 * diferentes e os textos de apoio se sobrepondo -- ilegivel justamente numa
 * tela de reuniao, que e onde ela precisa funcionar.
 *
 * A barra unica so e possivel porque as parcelas FECHAM EXATAMENTE no bruto:
 *
 *   bruto = nao pago + cancelado + reembolsado + frete
 *         + impostos + fabricacao + comissoes + lucro
 *
 * Feita em HTML/CSS, nao em SVG: larguras percentuais sao nativas, o texto e
 * texto de verdade (selecionavel, acessivel, no tamanho da fonte do sistema) e
 * nao ha geometria para desalinhar.
 */

interface Fatia {
  rotulo: string;
  valor: number;
  cor: string;
  /** O que sobra no fim -- ganha destaque e nunca some da legenda. */
  resultado?: boolean;
}

function montarFatias(dre: DemonstrativoResultado): Fatia[] {
  const r = dre.reconciliacao;

  return [
    { rotulo: "Nao pagos", valor: r.naoPago, cor: "var(--color-naopago)" },
    { rotulo: "Cancelados", valor: r.cancelado, cor: "var(--color-cancelado)" },
    { rotulo: "Reembolsados", valor: r.reembolsado, cor: "var(--color-reembolsado)" },
    { rotulo: "Frete", valor: r.frete, cor: "var(--color-frete)" },
    { rotulo: "Impostos", valor: dre.totalImpostos, cor: "var(--color-imposto)" },
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

/**
 * Abaixo desta largura o percentual nao cabe dentro da fatia.
 *
 * Numa barra de ~1270px, 3,4% da 43px -- suficiente para "4,8%" a 13px. Quem
 * fica de fora (reembolso, ~1,4%) tem o numero na legenda e no tooltip.
 */
const LARGURA_MINIMA_PARA_TEXTO = 3.4;

export function ComposicaoFaturamento({ dre }: { dre: DemonstrativoResultado }) {
  const r = dre.reconciliacao;
  const fatias = montarFatias(dre);

  const prejuizo = dre.lucroOperacional < 0;

  /*
   * Com prejuizo, as deducoes passam de 100% do bruto e a barra nao fecha.
   * Nesse caso o denominador vira a soma das deducoes: a barra continua
   * mostrando a proporcao entre elas, e o prejuizo sai num aviso separado --
   * em vez de uma barra estourada que nao quer dizer nada.
   */
  const visiveis = prejuizo ? fatias.filter((f) => !f.resultado) : fatias;
  const total = visiveis.reduce((soma, f) => soma + Math.max(0, f.valor), 0) || 1;

  const largura = (valor: number) => (Math.max(0, valor) / total) * 100;

  // Onde cada subtotal comeca, para as reguas acima da barra.
  const inicioRecebido = largura(r.naoPago + r.cancelado + r.reembolsado);
  const inicioReceitaReal = inicioRecebido + largura(r.frete);

  return (
    <div>
      <p className="text-sm text-tinta-media">
        De cada real dos{" "}
        <strong className="numerico font-semibold text-tinta">
          {moedaRedonda(r.bruto)}
        </strong>{" "}
        faturados no mes:
      </p>

      {/* --- Reguas dos subtotais --------------------------------------- */}
      <div className="relative mt-5 h-12">
        <Regua
          inicio={inicioRecebido}
          rotulo="Recebido"
          valor={r.recebido}
          fracao={razaoSegura(r.recebido, r.bruto)}
          topo={0}
        />
        <Regua
          inicio={inicioReceitaReal}
          rotulo="Receita real"
          valor={r.receitaReal}
          fracao={razaoSegura(r.receitaReal, r.bruto)}
          topo={24}
          destaque
        />
      </div>

      {/* --- A barra ----------------------------------------------------- */}
      <div
        className="flex h-16 w-full overflow-hidden rounded-lg"
        role="img"
        aria-label={`Composicao do faturamento de ${moedaRedonda(r.bruto)}: ${fatias
          .map((f) => `${f.rotulo} ${percentual(razaoSegura(f.valor, total))}`)
          .join(", ")}`}
      >
        {visiveis.map((fatia) => {
          const pct = largura(fatia.valor);
          return (
            <div
              key={fatia.rotulo}
              title={`${fatia.rotulo}: ${moeda(fatia.valor)} (${percentual(pct / 100)})`}
              className="flex items-center justify-center"
              style={{
                width: `${pct}%`,
                backgroundColor: fatia.cor,
                boxShadow: fatia.resultado
                  ? "inset 0 0 0 3px var(--color-real-claro)"
                  : undefined,
              }}
            >
              {pct >= LARGURA_MINIMA_PARA_TEXTO && (
                <span className="numerico px-1 text-[13px] font-bold text-white">
                  {percentual(pct / 100)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {prejuizo && (
        <p className="mt-3 rounded-lg border border-alerta-borda bg-alerta-fundo px-4 py-3 text-sm font-semibold text-naopago">
          As deducoes passaram do faturamento: prejuizo operacional de{" "}
          <span className="numerico">{moeda(Math.abs(dre.lucroOperacional))}</span>{" "}
          no mes.
        </p>
      )}

      {/* --- Legenda ------------------------------------------------------ */}
      <div className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
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
              {percentual(razaoSegura(fatia.valor, r.bruto))}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs leading-relaxed text-tinta-fraca">
        As oito fatias somam exatamente o faturamento bruto. Percentuais sobre o
        faturamento; a tabela do raio-x, logo abaixo, traz a mesma conta em
        sequencia, com os subtotais.
      </p>
    </div>
  );
}

/**
 * Regua acima da barra, marcando de onde ate o fim vale um subtotal.
 *
 * Existe porque a barra unica perde a leitura sequencial da cascata: sem elas,
 * "recebido" e "receita real" -- que sustentam a conversa sobre comissao --
 * sumiriam do grafico.
 */
function Regua({
  inicio,
  rotulo,
  valor,
  fracao,
  topo,
  destaque,
}: {
  inicio: number;
  rotulo: string;
  valor: number;
  fracao: number;
  topo: number;
  destaque?: boolean;
}) {
  const cor = destaque ? "var(--color-real)" : "var(--color-tinta-media)";

  return (
    <div
      className="absolute flex items-center gap-2"
      style={{ left: `${inicio}%`, right: 0, top: topo }}
    >
      <span
        className="h-3 w-px shrink-0"
        style={{ backgroundColor: cor }}
        aria-hidden
      />
      <span className="h-px flex-1" style={{ backgroundColor: cor }} aria-hidden />
      <span
        className="shrink-0 whitespace-nowrap text-xs font-semibold"
        style={{ color: cor }}
      >
        {rotulo}{" "}
        <span className="numerico">
          {moedaRedonda(valor)} · {percentual(fracao)}
        </span>
      </span>
    </div>
  );
}
