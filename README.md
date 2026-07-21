# VPS WhatsApp Automation Stack

Stack inicial para automatizar WhatsApp com Evolution API, n8n, PostgreSQL, Redis, Nginx Proxy Manager e um backend orquestrador com OpenAI.

## Componentes

- Nginx Proxy Manager: proxy reverso e SSL.
- Evolution API: conexao com WhatsApp e webhooks.
- n8n: automacoes visuais.
- PostgreSQL: historico e dados da aplicacao.
- Redis: filas, cache e travas simples.
- Orchestrator: backend Node.js que recebe webhook, chama OpenAI e responde via Evolution API.
- Admin UI: painel web para status, mensagens recentes e teste de resposta da IA.

## Instalar na VPS

1. Instale Docker e Docker Compose.
2. Copie esta pasta para a VPS, por exemplo em `/opt/vps-whatsapp-stack`.
3. Crie o arquivo de ambiente:

```bash
cp .env.example .env
```

4. Edite `.env` e troque dominios, senhas e chaves. Gere senhas longas para:

```text
POSTGRES_PASSWORD
EVOLUTION_POSTGRES_PASSWORD
REDIS_PASSWORD
N8N_ENCRYPTION_KEY
N8N_BASIC_AUTH_PASSWORD
EVOLUTION_API_KEY
ORCHESTRATOR_WEBHOOK_SECRET
OPENAI_API_KEY
UI_ADMIN_TOKEN
```

5. Suba a stack:

```bash
docker compose up -d --build
```

6. Se a VPS nao tiver Nginx rodando no host, abra o Nginx Proxy Manager:

```text
http://IP-DA-VPS:81
```

Login padrao inicial do Nginx Proxy Manager:

```text
Email: admin@example.com
Senha: changeme
```

Troque isso no primeiro acesso.

## Proxy sugerido com Nginx Proxy Manager

No Nginx Proxy Manager, crie estes hosts:

- `n8n.seudominio.com` -> `http://n8n:5678`
- `evo.seudominio.com` -> `http://evolution-api:8080`
- `api.seudominio.com` -> `http://orchestrator:3000`
- `painel.seudominio.com` -> `http://admin-ui:80`

Ative SSL com Let's Encrypt em cada um.

## Proxy sugerido com Nginx existente na VPS

Se a VPS ja tiver Nginx usando as portas 80 e 443, use os containers pelas portas locais:

- painel -> `http://127.0.0.1:8090`
- n8n -> `http://127.0.0.1:5678`
- Evolution API -> `http://127.0.0.1:8081`
- orquestrador -> `http://127.0.0.1:3000`

## Painel admin

Depois do proxy criado, abra:

```text
https://painel.seudominio.com
```

Cole o valor de `UI_ADMIN_TOKEN` para entrar. O painel mostra:

- status de PostgreSQL, Redis, Evolution API e OpenAI configurada;
- total de mensagens, entradas, saidas e contatos;
- ultimas mensagens recebidas/enviadas;
- teste manual de resposta da IA.

## Primeiro teste

```bash
docker compose ps
docker compose logs -f orchestrator
```

Depois acesse a Evolution API, crie uma instancia, leia o QR Code e conecte seu WhatsApp.

## Observacoes importantes

- Revogue qualquer chave OpenAI que tenha sido colada em chat, print ou arquivo inseguro.
- Para uso comercial pesado, considere WhatsApp Cloud API oficial da Meta.
- Use mensagens automáticas com opt-out, logs e regras de encaminhamento humano para reduzir risco de bloqueio e problemas de LGPD.
