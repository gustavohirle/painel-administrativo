-- Despesas de influencer: de seis categorias para DUAS (23/09/2026).
--
-- Regra do dono: o que tem "marketing" no NOME vira `marketing`; todo o resto
-- vira `outros`. O nome e o que vale, e nao a categoria antiga, porque os
-- lancamentos vieram do plano de contas da contabilidade ja com o nome escrito
-- ("Tha Beauty - Marketing", "Folha de pagamento") e a categoria antiga foi
-- preenchida no palpite da importacao.
--
-- E a mesma regra de `categoriaPelaDescricao`, em `src/types/dominio.ts`.
-- Rodar duas vezes nao muda nada: a segunda passada reencontra o mesmo valor.

begin;

update "DespesaInfluencer"
   set categoria = case
         when descricao ilike '%marketing%' then 'marketing'
         else 'outros'
       end,
       "atualizadoEm" = now()
 where categoria is distinct from (
         case when descricao ilike '%marketing%' then 'marketing' else 'outros' end
       );

select categoria, count(*) as linhas, sum(valor) as total
  from "DespesaInfluencer"
 group by categoria
 order by categoria;

commit;
