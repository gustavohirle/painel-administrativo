/**
 * O resultado de cada mes da base, com as MESMAS funcoes da tela inicial.
 *
 *     npm run resultado:mensal
 *
 * Existe porque a pizza (5.1) e de UM mes -- ela segue o seletor do cabecalho
 * --, e depois que a janela passou para 13 meses a pergunta natural virou
 * "quanto sobrou no periodo inteiro". Na tela isso e a aba Relatorios, que tem
 * periodo proprio; aqui e a mesma conta, em texto, para conferir de uma vez.
 *
 * Nenhuma aritmetica propria: `montarDemonstrativo` sobre os pedidos de cada
 * mes, como a pagina faz. Se um numero daqui divergir da tela, e defeito.
 */

import { lerCache } from "@/data/cachePedidos";
import { RepositorioPostgres } from "@/data/prismaCostRepository";
import { montarDemonstrativo, ratearDespesas } from "@/lib/costing";
import { chaveMes, filtrarPorMes, mesesDisponiveis } from "@/lib/metrics";
import { apurarImpostos } from "@/lib/impostos";
import { apurarTaxasPlataforma } from "@/lib/plataforma";

const mil = (n: number) =>
  (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main() {
  const repositorio = new RepositorioPostgres();
  const { pedidos } = await lerCache();

  const [produtos, custos, influencers, impostosCadastrados, taxas, aliquotas, despesas] =
    await Promise.all([
      repositorio.listarProdutos(),
      repositorio.listarCustos(),
      repositorio.listarInfluencers(),
      repositorio.listarImpostos(),
      repositorio.listarTaxasPlataforma(),
      repositorio.listarAliquotasEstaduais(),
      repositorio.listarDespesasInfluencer(),
    ]);

  // A divisao das compartilhadas usa o mes INTEIRO, antes de qualquer filtro.
  const despesasComDono = ratearDespesas(despesas, pedidos, influencers);
  const meses = mesesDisponiveis(pedidos);

  console.log(`\n${pedidos.length} pedidos, ${meses.length} meses, ${custos.length} fichas de custo\n`);
  console.log(
    "mes       bruto  recebido  fabricacao  cobertura  impostos    taxas  influenc.   socios    LUCRO  margem",
  );
  console.log("-".repeat(104));

  const total = { bruto: 0, recebido: 0, cmv: 0, impostos: 0, taxas: 0, inf: 0, socios: 0, lucro: 0 };

  for (const mes of meses) {
    const doMes = filtrarPorMes(pedidos, mes);
    // O historico para o RBT12 vai ate o mes em questao, e nao ate hoje: a
    // faixa do Simples daquele mes era a que valia naquele mes.
    const historico = pedidos.filter((p) => chaveMes(p.created_at) <= mes);

    const dre = montarDemonstrativo(doMes, custos, influencers, {
      produtos,
      impostos: apurarImpostos(doMes, historico, produtos, impostosCadastrados, influencers, aliquotas),
      taxasPlataforma: apurarTaxasPlataforma(doMes, taxas),
      despesasInfluencers: despesasComDono,
    });

    const r = dre.reconciliacao;
    total.bruto += r.bruto;
    total.recebido += r.recebido;
    total.cmv += dre.cmv.cmv;
    total.impostos += dre.totalImpostos;
    total.taxas += dre.totalTaxasPlataforma;
    total.inf += dre.totalInfluencers;
    total.socios += dre.participacaoSocios;
    total.lucro += dre.lucroOperacional;

    console.log(
      [
        mes,
        mil(r.bruto).padStart(8),
        mil(r.recebido).padStart(9),
        mil(dre.cmv.cmv).padStart(11),
        pct(dre.cmv.cobertura).padStart(10),
        mil(dre.totalImpostos).padStart(9),
        mil(dre.totalTaxasPlataforma).padStart(8),
        mil(dre.totalInfluencers).padStart(10),
        mil(dre.participacaoSocios).padStart(8),
        mil(dre.lucroOperacional).padStart(8),
        pct(dre.margemOperacionalPercentual).padStart(7),
      ].join(" "),
    );
  }

  console.log("-".repeat(104));
  console.log(
    [
      "TOTAL ",
      mil(total.bruto).padStart(8),
      mil(total.recebido).padStart(9),
      mil(total.cmv).padStart(11),
      "".padStart(10),
      mil(total.impostos).padStart(9),
      mil(total.taxas).padStart(8),
      mil(total.inf).padStart(10),
      mil(total.socios).padStart(8),
      mil(total.lucro).padStart(8),
    ].join(" "),
  );
  console.log("\n(valores em R$ mil)\n");

  /*
   * A despesa de influencer so existe nos meses em que alguem a cadastrou. Nos
   * outros o lucro sai MAIOR que o verdadeiro, e isso precisa estar escrito --
   * senao a serie parece dizer que a operacao piorou quando na verdade foi o
   * cadastro que comecou.
   */
  const mesesComDespesa = [...new Set(despesas.map((d) => d.data.slice(0, 7)))].sort();
  if (mesesComDespesa.length && mesesComDespesa.length < meses.length) {
    console.log(
      `ATENCAO: ha despesa de influencer cadastrada so em ${mesesComDespesa.join(", ")}.`,
    );
    console.log("Nos outros meses o lucro sai MAIOR que o verdadeiro.\n");
  }
}

main().catch((erro: unknown) => {
  console.error(erro);
  process.exitCode = 1;
});
