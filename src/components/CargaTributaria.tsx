import Link from "next/link";

import { moeda, moedaRedonda, percentual, razaoSegura } from "@/lib/format";
import { linhasQueSomam, type ResultadoImpostos } from "@/lib/impostos";
import { tetoEmAlerta } from "@/lib/simplesNacional";

/*
 * Para onde vai o imposto.
 *
 * Duas leituras separadas de proposito:
 *   - o que SOMA (a guia unica e os tributos recolhidos por fora);
 *   - o que ha DENTRO da guia unica (detalhamento, nao soma).
 * Empilhar as duas coisas numa lista so dobraria o imposto aos olhos de quem le.
 */
export function CargaTributaria({
  resultado,
}: {
  resultado: ResultadoImpostos;
}) {
  const somam = linhasQueSomam(resultado);
  const maiorFatia = Math.max(...somam.map((l) => l.valor), 1);

  return (
    <div className="space-y-6">
      {resultado.monitorTeto && <AvisoTeto resultado={resultado} />}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
            Imposto no mes
          </p>
          <p className="numerico mt-1 text-3xl font-semibold text-tinta">
            {moedaRedonda(resultado.totalSobreVenda)}
          </p>
          <p className="mt-1 text-sm text-tinta-media">
            {percentual(resultado.cargaSobreReceita)} do que foi recebido
          </p>
        </div>

        {resultado.simples && (
          <>
            <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
                Aliquota efetiva do Simples
              </p>
              <p className="numerico mt-1 text-3xl font-semibold text-tinta">
                {percentual(resultado.simples.aliquotaEfetiva / 100, 2)}
              </p>
              <p className="mt-1 text-sm text-tinta-media">
                Faixa {resultado.simples.faixa}, nominal de{" "}
                {percentual(resultado.simples.aliquotaNominal / 100, 0)}
              </p>
            </div>

            <div className="rounded-lg border border-borda bg-fundo px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-tinta-fraca">
                Receita dos ultimos 12 meses
              </p>
              <p className="numerico mt-1 text-3xl font-semibold text-tinta">
                {moedaRedonda(resultado.rbt12.valor)}
              </p>
              <p className="mt-1 text-sm text-tinta-media">
                {resultado.rbt12.projetado
                  ? `Projetado a partir de ${resultado.rbt12.mesesConsiderados} meses`
                  : resultado.rbt12.origem === "informado"
                    ? "Informado no cadastro fiscal"
                    : "Historico fechado de 12 meses"}
              </p>
            </div>
          </>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-base font-semibold text-tinta">
          O que e recolhido
        </h3>
        <div className="space-y-2.5">
          {somam.map((linha) => (
            <div key={linha.impostoId} className="flex items-center gap-4">
              <span className="w-32 shrink-0 text-sm font-semibold text-tinta">
                {linha.sigla}
              </span>
              <div className="h-7 flex-1 overflow-hidden rounded bg-fundo">
                <div
                  className="h-full rounded bg-bruto"
                  style={{ width: `${(linha.valor / maiorFatia) * 100}%` }}
                />
              </div>
              <span className="numerico w-36 shrink-0 text-right text-sm font-semibold text-tinta">
                {moeda(linha.valor)}
              </span>
              <span className="numerico w-20 shrink-0 text-right text-sm text-tinta-media">
                {percentual(razaoSegura(linha.valor, resultado.baseReceita))}
              </span>
            </div>
          ))}

          {somam.length === 0 && (
            <p className="text-sm text-tinta-media">
              Nenhum imposto ativo no cadastro fiscal.
            </p>
          )}
        </div>
      </div>

      {resultado.simples && resultado.detalheDoDAS.length > 0 && (
        <div>
          <h3 className="mb-1 text-base font-semibold text-tinta">
            O que ha dentro da guia unica
          </h3>
          <p className="mb-3 text-sm text-tinta-media">
            Reparticao oficial do Anexo II. E o detalhamento do DAS acima, nao
            um valor adicional.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-borda-forte text-left text-xs uppercase tracking-wider text-tinta-fraca">
                  <th className="py-2.5 pr-4 font-semibold">Tributo</th>
                  <th className="py-2.5 pr-4 text-right font-semibold">
                    Fatia da guia
                  </th>
                  <th className="py-2.5 pr-4 text-right font-semibold">
                    Sobre a receita
                  </th>
                  <th className="py-2.5 text-right font-semibold">Valor no mes</th>
                </tr>
              </thead>
              <tbody>
                {resultado.detalheDoDAS.map((linha) => (
                  <tr key={linha.impostoId} className="border-b border-borda">
                    <td className="py-2.5 pr-4">
                      <span className="font-semibold text-tinta">{linha.sigla}</span>
                      <span className="ml-2 text-xs text-tinta-fraca">
                        {linha.esfera === "estadual" ? "estadual" : "federal"}
                      </span>
                    </td>
                    <td className="numerico py-2.5 pr-4 text-right text-tinta-media">
                      {percentual(
                        razaoSegura(linha.valor, resultado.simples!.valorDAS),
                      )}
                    </td>
                    <td className="numerico py-2.5 pr-4 text-right text-tinta-media">
                      {percentual(linha.aliquota / 100, 2)}
                    </td>
                    <td className="numerico py-2.5 text-right font-semibold text-tinta">
                      {moeda(linha.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {resultado.produtosSemCadastro > 0 && (
        <div className="rounded-lg border border-alerta-borda bg-alerta-fundo px-5 py-4">
          <p className="text-sm font-semibold text-naopago">
            {resultado.produtosSemCadastro} produto(s) vendido(s) sem cadastro
            fiscal
          </p>
          <p className="mt-1 text-sm leading-relaxed text-tinta-media">
            Somam{" "}
            <strong className="numerico text-tinta">
              {moeda(resultado.receitaSemCadastro)}
            </strong>{" "}
            de receita no mes. Impostos que dependem do produto nao incidem sobre
            eles enquanto nao forem cadastrados.
          </p>
          <Link
            href="/produtos"
            className="mt-3 inline-flex rounded-md bg-tinta px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Cadastrar os produtos que faltam
          </Link>
        </div>
      )}
    </div>
  );
}

function AvisoTeto({ resultado }: { resultado: ResultadoImpostos }) {
  const monitor = resultado.monitorTeto!;
  const alerta = tetoEmAlerta(monitor.situacao);
  const neutro = monitor.situacao === "dentro";

  return (
    <div
      className={`rounded-lg border px-5 py-4 ${
        alerta
          ? "border-alerta-borda bg-alerta-fundo"
          : neutro
            ? "border-borda bg-fundo"
            : "border-borda-forte bg-fundo"
      }`}
    >
      <p
        className={`text-sm font-semibold ${alerta ? "text-naopago" : "text-tinta"}`}
      >
        {monitor.titulo}
      </p>
      <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
        {monitor.explicacao}
      </p>

      <div className="mt-4 space-y-3">
        <BarraLimite
          rotulo="Sublimite estadual de ICMS"
          uso={monitor.usoDoSublimite}
          limite="R$ 3,6 mi"
          alerta={monitor.usoDoSublimite >= 1}
        />
        <BarraLimite
          rotulo="Teto do Simples Nacional"
          uso={monitor.usoDoTeto}
          limite="R$ 4,8 mi"
          alerta={monitor.usoDoTeto >= 1}
        />
      </div>
    </div>
  );
}

function BarraLimite({
  rotulo,
  uso,
  limite,
  alerta,
}: {
  rotulo: string;
  uso: number;
  limite: string;
  alerta: boolean;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
        <span className="font-medium text-tinta-media">{rotulo}</span>
        <span className="numerico font-semibold text-tinta">
          {percentual(uso, 0)} de {limite}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-superficie">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, uso * 100)}%`,
            backgroundColor: alerta ? "var(--color-naopago)" : "var(--color-real)",
          }}
        />
      </div>
    </div>
  );
}
