# Contexto do Projeto - meupainel

Use este arquivo como leitura inicial antes de fazer qualquer mudanca nova neste projeto.
Ele resume a arquitetura, os fluxos principais e onde mexer sem precisar redescobrir tudo do zero.

Frase util para proximas tarefas:

> Leia `CONTEXTO_DO_PROJETO.md` antes de alterar o projeto.

## Visao geral

`meupainel` e uma stack Docker para operar um painel de disparos ADS via WhatsApp.
Ela junta:

- Evolution API para conectar/enviar/receber WhatsApp.
- Backend Node.js/Express chamado `orchestrator`.
- Painel web estatico em HTML/CSS/JS chamado `admin-ui`.
- PostgreSQL para historico, configuracoes, ADS e lembretes.
- Redis para cache, travas simples e estados temporarios de conversa.
- n8n para automacoes visuais.
- Nginx Proxy Manager opcional para proxy e SSL.

O produto principal hoje e o painel "Mega App | Disparo ADS", acessado pelo navegador, com envio para grupos de WhatsApp, historico, monitoramento de grupo, comandos por WhatsApp e integracao com a API The Best.

## Estrutura de pastas

```text
meupainel/
  README.md
  docker-compose.yml
  .env.example
  .github/workflows/deploy.yml
  scripts/deploy-vps.sh
  postgres/init-app.sql
  orchestrator/
    package.json
    Dockerfile
    src/server.js
  admin-ui/
    Dockerfile
    nginx.conf
    index.html
    styles.css
    app.js
    favicon.svg
```

Pastas vizinhas `https-meupainel-megaapp-tech-ads` e `https-meupainel-megaapp-tech-ads-2` parecem artefatos/capturas de browser, nao o projeto principal.

## Como a stack sobe

O arquivo central e `docker-compose.yml`.

Servicos:

- `postgres`: banco principal do backend e do n8n.
- `evolution-postgres`: banco separado da Evolution API.
- `redis`: usado por Evolution, n8n e backend.
- `evolution-api`: WhatsApp, webhooks e grupos.
- `n8n`: automacoes.
- `n8n-worker`: worker do n8n em modo fila.
- `orchestrator`: backend Node que concentra regras de negocio.
- `admin-ui`: Nginx servindo o painel e fazendo proxy para o backend.
- `npm`: Nginx Proxy Manager opcional, ativado pelo profile `proxy-manager`.

Comandos principais:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f orchestrator
```

Deploy na VPS:

- Push na branch `main` dispara `.github/workflows/deploy.yml`.
- O workflow entra por SSH e roda `scripts/deploy-vps.sh`.
- O script faz `git fetch`, `git reset --hard origin/main`, `docker compose up -d --build` e `docker compose ps`.

## Variaveis importantes

Modelo em `.env.example`.

Criticas:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `EVOLUTION_POSTGRES_USER`, `EVOLUTION_POSTGRES_PASSWORD`, `EVOLUTION_POSTGRES_DB`
- `REDIS_PASSWORD`
- `EVOLUTION_API_KEY`
- `EVOLUTION_SERVER_URL`
- `EVOLUTION_INSTANCE_NAME`
- `ORCHESTRATOR_WEBHOOK_SECRET`
- `UI_ADMIN_TOKEN`
- `UI_ADMIN_USER`
- `UI_ADMIN_PASSWORD`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_AUDIO_TRANSCRIPTION_MODEL`
- `ADS_TAX_RATE`
- `THE_BEST_API_KEY`
- `THE_BEST_PER_USER_API_KEYS_JSON`
- `THE_BEST_TIMEZONE_OFFSET`
- `THE_BEST_MAX_PAGES`
- `TDS_CREDIT_ALERT_THRESHOLD`
- `TDS_CREDIT_ALERT_INTERVAL_MS`

Nao commitar `.env`, chaves ou tokens reais.

## Backend: orchestrator

Arquivo principal:

```text
orchestrator/src/server.js
```

Stack:

- Express.
- `pg` para PostgreSQL.
- `ioredis` para Redis.
- `openai` para respostas de IA e transcricao de audio.
- `read-excel-file` para importar planilhas ADS.

O backend concentra tudo em um arquivo grande. Antes de mexer, use `rg` por endpoint ou funcao.

Comandos uteis:

```bash
rg -n "^app\\.|^async function |^function " orchestrator/src/server.js
rg -n "monitor|reminder|thebest|ads|Evolution|OpenAI" orchestrator/src/server.js
```

### Endpoints principais

Saude:

- `GET /health`: testa PostgreSQL e Redis.

Admin/painel:

- `POST /admin/login`: login do painel; cria cookie HTTP-only `mega_admin`.
- `GET /admin/summary`: totais, mensagens recentes, status dos servicos e WhatsApp.
- `POST /admin/test-reply`: testa resposta de IA.
- `GET /admin/ads/groups`: lista grupos do WhatsApp com filtro.
- `GET /admin/ads/history`: historico de disparos ADS.
- `POST /admin/ads/import-file`: importa `.xlsx` ou `.csv`.
- `POST /admin/ads/preview`: interpreta texto/planilha e monta previa dos envios.
- `POST /admin/ads/send`: envio direto.
- `POST /admin/ads/send-jobs`: cria job de envio com progresso.
- `GET /admin/ads/send-jobs/:id/events`: Server-Sent Events para progresso do envio.
- `GET /admin/monitor/groups`: lista grupos para monitoramento.
- `GET /admin/monitor/settings`: le grupo monitorado.
- `POST /admin/monitor/settings`: salva grupo monitorado.
- `GET /admin/thebest/tds-resellers`: lista revendas TDS.
- `POST /admin/thebest/resellers/:id/transfer-credits`: transfere creditos para revenda.

WhatsApp/Evolution:

- `GET /connect-whatsapp`: pagina simples com QR Code/status da instancia.
- `POST /webhooks/evolution`
- `POST /webhooks/evolution/:event`

Webhooks ADS externos:

- `POST /webhooks/ads/:campaign`: salva totais do dia.
- `POST /webhooks/ads/:campaign/:event`: incrementa lead/teste/compra/renovacao.

Campanhas externas mapeadas hoje:

- `angelo`: `ADS15 - ANGELO (2061)`
- `rafa`: `ADS17 - RAFA NATV (1757)`

## Fluxo do painel web

Arquivos:

- `admin-ui/index.html`: estrutura visual e IDs dos elementos.
- `admin-ui/app.js`: comportamento, chamadas para API, renderizacao.
- `admin-ui/styles.css`: visual do painel.
- `admin-ui/nginx.conf`: serve os arquivos e faz proxy.

Proxy do `admin-ui`:

- `/api/*` vira `http://orchestrator:3000/admin/*`.
- `/connect-whatsapp` vira `http://orchestrator:3000/connect-whatsapp`.
- `/webhooks/*` vira `http://orchestrator:3000/webhooks/*`.

Fluxo ADS no painel:

1. Usuario faz login.
2. Importa planilha ou cola lancamentos no campo `adsText`.
3. `POST /api/ads/preview` interpreta entradas, busca grupos na Evolution e busca estatisticas The Best/webhook.
4. Painel mostra fila de envio e permite trocar/remover grupo por campanha.
5. Antes de enviar, aparece revisao obrigatoria.
6. `POST /api/ads/send-jobs` inicia job.
7. `EventSource` em `/api/ads/send-jobs/:id/events` mostra progresso.
8. Backend envia mensagens via Evolution API e grava `ads_dispatches`.

## Banco de dados

Schema inicial em `postgres/init-app.sql`.
O backend tambem roda `ensureSchema()` ao iniciar, criando/atualizando tabelas quando necessario.

Tabelas:

- `whatsapp_messages`: historico de mensagens recebidas/enviadas.
- `ads_dispatches`: disparos ADS enviados, valores, grupo, mensagem e status.
- `external_ads_stats`: estatisticas externas por campanha/data.
- `app_settings`: configuracoes JSON, como grupo monitorado.
- `whatsapp_reminders`: lembretes agendados pelo grupo monitorado.

Se adicionar tabela/coluna:

1. Atualize `postgres/init-app.sql` para instalacoes novas.
2. Atualize `ensureSchema()` em `orchestrator/src/server.js` para VPS existente.

## Fluxos WhatsApp

### Webhook da Evolution

O endpoint `/webhooks/evolution`:

1. Valida segredo/token.
2. Normaliza mensagem.
3. Se for audio no grupo monitorado, tenta transcrever com OpenAI.
4. Salva mensagens inbound.
5. Tenta tratar comandos do grupo monitorado.
6. Se nao for comando, usa `generateReply()` para responder com IA.
7. Usa Redis para evitar resposta duplicada rapida por chat.

### Grupo monitorado

Configurado no painel em "Monitor".
O bot so aceita comandos no grupo salvo em `app_settings` com chave `monitor_group`.

Comandos principais:

- `menu`
- `status`
- `quantos creditos`
- `creditos 5 todos`
- `creditos 5 tdsrobson`
- `revenda`
- `rank revendas`
- `cliente 51999999999`
- `gravar` para criar lembrete guiado

O menu guiado de revendas usa Redis para guardar estado por grupo/remetente.
Lembretes usam PostgreSQL na tabela `whatsapp_reminders` e um timer no backend que checa vencimentos a cada 15 segundos.

### Regras de creditos TDS

Integracao The Best:

- Base: `https://api.painel.best`
- Logs: `https://api.painel.best/user/logs/`
- API key: `THE_BEST_API_KEY`

Funcoes-chave:

- `fetchTdsResellers()`
- `transferTheBestCredits()`
- `transferCreditsToAllTdsResellers()`
- `transferCreditsToTdsReseller()`
- `buildTdsCreditsStatusMessage()`
- `buildTdsRankMessage()`
- `monitorTdsCreditThreshold()`

Limites atuais:

- Pelo grupo, transferencia direta bloqueia acima de 50 creditos por revenda.
- Pelo endpoint admin, transferencia bloqueia acima de 500 creditos por chamada.
- Menu guiado aceita quantidades predefinidas: 5, 10, 15, 20.
- O backend monitora periodicamente revendas TDS e avisa no grupo `DEVERES` quando alguma ficar com `TDS_CREDIT_ALERT_THRESHOLD` creditos ou menos. O padrao e 30 creditos, checado a cada 300000 ms.
- O aviso usa Redis para disparar uma vez por revenda enquanto ela estiver abaixo/igual ao limite. Quando a revenda volta acima do limite, a trava e removida e um novo aviso futuro pode acontecer.

## Pontos de manutencao comuns

Adicionar comando WhatsApp:

1. Mexer em `normalizeMonitorCommand()`.
2. Tratar o retorno dentro de `handleMonitorGroupCommand()`.
3. Se precisar de estado conversacional, seguir o padrao de Redis usado por revendas/lembretes.
4. Atualizar a ajuda em `buildMonitorMenuMessage()` e em `admin-ui/index.html`.
5. Incluir a resposta em `isGeneratedMonitorMessage()` para o bot nao reagir a mensagens dele mesmo.

Adicionar algo no painel:

1. Criar HTML/IDs em `admin-ui/index.html`.
2. Conectar seletores/eventos em `admin-ui/app.js`.
3. Criar endpoint `/admin/...` no backend se precisar de dados.
4. Estilizar em `admin-ui/styles.css`.
5. Lembrar que o navegador chama `/api/...`, e o Nginx converte para `/admin/...`.

Adicionar novo dado persistente:

1. Criar/alterar tabela em `postgres/init-app.sql`.
2. Repetir alteracao idempotente em `ensureSchema()`.
3. Usar queries parametrizadas com `pg`.

Adicionar novo webhook externo:

1. Ajustar `EXTERNAL_ADS_CAMPAIGNS` se for nova campanha fixa.
2. Verificar `resolveExternalAdsCampaign()`.
3. Verificar normalizacao em `normalizeExternalAdsPayload()` ou `normalizeExternalAdsEventPayload()`.
4. Garantir segredo via header `x-orchestrator-secret` ou campo JSON `secret`.

Alterar envio ADS:

- Parsing: `parseAdsInput()`, `parseAdsEntries()`, `parseAdsWorkbook()`.
- Previa/fila: `buildAdsPreviewEntries()`, `buildAdsMessage()`, `findBestAdsGroup()`.
- Envio: `runAdsSend()`, `sendEvolutionText()`, `saveAdsDispatch()`.
- Frontend: `previewAds()`, `renderAdsPreview()`, `sendAds()`, `sendAdsWithProgress()`.

Alterar visual:

- `admin-ui/styles.css`.
- Evitar mudar IDs usados por `admin-ui/app.js` sem atualizar os seletores.
- Se mudar versao de arquivo estatico, atualizar query string em `index.html` ajuda a escapar de cache.

## Cuidados importantes

- Nao expor tokens/chaves em commits, prints ou mensagens.
- Nao usar query string para `ORCHESTRATOR_WEBHOOK_SECRET`; o README orienta header ou body.
- O backend depende de APIs externas: Evolution, The Best, OpenAI e cotacao USD-BRL.
- `server.js` e grande; mudancas pequenas devem ser bem localizadas.
- Nao remover as salvaguardas de limite de creditos sem decisao explicita.
- Ao mexer em banco, pensar em instalacao nova e VPS ja existente.
- Ao mexer em comandos do grupo, cuidar para o bot nao entrar em loop respondendo mensagens geradas por ele.

## Verificacao recomendada

Antes de finalizar mudancas no backend:

```bash
cd orchestrator
npm install
node --check src/server.js
```

Para testar a stack:

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f orchestrator
```

Para testar painel local via Docker:

```text
http://127.0.0.1:8090
```

Para testar backend local isolado, precisa ter `DATABASE_URL`, `REDIS_URL` e demais variaveis no ambiente.

## Resumo mental rapido

- `admin-ui` e so frontend estatico com proxy.
- `orchestrator/src/server.js` e o cerebro: admin API, webhooks, WhatsApp, ADS, IA, The Best e lembretes.
- PostgreSQL guarda historico/configuracoes/envios/lembretes.
- Redis guarda cache, locks e estados temporarios.
- Evolution API faz a ponte com WhatsApp.
- n8n esta disponivel na stack, mas os fluxos principais deste codigo estao no `orchestrator`.
