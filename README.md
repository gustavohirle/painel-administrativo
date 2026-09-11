# Painel Administrativo

Painel financeiro para lojas Nuvemshop. Cruza os pedidos da API com os custos
de fabricação e os contratos de comissão de influencers, para responder três
perguntas que o painel da própria Nuvemshop não responde:

1. **Quanto realmente entrou?** Faturamento bruto inclui pedido cancelado,
   reembolsado e boleto que nunca foi pago.
2. **Quanto sobrou depois de fabricar?** Custo de matéria-prima, embalagem,
   mão de obra e rateio indireto por produto.
3. **Quanto sobrou depois das comissões?** Contratos de influencer com base de
   cálculo configurável.

---

## Como rodar

Requisitos: **Node.js 20 ou superior**.

```bash
npm install
npm run dev
```

Abre em <http://localhost:3000>.

Sem nenhuma configuração, o painel sobe em **modo demonstração**: dados
fictícios determinísticos, sem banco, sem internet. É o modo usado para
apresentar o projeto.

Dá para rodar `npm run build` com o `npm run dev` ligado: cada um escreve num
diretório próprio (`.next` e `.next-dev`). Compartilhar a mesma pasta fazia o
servidor de desenvolvimento passar a responder 500 com `Cannot find module
'./833.js'`.

### Testes

```bash
npm test
```

Cobrem as funções puras de cálculo (`lib/metrics.ts` e `lib/costing.ts`) e
verificam que os totais da base de demonstração batem com o cenário esperado.

---

## Telas

| Rota | Perfil | O que faz |
|---|---|---|
| `/entrar` | — | Login. Em modo demonstração, mostra as credenciais de teste |
| `/` | dono | Composição do faturamento (para onde vai cada real), raio-x do resultado, carga tributária, simulador de comissão, meios de pagamento, evolução de 6 meses |
| `/custos` | dono, estoque | Custo de fabricação por produto/variante. Preço de venda e margem só para o dono |
| `/comissoes` | dono | Influencers: contrato de comissão **e** regime tributário de cada marca |
| `/impostos` | dono | Catálogo dos tributos que podem incidir sobre um produto, por regime, e a apuração marca a marca |
| `/produtos` | dono, estoque | Influencer dono, NCM e composição dos kits. Os impostos vêm do regime do influencer |
| `/estoque` | dono, estoque | Saldo por item e registro de contagens |

O seletor de mês no topo vale para todas as telas.

### Perfis de acesso

| | dono | estoque |
|---|---|---|
| Painel, comissões, impostos | vê | **não vê** |
| Custo de fabricação (cadastro) | vê | vê |
| Preço de venda, margem, receita, lucro | vê | **não vê** |
| Produtos e estoque | vê | vê |

Custo de fabricação é uma área separada do financeiro de propósito: quem está na
fábrica é quem sabe quanto custa a matéria-prima, então precisa cadastrar. Mas a
mesma tela esconde preço de venda e margem para esse perfil — isso é quanto a
empresa ganha, não quanto o produto custa.

A verificação é feita **no servidor**, antes de a página montar — digitar a URL
não contorna. Esconder o link no menu é só conveniência.

Credenciais da demonstração: `dono` / `dono123` e `estoque` / `estoque123`.

---

## Modo demonstração x modo real

Controlado por `FONTE_DADOS` no `.env`.

| | `demo` (padrão) | `live` |
|---|---|---|
| Pedidos | gerador determinístico com seed fixo | API da Nuvemshop |
| Custos e comissões | arquivo local `.demo-data/` | PostgreSQL via Prisma |
| Internet | dispensável | obrigatória |
| Selo "Dados de demonstração" | visível | oculto |

O `if` que decide entre os dois vive num lugar só: [`src/data/index.ts`](src/data/index.ts).
As funções de cálculo não sabem qual modo está ativo.

### Ligando o modo real

1. Copie `.env.example` para `.env`.
2. Preencha as credenciais da Nuvemshop. Uma loja por marca:

   ```env
   NUVEMSHOP_LOJAS='[{"marca":"Aurora Beleza","storeId":"123","accessToken":"abc"}]'
   ```

   Ou, para uma loja só, `NUVEMSHOP_STORE_ID` + `NUVEMSHOP_ACCESS_TOKEN`.
3. Crie um banco no [Neon](https://neon.tech) e cole a connection string em
   `DATABASE_URL`.
4. Prepare o banco:

   ```bash
   npm run db:push
   npm run db:seed
   ```

5. Troque `FONTE_DADOS=live` e reinicie.

Depois de ligar, confira os totais de um mês já fechado contra o painel da
própria Nuvemshop antes de mostrar para alguém.

---

## Como o cálculo funciona

Toda a regra de negócio vive em dois arquivos puros — sem React, sem I/O:

- [`src/lib/metrics.ts`](src/lib/metrics.ts) — reconciliação de faturamento,
  comissão, agrupamento por marca e por meio de pagamento, evolução mensal.
- [`src/lib/costing.ts`](src/lib/costing.ts) — CMV, comissões por contrato,
  DRE e rentabilidade por produto.

A cadeia completa é:

```
bruto − não pago − cancelado − reembolsado = recebido
recebido − frete                           = receita real
receita real − impostos sobre a venda      = receita líquida
receita líquida − CMV                      = margem de contribuição
margem de contribuição − comissões         = lucro operacional
```

Cada pedido entra em **exatamente uma** categoria de dedução, seguindo a
precedência `cancelado > reembolsado > não pago > recebido`. Sem isso, um
pedido cancelado e pendente seria contado duas vezes e a cascata não fecharia.

### Kits

A Nuvemshop entrega o kit como **um** produto — ela não decompõe. O cadastro de
composição é o que permite baixar o estoque dos componentes certos e somar o
custo de fabricação real do kit. Ficha de custo própria do kit vence a soma das
partes; componente sem custo torna o kit inteiro desconhecido, em vez de
devolver uma soma parcial que pareceria certa.

### Estoque

O painel guarda **contagens com data**, não um saldo. O saldo atual é sempre
`última contagem − o que saiu desde ela`, incluindo o que saiu dentro de kits.
Assim o cálculo é idempotente: recarregar a página não derruba o estoque.

### Impostos

**O regime é do influencer, não da empresa toda** — não há configuração global
de regime. Cada marca é uma operação separada: as menores cabem no Simples
Nacional, as maiores passariam do teto e ficam no Lucro Presumido. A apuração é
marca a marca, com RBT12 próprio — somar as cinco jogaria uma empresa pequena
numa faixa que não é a dela.

A aba `/impostos` é o **catálogo dos tributos possíveis sobre um produto**,
organizado pelo regime em que cada um vale, já cadastrado com os básicos e
editável. O regime de cada marca se edita em `/comissoes`.

A cadeia é **produto → influencer → regime → impostos**. Escolher o influencer
no cadastro do produto já traz os tributos daquele regime marcados.

No Simples, a alíquota que se paga é a **efetiva** — a da tabela menos a parcela
a deduzir. O que está dentro da guia única nunca soma no total; a quebra por
tributo é só leitura.

O painel acompanha os dois limites do regime por marca: o sublimite estadual de
ICMS (R$ 3,6 mi) e o teto (R$ 4,8 mi). Tributo do regime que está sem alíquota
informada não some da tela — aparece como lacuna declarada, com o aviso de que
o imposto real é maior que o exibido.

### Produtos sem custo ou sem cadastro fiscal

Não somem do cálculo em silêncio. O painel mostra quantos são e quanta receita
representam, e o lucro operacional é declarado como calculado sobre o restante.

---

## Estrutura

```
src/
  types/nuvemshop.ts    tipos espelhando a API oficial
  types/dominio.ts      custo de fabricação e contrato de comissão
  data/                 fontes de dados e repositórios (demo e real)
  lib/                  cálculo puro, formatação pt-BR, config
  components/           interface
  app/                  rotas do App Router e Server Actions
prisma/schema.prisma    só custo e comissão -- pedidos não são replicados
```

Documentação de contexto do projeto: [CLAUDE.md](CLAUDE.md).

---

## Aviso

Os dados de demonstração são inteiramente fictícios. Marcas, produtos, clientes
e influencers foram inventados e não correspondem a nenhuma empresa ou pessoa
real.

As alíquotas e o enquadramento tributário semeados são **ponto de partida, não
apuração**. Eles mudam por NCM, por regime, por destino da venda e por benefício
fiscal estadual. Confirme com o contador antes de usar qualquer número fiscal
deste painel para recolher imposto.
