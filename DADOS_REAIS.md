# Ligando os dados reais da Nuvemshop

Roteiro para quando a chave da API chegar. O aplicativo foi criado na
Nuvemshop com o nome **painel-de-relatrios**.

A demonstração continua como está: ela roda na porta **3000** com o `.env` de
sempre. Os dados reais rodam **separados**, na porta **3001**, com o
`.env.live`. Um não mexe no outro.

---

## O que já está pronto

| Peça | Situação |
|---|---|
| `.env.live` | criado, com segredo de sessão, senhas e senha do banco já gerados. **Falta só a chave.** |
| Banco | o Postgres 18 desta máquina (porta 5432). O usuário `painel` e o banco `painel` são criados pelo passo 2. |
| Leitura dos pedidos | testada contra uma API falsa no formato documentado: 45 mil pedidos, limite de chamadas, paginação, chave errada. **Nunca rodou com a loja real.** |
| Senhas | `dono` e `estoque`, com as senhas que estão em `SENHA_DONO` e `SENHA_ESTOQUE` no `.env.live`. As da demonstração (`dono123`) são recusadas. |

---

## Passo a passo

### 1. Colar a chave

Cada influencer tem a **sua** loja na Nuvemshop, e cada loja tem a sua chave.
No `.env.live` há um bloco por loja, numerado a partir de 1 (até 20):

```env
NUVEMSHOP_LOJA_2_MARCA="Nome da Marca"
NUVEMSHOP_LOJA_2_STORE_ID=1234567
NUVEMSHOP_LOJA_2_TOKEN=a1b2c3...
```

- **STORE_ID**: o número da loja (a Nuvemshop também chama de `user_id`; vem
  junto da chave).
- **TOKEN**: a chave. Não expira. Sem aspas e sem espaço.
- **MARCA**: o nome da loja no painel. O contrato do influencer, na aba
  Influencers, precisa usar **exatamente** este texto — é por ele que o painel
  liga venda a contrato e produto a influencer. "Luma Cosméticos" e "Luma
  Cosmeticos" são duas marcas diferentes para ele.

Bloco com o TOKEN em branco é ignorado: dá para deixar o bloco pronto e colar
a chave depois. Bloco com chave e sem MARCA, ou com STORE_ID que não é
número, impede o painel de subir com uma mensagem dizendo qual bloco
corrigir. A mesma loja ou a mesma marca em dois blocos também.

A linha antiga `NUVEMSHOP_LOJAS='[{"marca":...,"storeId":...,"accessToken":...}]'`
continua aceita, e soma com os blocos.

**Depois de colar uma chave nova**, nesta ordem:

1. `npm run nuvemshop:testar` — confere se a chave vale, loja por loja;
2. `npm run nuvemshop:sincronizar` — a primeira busca da loja nova leva
   minutos (a Tha levou 5 para 3 meses). Com o painel no ar, ele busca
   sozinho em segundo plano, e o rodapé diz qual loja ainda não entrou nos
   números;
3. na aba **Influencers**, cadastre o contrato com a marca da loja (ela já
   aparece na lista);
4. na aba **Produtos**, "Trazer da Nuvemshop": os produtos da loja entram já
   com o influencer dela.

Chave recusada numa loja não derruba as outras: ela fica com a cópia anterior
e o motivo aparece no rodapé.

**Não cole a chave em conversa, e-mail ou print.** Ela dá acesso a todos os
pedidos da loja. O `.env.live` não vai para o git.

Se a Nuvemshop entregou um **código** (`?code=...` no endereço depois de
instalar o aplicativo) em vez da chave, preencha `NUVEMSHOP_CLIENT_ID` e
`NUVEMSHOP_CLIENT_SECRET` no `.env.live` e rode:

```bash
npm run nuvemshop:token -- O_CODIGO
```

Ele mostra o bloco pronto para colar. O código vale uma vez só e por pouco
tempo.

### 2. Preparar o banco (uma vez só)

```bash
npm run live:preparar
```

Pede a **senha do usuário `postgres`**, a que foi escolhida quando o
PostgreSQL foi instalado. Ela não é gravada. O comando cria o usuário e o banco,
monta as tabelas e cadastra tributos, alíquotas dos estados, taxas de
pagamento e os dois usuários.

Pode rodar de novo sem estragar nada.

### 3. Testar a chave

```bash
npm run nuvemshop:testar
```

Para cada loja, mostra: se a chave foi aceita, o nome da loja, os pedidos da
última semana, como o painel classificou cada um e **quais campos vieram
vazios**. Leia com atenção:

- **meios de pagamento**: o que aparecer como desconhecido precisa de taxa
  cadastrada na aba Impostos;
- **status que o painel não conhece**: contam como recebido e podem estar
  errados. Avise antes de seguir;
- **campos vazios**: frete ou estado vazio em todo pedido indica que a API
  mudou o nome do campo. Avise antes de seguir.

### 4. Trazer os pedidos

```bash
npm run nuvemshop:sincronizar
```

Busca os últimos 13 meses. Na primeira vez leva alguns minutos (numa base de
45 mil pedidos foram 3 minutos): a Nuvemshop libera 2 chamadas por segundo.
Depois disso o painel só pede o que mudou, sozinho, a cada 10 minutos.

### 5. Subir o painel com dados reais

```bash
npm run start:live
```

Abra **http://127.0.0.1:3001** neste computador e entre com `dono` e a
`SENHA_DONO` do `.env.live`.

Antes de mostrar para alguém, **confira um mês fechado** contra o relatório da
própria Nuvemshop: faturamento, quantidade de pedidos, cancelados.

### 6. Cadastrar o que a Nuvemshop não sabe

O banco real começa sem contratos, produtos e custos. Os da demonstração são
inventados e não entram. Enquanto nada disso é cadastrado, o lucro da tela
aparece **alto demais**, e a própria tela avisa em vermelho.

Na ordem:

1. **Influencers**: um contrato por marca, com o nome da marca igual ao do
   `.env.live`, o percentual, a base e o regime tributário.
2. **Produtos**: dono (influencer) e impostos de cada produto que vendeu.
3. **Custos**: ficha de fabricação de cada produto.
4. **Influencers → despesa compartilhada**: o Operacional de R$ 60 mil, mês a
   mês. Não é repetido sozinho.
5. **Impostos** e **DIFAL**: conferir alíquotas com o contador.
6. **Estoque**: primeira contagem de cada produto.

### 7. Acesso de fora (opcional)

Com dados reais o login **só funciona com HTTPS**: senha e sessão não podem
viajar abertas. Pelo IP fixo (`http://177.223.44.178`) não entra.

Para abrir no celular ou em outro computador, use um túnel:

```bash
cloudflared tunnel --url http://127.0.0.1:3001
```

O endereço muda cada vez que o túnel sobe (ver `DEMONSTRACAO.md`). Para um
endereço fixo, é preciso um túnel nomeado com domínio próprio.

---

## Se algo der errado

| Mensagem | O que fazer |
|---|---|
| "a chave da loja ... foi recusada" | conferir o `accessToken` e se o aplicativo tem permissão de ler pedidos |
| "a loja ... não foi encontrada" | conferir o `storeId` |
| "a Nuvemshop recusou a requisição" | conferir `NUVEMSHOP_USER_AGENT` |
| "NUVEMSHOP_LOJAS não é um JSON válido" | aspas simples por fora, aspas duplas por dentro, tudo numa linha (ou troque pelos blocos numerados) |
| "A loja N do .env.live tem chave, mas falta ..." | preencha a MARCA ou o STORE_ID daquele bloco |
| "A marca X está em duas lojas" | cada bloco precisa de uma marca própria |
| senha do `postgres` recusada | é a senha da instalação do PostgreSQL; sem ela, redefina pelo pgAdmin |
| rodapé do painel diz "a última atualização falhou" | os números são da cópia anterior; o motivo está escrito ali |
| números estranhos depois de mudar algo | `npm run nuvemshop:sincronizar -- --completa` busca tudo de novo |

Os pedidos copiados ficam em `.live-data/pedidos.json`, **sem nome, e-mail,
telefone, documento nem endereço de cliente**, só o estado de destino. Mesmo
assim é dado da empresa: a pasta não vai para o git.
