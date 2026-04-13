/**
 * BINGO ONLINE — Lógica Pura (sem Supabase)
 * src/logic.js
 *
 * Funções testáveis isoladamente.
 * O engine.js importa daqui.
 */

const crypto = require('crypto')

const MAX_BOLAS = 90

/**
 * Embaralha 1-90 deterministicamente a partir de um seed.
 * Fisher-Yates com hash SHA256 encadeado.
 */
function gerarSequencia(seed) {
  const arr = Array.from({ length: MAX_BOLAS }, (_, i) => i + 1)

  let hash = crypto.createHash('sha256').update(seed).digest('hex')
  let pos  = 0

  for (let i = arr.length - 1; i > 0; i--) {
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

/**
 * Verifica todas as cartelas contra as bolas sorteadas.
 *
 * Layout da cartela (15 números, 3 linhas × 5):
 *   numeros[0..4]   → Linha 1
 *   numeros[5..9]   → Linha 2
 *   numeros[10..14] → Linha 3
 *
 * Regras:
 *   Kuadra = 4 acertos em qualquer linha
 *   Kina   = 5 acertos em uma linha (linha completa)
 *   Keno   = 15 acertos (cartela cheia)
 *
 * Cada prêmio só é dado 1 vez por sorteio (flags no estado).
 */
function verificarCartelas(cartelas, bolasSorteadas, premiosDados) {
  const novosGanhadores = []

  for (const cartela of cartelas) {
    const n  = cartela.numeros
    const l1 = n.slice(0, 5)
    const l2 = n.slice(5, 10)
    const l3 = n.slice(10, 15)

    const a1 = l1.filter(x => bolasSorteadas.has(x)).length
    const a2 = l2.filter(x => bolasSorteadas.has(x)).length
    const a3 = l3.filter(x => bolasSorteadas.has(x)).length
    const total = a1 + a2 + a3

    // KENO — maior prioridade
    if (!premiosDados.keno && total === 15) {
      premiosDados.keno = true
      novosGanhadores.push({ ...cartela, tipo: 'keno', acertos: 15 })
      continue
    }

    // KINA
    if (!premiosDados.kina && (a1 === 5 || a2 === 5 || a3 === 5)) {
      premiosDados.kina = true
      novosGanhadores.push({ ...cartela, tipo: 'kina', acertos: 5 })
      continue
    }

    // KUADRA
    if (!premiosDados.kuadra && (a1 >= 4 || a2 >= 4 || a3 >= 4)) {
      premiosDados.kuadra = true
      novosGanhadores.push({ ...cartela, tipo: 'kuadra', acertos: 4 })
    }
  }

  return novosGanhadores
}

/**
 * Calcula valores dos prêmios baseado na arrecadação
 */
function calcularPremios(arrecadacao, config) {
  return {
    kuadra:   arrecadacao * config.pct_kuadra / 100,
    kina:     arrecadacao * config.pct_kina   / 100,
    keno:     arrecadacao * config.pct_keno   / 100,
    pontos:   arrecadacao * config.pct_ponto  / 100,
    operador: arrecadacao * (100 - config.pct_kuadra - config.pct_kina - config.pct_keno - config.pct_ponto) / 100
  }
}

/**
 * Gera seed auditável (hash publicado ANTES do sorteio)
 */
function gerarSeedAuditavel() {
  const seed     = crypto.randomBytes(32).toString('hex')
  const seedHash = crypto.createHash('sha256').update(seed).digest('hex')
  return { seed, seedHash }
}

module.exports = {
  gerarSequencia,
  verificarCartelas,
  calcularPremios,
  gerarSeedAuditavel,
  MAX_BOLAS
}
