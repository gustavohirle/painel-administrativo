import { NumeroDestaque } from "@/components/Cartao";
import { inteiro, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import type { DiaDeVenda } from "@/lib/metrics";

/**
 * Os numeros de um dia de vendas: quantidade, valor e ja pago, e a lista por
 * marca abaixo.
 *
 * E o quadro do dia abaixo do grafico de vendas por dia (5.16.1). Mora em
 * arquivo proprio por ser so apresentacao, sem estado: o grafico cuida de qual
 * dia esta aberto, e isto so escreve os numeros dele.
 *
 * `hoje` so troca as palavras. "O resto ainda pode entrar" e verdade no dia em
 * que o pedido nasce (pix e boleto levam horas); num dia que ja passou, o que
 * nao entrou quase sempre ja expirou ou foi cancelado.
 */
export function NumerosDoDia({ resumo, hoje }: { resumo: DiaDeVenda; hoje: boolean }) {
  const houve = resumo.quantidade > 0;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumeroDestaque
          rotulo={hoje ? "Vendas hoje" : "Vendas no dia"}
          valor={inteiro(resumo.quantidade)}
          apoio={
            houve
              ? `${inteiro(resumo.quantidadePaga)} já paga(s)`
              : hoje
                ? "Nenhum pedido ainda hoje"
                : "Nenhum pedido neste dia"
          }
        />
        <NumeroDestaque
          rotulo={hoje ? "Valor de hoje" : "Valor do dia"}
          valor={moedaRedonda(resumo.bruto)}
          apoio={hoje ? "Tudo que foi vendido hoje, pago ou não" : "Tudo que foi vendido no dia, pago ou não"}
        />
        <NumeroDestaque
          rotulo={hoje ? "Já pago hoje" : "Já pago"}
          valor={moedaRedonda(resumo.recebido)}
          apoio={
            !houve
              ? "—"
              : hoje
                ? `${percentual(razaoSegura(resumo.recebido, resumo.bruto))} do valor de hoje; o resto ainda pode entrar`
                : `${percentual(razaoSegura(resumo.recebido, resumo.bruto))} do valor do dia`
          }
          cor="var(--color-real)"
        />
      </div>

      {/*
        A lista por marca repete as tres colunas de cima -- vendas, valor e ja
        pago (23/09/2026, pedido do dono). Com uma marca so (um influencer
        escolhido) ela repetiria o total, e some.
      */}
      {resumo.porMarca.length > 1 && (
        <div className="mt-5 border-t border-borda text-sm">
          {/*
            Cabecalho so na tela grande. No celular ele consumiria uma linha
            para tres rotulos que nao cabem alinhados -- la cada valor carrega o
            proprio rotulo, embaixo do nome da marca.
          */}
          <div className="hidden border-b border-borda py-2 text-xs font-semibold uppercase tracking-wider text-tinta-fraca sm:flex sm:items-baseline sm:gap-3">
            <span className="min-w-0 flex-1">Marca</span>
            <span className="w-20 shrink-0 text-right">Vendas</span>
            <span className="w-28 shrink-0 text-right">Valor</span>
            <span className="w-28 shrink-0 text-right">Já pago</span>
          </div>

          <ul className="divide-y divide-borda">
            {resumo.porMarca.map((linha) => (
              <li key={linha.marca} className="py-2 sm:flex sm:items-baseline sm:gap-3">
                <span className="block min-w-0 truncate font-medium text-tinta sm:flex-1">
                  {linha.marca}
                </span>

                {/* Celular: os tres valores numa linha propria, cada um com o
                    seu rotulo, porque sem cabecalho eles nao se explicam. */}
                <span className="numerico mt-0.5 flex items-baseline gap-3 text-tinta-media sm:hidden">
                  <span>{inteiro(linha.quantidade)} venda(s)</span>
                  <span>{moedaRedonda(linha.bruto)}</span>
                  <span className="font-semibold text-real">{moedaRedonda(linha.recebido)} pago</span>
                </span>

                <span className="numerico hidden w-20 shrink-0 text-right text-tinta-media sm:block">
                  {inteiro(linha.quantidade)}
                </span>
                <span className="numerico hidden w-28 shrink-0 text-right text-tinta-media sm:block">
                  {moedaRedonda(linha.bruto)}
                </span>
                {/* Verde, o mesmo do "Ja pago": as duas coisas sao o mesmo
                    numero, em escalas diferentes. */}
                <span className="numerico hidden w-28 shrink-0 text-right font-semibold text-real sm:block">
                  {moedaRedonda(linha.recebido)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
