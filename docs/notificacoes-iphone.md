# Notificações — como funcionam e como validar no iPhone

## Arquitetura (o que já é automático)

- **Agendamento no servidor**: o Supabase Cron (`pg_cron` + `pg_net`, ver
  `supabase/cron/task_reminders.sql`) chama `/api/cron/task-reminders` a cada
  minuto. O cron da Vercel (`vercel.json`, 12:00 UTC = 09:00 em São Paulo) é só
  reserva. Nada depende de JavaScript rodando com a página aberta.
- **Regras** em `lib/push/schedule-reminders.ts` (testadas em
  `lib/push/schedule-reminders.test.ts`):
  - execução: no horário e/ou 15 min, 30 min, 1 h, 1 dia antes;
  - prazo: véspera ("termina amanhã") e último dia, no horário escolhido em
    Configurações (padrão 09:00);
  - atraso: dia seguinte ao prazo, +3 e +7 dias;
  - vale para tarefas, subtarefas (Pessoal, CLT, Visionário) e atividades
    da Rotina com lembrete.
- **Sem duplicidade**: o aviso nasce do registro original, não da tela; cada
  aviso tem `event_key` único travado em `push_delivery_log`. Rotina vinculada
  e execução da tarefa no mesmo minuto viram um aviso só.
- **Concluir/reagendar**: o estado é lido na hora do envio. Concluída = sem
  mais avisos (nem de atraso). Reagendada = chave nova; a antiga nunca mais
  coincide.

## Requisitos reais do Web Push no iOS

1. iOS/iPadOS **16.4 ou mais novo**.
2. O VS Planner precisa estar **instalado na Tela de Início** (Safari →
   Compartilhar → Adicionar à Tela de Início) e aberto pelo ícone. No Safari
   comum o iPhone não oferece push.
3. A permissão só pode ser pedida a partir de um **toque** (botão "Ativar
   notificações" em Configurações).
4. Cada aparelho tem a sua inscrição; ativar no computador não ativa no iPhone.
5. Modo Foco / Resumo programado do iOS podem atrasar ou agrupar avisos.

## Roteiro de teste manual (iPhone físico)

> Testes automatizados não confirmam a entrega no iPhone. Faça este roteiro
> depois de aplicar a migration `20261102100000`.

1. Instale o app na Tela de Início e abra pelo ícone.
2. Configurações → **Ativar notificações** → permitir. A linha "Neste
   aparelho" deve mostrar "permissão concedida · app instalado".
3. **Enviar teste** → a notificação deve chegar.
4. Feche o app (deslize para cima na multitarefa) e bloqueie a tela.
5. Crie uma subtarefa com "Fazer no dia" = hoje e horário = daqui a 3 min,
   lembrete "No horário". Aguarde: deve chegar
   "VS Planner • Lembrete — <Tarefa> — <Subtarefa> está programado para hoje às HH:MM."
6. Crie outra com lembrete "15 min antes" para daqui a 20 min → deve chegar
   ~5 min depois.
7. Conclua uma subtarefa antes do horário → **não** deve chegar aviso.
8. Reagende o horário de uma subtarefa → só o novo horário deve avisar.
9. Vincule uma tarefa à Rotina no mesmo horário da execução → deve chegar
   **um** aviso só.
10. Toque na notificação → o app abre na tela certa (Meu Dia / Rotina / Tarefas).

Se nada chegar: Supabase → SQL do arquivo `supabase/cron/task_reminders.sql`
(seção Diagnóstico) mostra se o cron rodou e o `push_delivery_log` mostra
`status`/`last_error` de cada envio.
