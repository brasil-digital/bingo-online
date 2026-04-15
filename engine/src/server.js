/**
 * BINGO ONLINE — API HTTP
 * src/server.js
 *
 * Endpoints para o Painel Admin controlar o Motor de Sorteio
 */

const http    = require('http')
const engine  = require('./engine')
const cron    = require('node-cron')
require('dotenv').config()

const PORT = process.env.PORT || 3001

// ── ROTEADOR SIMPLES ─────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) }
      catch { resolve({}) }
    })
  })
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
  })
  res.end(JSON.stringify(data))
}

// ── AUTENTICAÇÃO SIMPLES (Bearer token) ─────────────────────
function autenticar(req) {
  const auth = req.headers['authorization'] || ''
  const token = auth.replace('Bearer ', '')
  return token === process.env.ADMIN_SECRET
}

// ── SERVIDOR ─────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {

  // CORS preflight
  if (req.method === 'OPTIONS') {
    json(res, 200, {})
    return
  }

  // Autenticação (exceto health check)
  if (req.url !== '/health' && !autenticar(req)) {
    json(res, 401, { erro: 'Não autorizado' })
    return
  }

  const url    = req.url.split('?')[0]
  const method = req.method
  const body   = await parseBody(req)

  // ── ROTAS ──────────────────────────────────────────────────

  // GET /health
  if (url === '/health' && method === 'GET') {
    json(res, 200, { ok: true, ts: new Date().toISOString() })
    return
  }

  // GET /status
  if (url === '/status' && method === 'GET') {
    json(res, 200, engine.getStatus())
    return
  }

  // POST /iniciar  { sorteioId: "uuid" }
  if (url === '/iniciar' && method === 'POST') {
    const { sorteioId } = body
    if (!sorteioId) {
      json(res, 400, { erro: 'sorteioId é obrigatório' })
      return
    }
    const ok = await engine.iniciarSorteio(sorteioId)
    json(res, ok ? 200 : 400, { ok, sorteioId })
    return
  }

  // POST /pausar
  if (url === '/pausar' && method === 'POST') {
    const ok = engine.pausarSorteio()
    json(res, 200, { ok })
    return
  }

  // POST /resumir
  if (url === '/resumir' && method === 'POST') {
    const ok = engine.resumirSorteio()
    json(res, 200, { ok })
    return
  }

  // POST /cancelar
  if (url === '/cancelar' && method === 'POST') {
    await engine.cancelarSorteio()
    json(res, 200, { ok: true })
    return
  }

  // Rota não encontrada
  json(res, 404, { erro: 'Rota não encontrada' })
})

// ── CRON: Inicia sorteios agendados automaticamente ──────────
// A cada minuto verifica se há sorteio para iniciar
cron.schedule('* * * * *', async () => {
  if (engine.getStatus().rodando) return

  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { auth: { persistSession: false } }
  )

  const agora = new Date().toISOString()
  const { data } = await supabase
    .from('sorteios')
    .select('id, numero, inicio_em')
    .eq('status', 'agendado')
    .lte('inicio_em', agora)
    .order('inicio_em')
    .limit(1)
    .single()

  if (data) {
    console.log(`[CRON] ⏰ Iniciando sorteio agendado #${data.numero}`)
    await engine.iniciarSorteio(data.id)
  }
})

// ── START ──────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   BINGO ONLINE — Motor de Sorteio      ║
║   Porta: ${PORT}                           ║
║   Intervalo: ${process.env.BOLA_INTERVALO_MS || 4000}ms / bola             ║
╚════════════════════════════════════════╝
  `)
})

module.exports = server
