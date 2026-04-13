# 🎱 Bingo Online — Plataforma Completa

Sistema completo de bingo eletrônico para rede de bares.
Desenvolvido por Sovereign Digital Group LLC.

---

## Estrutura do Projeto

```
bingo-online/
├── frontend/
│   ├── tv-display.html        ← Telão do bar (fullscreen)
│   ├── admin-panel.html       ← Painel do operador central
│   ├── app-vendedor.html      ← App do vendedor (bar) — PIX + Cash
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
│   ├── index.js
│   ├── package.json
│   └── .env.example
│
└── docs/
    └── arquitetura.html       ← Documento de arquitetura técnica
```

---

## Como Rodar os Testes

```bash
cd engine
npm install
npm test
```

## Como Rodar o Motor

```bash
cd engine
cp .env.example .env
# Preencher SUPABASE_URL e SUPABASE_SERVICE_KEY
npm start
```

## API do Motor

| Endpoint       | Método | Descrição                        |
|----------------|--------|----------------------------------|
| `GET  /health` | GET    | Health check                     |
| `GET  /status` | GET    | Status atual do sorteio          |
| `POST /iniciar`| POST   | Iniciar sorteio `{ sorteioId }`  |
| `POST /pausar` | POST   | Pausar sorteio em andamento      |
| `POST /resumir`| POST   | Retomar sorteio pausado          |
| `POST /cancelar`| POST  | Cancelar sorteio                 |

---

## Stack

- **Banco:** Supabase (PostgreSQL + Realtime)
- **Motor:** Node.js
- **Frontend:** HTML/CSS/JS puro (sem framework)
- **Pagamentos:** Iugu + PIX
- **Notificações:** n8n + Z-API (WhatsApp)
- **Deploy:** Railway ou Render

---

## O que falta para produção

- [ ] Conectar Supabase (URL + chaves)
- [ ] Configurar Iugu (PIX automático)
- [ ] Subir motor no Railway/Render
- [ ] Configurar n8n + Z-API
- [ ] Autenticação (admin + vendedores)
- [ ] Integração impressora térmica
- [ ] Testes piloto com 2-3 bares
