const {
  gerarSequencia,
  verificarCartelas,
  calcularPremios,
  gerarSeedAuditavel
} = require('../src/logic')

let passou = 0, falhou = 0

function describe(nome, fn) {
  console.log(`\n📋 ${nome}`)
  fn()
}

function assert(desc, cond) {
  if (cond) { console.log(`  ✅ ${desc}`); passou++ }
  else       { console.error(`  ❌ ${desc}`); falhou++ }
}

function novoPremios() {
  return { kuadra: false, kina: false, keno: false }
}

// ── SEQUÊNCIA ──
describe('Geração de Sequência', () => {
  const seq = gerarSequencia('seed-123')
  assert('Tem 90 elementos',             seq.length === 90)
  assert('Todos entre 1 e 90',           seq.every(n => n >= 1 && n <= 90))
  assert('Sem duplicatas',               new Set(seq).size === 90)
  const seq2 = gerarSequencia('seed-123')
  assert('Mesmo seed → mesma sequência', JSON.stringify(seq) === JSON.stringify(seq2))
  const seq3 = gerarSequencia('seed-456')
  assert('Seeds diferentes → diferentes',JSON.stringify(seq) !== JSON.stringify(seq3))
})

// ── KUADRA ──
describe('Kuadra (4 acertos em 1 linha)', () => {
  const c = { id:'c1', codigo:1001, ponto_id:'p1',
    numeros: [1,2,3,4,5, 10,20,30,40,50, 60,70,80,81,82] }
  let r = verificarCartelas([c], new Set([1,2,3,4,99]), novoPremios())
  assert('4 acertos linha 1 → kuadra',  r.length===1 && r[0].tipo==='kuadra')
  r = verificarCartelas([c], new Set([10,20,30,40,99]), novoPremios())
  assert('4 acertos linha 2 → kuadra',  r.length===1 && r[0].tipo==='kuadra')
  r = verificarCartelas([c], new Set([1,2,3,99,88]), novoPremios())
  assert('3 acertos → sem prêmio',       r.length===0)
  const pDados = { kuadra:true, kina:false, keno:false }
  r = verificarCartelas([c], new Set([1,2,3,4,99]), pDados)
  assert('Kuadra já dada → não duplica', r.length===0)
})

// ── KINA ──
describe('Kina (linha completa 5/5)', () => {
  const c = { id:'c2', codigo:1002, ponto_id:'p1',
    numeros: [1,2,3,4,5, 10,20,30,40,50, 60,70,80,81,82] }
  let r = verificarCartelas([c], new Set([1,2,3,4,5,99,88]), novoPremios())
  assert('Linha 1 completa → kina',           r.length===1 && r[0].tipo==='kina')
  r = verificarCartelas([c], new Set([10,20,30,40,50,99,88]), novoPremios())
  assert('Linha 2 completa → kina',           r.length===1 && r[0].tipo==='kina')
  r = verificarCartelas([c], new Set([1,2,3,4,99,88,77]), novoPremios())
  assert('4/5 em linha → kuadra (não kina)',  r[0]?.tipo==='kuadra')
})

// ── KENO ──
describe('Keno (cartela cheia 15/15)', () => {
  const nums = [1,2,3,4,5,10,20,30,40,50,60,70,80,81,82]
  const c = { id:'c3', codigo:1003, ponto_id:'p1', numeros: nums }
  const p = novoPremios()
  const r = verificarCartelas([c], new Set(nums), p)
  assert('15 acertos → keno',                r.length===1 && r[0].tipo==='keno')
  assert('Keno tem prioridade sobre kina',   r[0]?.tipo==='keno')
  assert('Flag keno ativada',                p.keno===true)
})

// ── MÚLTIPLAS CARTELAS ──
describe('Múltiplas cartelas — apenas 1 kuadra', () => {
  const c1 = { id:'c4', codigo:1004, numeros:[1,2,3,4,5, 11,12,13,14,15, 21,22,23,24,25] }
  const c2 = { id:'c5', codigo:1005, numeros:[1,2,3,4,50, 11,12,13,14,15, 21,22,23,24,25] }
  const r = verificarCartelas([c1,c2], new Set([1,2,3,4,99]), novoPremios())
  assert('2 elegíveis → só 1 kuadra',       r.length===1)
  assert('Vence a primeira elegível',        r[0].id==='c4')
})

// ── PRÊMIOS ──
describe('Cálculo de Prêmios', () => {
  const cfg = { pct_kuadra:10, pct_kina:20, pct_keno:30, pct_ponto:20 }
  const p = calcularPremios(2000, cfg)
  assert('Kuadra = R$200',  p.kuadra   === 200)
  assert('Kina   = R$400',  p.kina     === 400)
  assert('Keno   = R$600',  p.keno     === 600)
  assert('Pontos = R$400',  p.pontos   === 400)
  assert('Operador = R$400',p.operador === 400)
  assert('Soma = R$2000',   p.kuadra+p.kina+p.keno+p.pontos+p.operador === 2000)
})

// ── SEED ──
describe('Seed Auditável', () => {
  const { seed, seedHash } = gerarSeedAuditavel()
  assert('Seed 64 chars',                   seed.length === 64)
  assert('SeedHash 64 chars',               seedHash.length === 64)
  assert('Seed !== SeedHash',               seed !== seedHash)
  const crypto = require('crypto')
  const v = crypto.createHash('sha256').update(seed).digest('hex')
  assert('SHA256(seed) === seedHash',       v === seedHash)
  const outro = gerarSeedAuditavel()
  assert('Seeds sempre únicos',             seed !== outro.seed)
})

// ── RESULTADO ──
const L = '═'.repeat(46)
console.log(`\n${L}`)
console.log(`  Total: ${passou+falhou}  |  ✅ ${passou} ok  |  ❌ ${falhou} erro(s)`)
console.log(`${L}\n`)
if (falhou > 0) process.exit(1)
