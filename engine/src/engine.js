/**
 * BINGO ONLINE — Motor de Sorteio
 * src/engine.js
 *
 * Responsabilidades:
 *  1. Sortear 1 bola a cada N segundos
 *  2. Verificar Kuadra / Kina / Keno em todas as cartelas
 *  3. Publicar cada bola via Supabase Realtime
 *  4. Registrar ganhadores e finalizar o sorteio
 */

const crypto = require('crypto')
const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

// ── CLIENTE SUPABASE (service role — acesso total) ──────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

const INTERVALO_MS  = parseInt(process.env.BOLA_INTERVALO_MS || 4000)
const MAX_BOLAS     = parseInt(process.env.MAX_BOLAS || 90)

// ── ESTADO EM MEMÓRIA ───────────────────────────────────────
let sorteioAtivo  = null   // Objeto do sorteio atual
let cartelas      = []     // Array de cartelas pagas do sorteio
let bolas         = []     // Bolas já sorteadas nesta rodada
let sequencia     = []     // Sequência aleatória de 1-90
let bolaInterval  = null   // setInterval do sorteio
let rodando       = false

// ╔══════════════════════════════════════════════════════════╗
// ║  1. INICIAR SORTEIO                                      ║
// ╚══════════════════════════════════════════════════════════╝
async function iniciarSorteio(sorteioId) {
  if (rodando) {
    console.warn('[ENGINE] Já existe um sorteio em andamento.')
    return false
  }

  console.log(`\n[ENGINE] ▶ Iniciando sorteio ${sorteioId}`)

  // 1a. Busca o sorteio
  const { data: sorteio, error } = await supabase
    .from('sorteios')
    .select('*')
    .eq('id', sorteioId)
    .single()

  if (error || !sorteio) {
    console.error('[ENGINE] Sorteio não encontrado:', error)
    return false
  }

  if (sorteio.status !== 'agendado') {
    console.error('[ENGINE] Sorteio não está agendado. Status:', sorteio.status)
    return false
  }

  // 1b. Carrega cartelas pagas
  const { data: cartelasData } = await supabase
    .from('cartelas')
    .select('id, codigo, numeros, ponto_id, comprador_nome')
    .eq('sorteio_id', sorteioId)
    .eq('status', 'paga')

  if (!cartelasData || cartelasData.length === 0) {
    console.warn('[ENGINE] Nenhuma cartela paga. Iniciando sem verificação automática.')
  }

  // 1c. Gera seed auditável
  const seed = crypto.randomBytes(32).toString('hex')
  const seedHash = crypto.createHash('sha256').update(seed).digest('hex')

  // 1d. Gera sequência aleatória usando seed
  sequencia = gerarSequencia(seed)
  bolas     = []
  cartelas  = cartelasData || []

  // 1e. Atualiza status no banco
  await supabase
    .from('sorteios')
    .update({
      status:       'ativo',
      seed_hash:    seedHash,   // Publicado ANTES — auditável
      bolas_sorteadas: []
    })
    .eq('id', sorteioId)

  sorteioAtivo = { ...sorteio, seed, seedHash }
  rodando = true

  console.log(`[ENGINE] 🎲 Seed hash publicado: ${seedHash}`)
  console.log(`[ENGINE] 🃏 ${cartelas.length} cartelas ativas`)
  console.log(`[ENGINE] 🎱 Sorteando 1 bola a cada ${INTERVALO_MS}ms\n`)

  // 1f. Dispara o loop de sorteio
  bolaInterval = setInterval(sortearProximaBola, INTERVALO_MS)
  await sortearProximaBola() // Primeira bola imediata

  return true
}

// ╔══════════════════════════════════════════════════════════╗
// ║  2. SORTEAR PRÓXIMA BOLA                                 ║
// ╚══════════════════════════════════════════════════════════╝
async function sortearProximaBola() {
  if (!rodando || !sorteioAtivo) return
  if (bolas.length >= MAX_BOLAS) {
    await finalizarSorteio('sem_keno')
    return
  }

  const bola   = sequencia[bolas.length]
  const seq    = bolas.length + 1
  bolas.push(bola)

  console.log(`[ENGINE] 🔵 Bola ${seq}: ${bola}`)

  // 2a. Persiste no banco (dispara Realtime para todos os displays)
  const { error } = await supabase
    .from('bolas')
    .insert({ sorteio_id: sorteioAtivo.id, numero: bola, sequencia: seq })

  if (error) {
    console.error('[ENGINE] Erro ao inserir bola:', error.message)
    return
  }

  // Atualiza array de bolas no sorteio (para o display)
  await supabase
    .from('sorteios')
    .update({ bolas_sorteadas: bolas })
    .eq('id', sorteioAtivo.id)

  // 2b. Verifica ganhadores
  const set = new Set(bolas)
  const ganhadores = verificarCartelas(cartelas, set, seq)

  for (const g of ganhadores) {
    await registrarGanhador(g, seq)
  }

  // 2c. Se Keno foi ganho → encerra
  if (ganhadores.some(g => g.tipo === 'keno')) {
    clearInterval(bolaInterval)
    await finalizarSorteio('keno_ganho')
  }
}

// ╔══════════════════════════════════════════════════════════╗
// ║  3. VERIFICAR CARTELAS (algoritmo central)               ║
// ╚══════════════════════════════════════════════════════════╝
/**
 * Verifica todas as cartelas contra as bolas já sorteadas.
 * Retorna array de ganhadores novos nesta rodada.
 *
 * Estrutura de uma cartela (3 linhas × 5 números):
 *   numeros[0..4]  = Linha 1
 *   numeros[5..9]  = Linha 2
 *   numeros[10..14]= Linha 3
 *
 * Kuadra = 4 números quaisquer marcados (linha qualquer com 4+ acertos)
 * Kina   = 1 linha completa (5 números de uma linha)
 * Keno   = Cartela completa (15 números)
 */

// Controle de prêmios já dados (evita duplicatas)
const premiosDados = { kuadra: false, kina: false, keno: false }

function verificarCartelas(cartelas, bolasSorteadas, sequenciaAtual) {
  const novosGanhadores = []

  for (const cartela of cartelas) {
    const nums  = cartela.numeros
    const linha1 = nums.slice(0, 5)
    const linha2 = nums.slice(5, 10)
    const linha3 = nums.slice(10, 15)

    const acertosL1 = linha1.filter(n => bolasSorteadas.has(n)).length
    const acertosL2 = linha2.filter(n => bolasSorteadas.has(n)).length
    const acertosL3 = linha3.filter(n => bolasSorteadas.has(n)).length
    const acertosTotal = acertosL1 + acertosL2 + acertosL3

    // KENO — cartela cheia (15 números)
    if (!premiosDados.keno && acertosTotal === 15) {
      premiosDados.keno = true
      novosGanhadores.push({ ...cartela, tipo: 'keno', acertos: acertosTotal })
      continue
    }

    // KINA — linha completa (5/5)
    if (!premiosDados.kina &&
        (acertosL1 === 5 || acertosL2 === 5 || acertosL3 === 5)) {
      premiosDados.kina = true
      novosGanhadores.push({ ...cartela, tipo: 'kina', acertos: 5 })
      continue
    }

    // KUADRA — 4 acertos em qualquer linha
    if (!premiosDados.kuadra &&
        (acertosL1 >= 4 || acertosL2 >= 4 || acertosL3 >= 4)) {
      premiosDados.kuadra = true
      novosGanhadores.push({ ...cartela, tipo: 'kuadra', acertos: 4 })
    }
  }

  return novosGanhadores
}

// ╔══════════════════════════════════════════════════════════╗
// ║  4. REGISTRAR GANHADOR                                   ║
// ╚══════════════════════════════════════════════════════════╝
async function registrarGanhador(cartela, sequenciaAtual) {
  const sorteio = sorteioAtivo
  const arrecadacao = sorteio.arrecadacao_total || 0

  // Calcula prêmio
  const pctMap = { kuadra: sorteio.pct_kuadra, kina: sorteio.pct_kina, keno: sorteio.pct_keno }
  let premioValor = arrecadacao * (pctMap[cartela.tipo] / 100)

  // Se Keno acumulado (não fechou até a bola limite) → soma acumulado
  if (cartela.tipo === 'keno' && sorteio.acumulado_valor > 0) {
    premioValor += sorteio.acumulado_valor
  }

  console.log(`[ENGINE] 🏆 GANHADOR ${cartela.tipo.toUpperCase()}!`)
  console.log(`         Cartela #${cartela.codigo} · ${cartela.comprador_nome || 'Anônimo'}`)
  console.log(`         Prêmio: R$ ${premioValor.toFixed(2)}`)

  // Insere ganhador
  const { error } = await supabase
    .from('ganhadores')
    .insert({
      sorteio_id:        sorteio.id,
      cartela_id:        cartela.id,
      ponto_id:          cartela.ponto_id,
      tipo:              cartela.tipo,
      bola_na_sequencia: sequenciaAtual,
      premio_valor:      premioValor
    })

  if (error) {
    console.error('[ENGINE] Erro ao registrar ganhador:', error.message)
    return
  }

  // Registra transação financeira
  await supabase.from('transacoes').insert({
    tipo:       'premio',
    sorteio_id: sorteio.id,
    cartela_id: cartela.id,
    ponto_id:   cartela.ponto_id,
    valor:      premioValor,
    descricao:  `Prêmio ${cartela.tipo} · Cartela #${cartela.codigo}`
  })
}

// ╔══════════════════════════════════════════════════════════╗
// ║  5. FINALIZAR SORTEIO                                    ║
// ╚══════════════════════════════════════════════════════════╝
async function finalizarSorteio(motivo) {
  if (!rodando) return
  rodando = false
  clearInterval(bolaInterval)

  console.log(`\n[ENGINE] ■ Finalizando sorteio. Motivo: ${motivo}`)

  // Se Keno não foi dado e passamos da bola limite → acumula
  const acumulaKeno = !premiosDados.keno &&
    bolas.length >= sorteioAtivo.acumulado_ate_bola

  const sorteio = sorteioAtivo

  await supabase
    .from('sorteios')
    .update({
      status:          'finalizado',
      finalizado_em:   new Date().toISOString(),
      bolas_sorteadas: bolas,
      seed_valor:      sorteio.seed,  // Revelado após finalizar (auditável)
      acumulado_valor: acumulaKeno
        ? (sorteio.acumulado_valor || 0) + (sorteio.arrecadacao_total * sorteio.pct_keno / 100)
        : 0
    })
    .eq('id', sorteio.id)

  const resumo = {
    sorteio:   sorteio.numero,
    bolasUsadas: bolas.length,
    kuadra:    premiosDados.kuadra,
    kina:      premiosDados.kina,
    keno:      premiosDados.keno,
    acumulado: acumulaKeno
  }

  console.log('[ENGINE] 📊 Resumo:', resumo)

  // Reset estado para próxima rodada
  sorteioAtivo = null
  cartelas     = []
  bolas        = []
  sequencia    = []
  premiosDados.kuadra = false
  premiosDados.kina   = false
  premiosDados.keno   = false

  return resumo
}

// ╔══════════════════════════════════════════════════════════╗
// ║  6. CONTROLES (pause / resume / stop)                    ║
// ╚══════════════════════════════════════════════════════════╝
function pausarSorteio() {
  if (!rodando) return false
  clearInterval(bolaInterval)
  rodando = false
  supabase.from('sorteios').update({ status: 'pausado' }).eq('id', sorteioAtivo.id)
  console.log('[ENGINE] ⏸ Sorteio pausado.')
  return true
}

function resumirSorteio() {
  if (rodando || !sorteioAtivo) return false
  rodando = true
  supabase.from('sorteios').update({ status: 'ativo' }).eq('id', sorteioAtivo.id)
  bolaInterval = setInterval(sortearProximaBola, INTERVALO_MS)
  console.log('[ENGINE] ▶ Sorteio retomado.')
  return true
}

async function cancelarSorteio() {
  clearInterval(bolaInterval)
  if (sorteioAtivo) {
    await supabase.from('sorteios').update({ status: 'cancelado' }).eq('id', sorteioAtivo.id)
  }
  rodando = false
  sorteioAtivo = null
  console.log('[ENGINE] ✖ Sorteio cancelado.')
}

// ╔══════════════════════════════════════════════════════════╗
// ║  7. UTILITÁRIOS                                          ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Embaralha array de 1-90 usando Fisher-Yates
 * com seed determinístico (SHA256 → numbers)
 */
function gerarSequencia(seed) {
  const arr = Array.from({ length: MAX_BOLAS }, (_, i) => i + 1)

  // Deriva números pseudo-aleatórios do seed
  let hash = crypto.createHash('sha256').update(seed).digest('hex')
  let pos  = 0

  for (let i = arr.length - 1; i > 0; i--) {
    // Pega 4 bytes do hash como uint32
    if (pos + 8 > hash.length) {
      hash = crypto.createHash('sha256').update(hash).digest('hex')
      pos  = 0
    }
    const rnd = parseInt(hash.slice(pos, pos + 8), 16)
    pos += 2
    const j = rnd % (i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  return arr
}

function getStatus() {
  return {
    rodando,
    sorteio:    sorteioAtivo?.numero || null,
    sorteioId:  sorteioAtivo?.id     || null,
    bolaAtual:  bolas.length,
    ultimaBola: bolas[bolas.length - 1] || null,
    premios:    { ...premiosDados }
  }
}

module.exports = {
  iniciarSorteio,
  pausarSorteio,
  resumirSorteio,
  cancelarSorteio,
  getStatus,
  // Exposto para testes
  verificarCartelas,
  gerarSequencia
}
