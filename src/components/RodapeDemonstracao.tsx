/**
 * Rodape com a origem dos numeros.
 *
 * Junto com o selo do cabecalho, garante que ninguem saia da reuniao achando
 * que viu os numeros reais da propria empresa.
 */
export function RodapeDemonstracao({ demonstracao }: { demonstracao: boolean }) {
  if (!demonstracao) {
    return (
      <footer className="pt-2 pb-6 text-xs text-tinta-fraca">
        Dados lidos da API da Nuvemshop. Custos de fabricacao e comissoes vem
        dos cadastros deste painel.
      </footer>
    );
  }

  return (
    <footer className="rounded-xl border border-alerta-borda bg-alerta-fundo px-6 py-5">
      <p className="text-sm font-semibold text-naopago">
        Todos os numeros desta tela sao ficticios
      </p>
      <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
        Marcas, produtos, clientes e influencers foram inventados para esta
        demonstracao. Nenhum dado real de loja foi utilizado. A estrutura de
        calculo, essa sim, e a definitiva: quando a integracao com a Nuvemshop
        for ligada, as mesmas contas passam a rodar sobre os pedidos reais.
      </p>
    </footer>
  );
}
