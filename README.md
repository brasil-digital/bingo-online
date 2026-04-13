# Bingo Online — Plataforma Completa

Plataforma de bingo eletrônico ao vivo para rede de bares e pontos vendedores.

---

## Estrutura do Projeto

```
bingo-online/
├── frontend/
│   ├── tv-display.html        ← Telão do bar (fullscreen, Realtime)
│   ├── admin-panel.html       ← Painel do operador central
│   ├── app-vendedor.html      ← App do vendedor (PIX + Cash)
│   └── cartela-jogador.html   ← Cartela digital do jogador
│
├── engine/
│   ├── src/
│   │   ├── logic.js           ← Lógica pura (testável)
│   │   ├── engine.js          ← Motor de sorteio + Supabase
│   │   └── server.js          ← API HTTP + CRON agendador
│   ├── config/
│   │   └── schema.sql         ← Schema completo do banco
│   ├── tests/
│   │   └── engine.test.js     ← 28 testes (todos passando)
│   ├── seed.js                ← Script de teste com dados reais
│   ├── index.js
│   ├── package.json
│   └── .env.example
│
└── docs/
    └── arquitetura.html
```

---

## Stack

- **Banco:** Supabase (PostgreSQL + Realtime)
- **Motor:** Node.js (sem framework)
- **Frontend:** HTML/CSS/JS puro
- **Deploy:** Railway (engine) + Netlify (frontend)

---

## Configuração

### 1. Banco de dados

Execute `engine/config/schema.sql` no SQL Editor do Supabase.

### 2. Variáveis de ambiente

```bash
cd engine
cp .env.example .env
```

Preencha `.env`:
```
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_KEY=sua_service_role_key
BOLA_INTERVALO_MS=4000
MAX_BOLAS=90
PORT=3001
```

### 3. Instalar e testar

```bash
cd engine
npm install
npm test
```

### 4. Rodar localmente

```bash
# Terminal 1 — Engine
cd engine && npm start

# Terminal 2 — Frontend
cd frontend && npx serve .
```

### 5. Criar sorteio de teste

```bash
cd engine
node seed.js
```

---

## API do Motor

Todas as rotas (exceto `/health`) requerem `Authorization: Bearer <SUPABASE_SERVICE_KEY>`.

| Endpoint         | Método | Descrição                       |
|------------------|--------|---------------------------------|
| `GET  /health`   | GET    | Health check                    |
| `GET  /status`   | GET    | Status do sorteio em andamento  |
| `POST /iniciar`  | POST   | Iniciar sorteio `{ sorteioId }` |
| `POST /pausar`   | POST   | Pausar sorteio                  |
| `POST /resumir`  | POST   | Retomar sorteio pausado         |
| `POST /cancelar` | POST   | Cancelar sorteio                |

---

## URLs de Acesso

| Tela | URL |
|---|---|
| Telão (TV) | `/tv-display.html` |
| Admin | `/admin-panel.html` |
| Vendedor | `/app-vendedor.html?ponto=<uuid>` |
| Jogador | `/cartela-jogador.html` |

---

## Regras do Jogo

- **Kuadra** — 4 acertos em qualquer linha da cartela
- **Kina** — linha completa (5/5)
- **Keno** — cartela cheia (15/15)
- Cada prêmio é dado apenas uma vez por sorteio
- Se o Keno não for ganho até a bola `acumulado_ate_bola`, o valor acumula para o próximo sorteio

---

## Deploy

- **Engine:** [Railway](https://railway.app) — conecta ao repositório GitHub, define as variáveis de ambiente
- **Frontend:** [Netlify](https://netlify.app) — arrastar a pasta `frontend/`
