# Central de Importação (`/importar`)

Substitui os importadores do Trabalho / CLT, do MKT e do Planejamento. Nada é
gravado antes da confirmação, e o servidor refaz toda a validação ao gravar.
Não há IA: a leitura do texto é determinística (regras abaixo). O que não for
reconhecido vira aviso; nada é inventado.

## Áreas e tipos

| Área | Tipos |
|---|---|
| Pessoal | Tarefas e subtarefas · Rotinas |
| Trabalho / CLT | Tarefas e subtarefas · Campanhas · Públicos · Resultados |
| Visionário Dev / MKT | Tarefas e subtarefas · Campanhas · Públicos · Resultados |

- Só aparecem as áreas que a pessoa pode acessar (mesmas regras do menu).
- A empresa sempre precisa ser do módulo escolhido: CLT e MKT não se misturam.
- Nenhuma importação mexe em financeiro (Pessoal, Visionário Dev ou TikTok).
- Ainda não existem: receitas, despesas, clientes, serviços, reuniões e TikTok.

## Tarefas e subtarefas: texto

```
Empresa: SGIV                     (só CLT/MKT; vale para os blocos seguintes)
Título: Criar públicos personalizados
Descrição: texto livre (pode continuar nas linhas seguintes)
Prioridade: Importante            (Normal | Importante)
Data de execução: 05/11/2026      (ou 05/11 = ano atual)
Horário: 14:00
Prazo final: 08/11/2026
Dias: seg, qua, sex               (repetição semanal; "todos os dias", "dias úteis")
Observações: ...
Subtarefas:
- Criar público de engajados 365D
- Criar público semelhante 1% | prazo: 07/11/2026
  - item de checklist (linha com recuo)
---
Título: próximo registro
```

- Registros são separados por `---` ou por um novo `Título:`.
- Sem data de execução, a tarefa fica só com o prazo final. Sem nenhuma data,
  fica "sem prazo".
- Tarefas do CLT/MKT guardam uma única data. Quando há as duas, fica a
  execução e o prazo final vai para as observações (a prévia avisa).
- Pessoal sem a migração `20261102100000`: o prazo final separado vai para
  as observações (o resumo avisa).

## Rotinas: texto

```
Atividade: Academia
Dias: seg, qua, sex      (ou  Data: 12/11/2026  para um dia só)
Início: 06:30
Fim: 07:30
Observações: ...
```

## JSON

- Pode ser uma lista, `{ "tarefas": [...] }`, `{ "rotinas": [...] }` ou o
  antigo `{ "items": [...] }` do Planejamento.
- Campos em português ou inglês: `titulo/title`, `empresa/companyName`,
  `prioridade/priority`, `data_execucao/plannedDate`, `prazo_final/deadline`,
  `horario/scheduledTime`, `dias/weekdays`, `descricao/description`,
  `observacoes/notes`, `subtarefas/subtasks` (texto ou objeto com `titulo`,
  `prazo`, `descricao` e `subtarefas` para o checklist).
- No CLT/MKT, itens do antigo `items` com orçamento ou objetivo
  (`dailyBudget`, `plannedAmount`, `objective`) viram campanhas planejadas.
- Um item de outra área (por exemplo `"area": "pessoal"` importado no CLT) é
  recusado.

## Prévia, duplicados e confirmação

- A prévia mostra destino, tipo, quantidade, empresas, campos reconhecidos,
  erros e possíveis duplicados (mesmo título no mesmo escopo e empresa, ou
  repetido no arquivo).
- Duplicados começam desmarcados; quem marca, cria assim mesmo.
- Se algum item escolhido tiver erro, nada é gravado. Se o banco falhar no
  meio, o resumo lista o que entrou, o que falhou e o que não foi processado.

## Campanhas, públicos e resultados

Usam o importador inteligente que já existia (`lib/import/*`). O texto e o
JSON são os mesmos de antes, inclusive o formato antigo em português
(`publicos`/`campanhas`). A gravação é feita numa única transação
(`clt_import_bundle`): entra tudo ou nada. Os exemplos editáveis estão em
`lib/import/examples.ts`.

## Itens antigos do Planejamento

A tabela `planning_items` não foi apagada. Os itens aparecem no fim da
Central, em "Itens antigos do Planejamento", com checklist, previsto × real e
"Criar campanha". Os endereços antigos (`/planejamento`,
`/visionario/mkt/planejamento`, `/trabalho/importar` e
`/visionario/mkt/importar`) redirecionam para a Central, já na área certa.
