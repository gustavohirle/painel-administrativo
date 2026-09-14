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
        Dados lidos da API da Nuvemshop. Custos de fabricação e comissões vêm
        dos cadastros deste painel.
      </footer>
    );
  }

  return (
    <footer className="rounded-xl border border-alerta-borda bg-alerta-fundo px-6 py-5">
      <p className="text-sm font-semibold text-naopago">
        Todos os números desta tela são fictícios
      </p>
      <p className="mt-1 max-w-4xl text-sm leading-relaxed text-tinta-media">
        Marcas, produtos, clientes e influencers foram inventados para esta
        demonstração. Nenhum dado real de loja foi utilizado. A estrutura de
        cálculo, essa sim, é a definitiva: quando a integração com a Nuvemshop
        for ligada, as mesmas contas passam a rodar sobre os pedidos reais.
      </p>
    </footer>
  );
}
