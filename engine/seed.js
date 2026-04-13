/**
 * BINGO ONLINE — Seed de Teste
 * Cria ponto, sorteio, cartelas e inicia o sorteio via API
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

async function seed() {
  console.log('🌱 Iniciando seed...\n')

  // 1. Insere ponto vendedor
  const { data: ponto, error: errPonto } = await supabase
    .from('pontos')
    .insert({
      nome:         'Cabana do Batista',
      cidade:       'São José',
      estado:       'MG'
    })
    .select('id')
    .single()

  if (errPonto) {
    console.error('Erro ao criar ponto:', errPonto.message)
    process.exit(1)
  }
  console.log('✅ Ponto criado:', ponto.id)

  // 2. Cria sorteio agendado para agora
  const { data: sorteio, error: errSorteio } = await supabase
    .from('sorteios')
    .insert({
      status:             'agendado',
      inicio_em:          new Date().toISOString(),
      preco_cartela:      2.00,
      total_cartelas:     100,
      pct_kuadra:         10,
      pct_kina:           20,
      pct_keno:           30,
      pct_ponto:          20,
      acumulado_ate_bola: 35,
      arrecadacao_total:  50 * 2.00  // 50 cartelas pagas × R$2,00
    })
    .select('id')
    .single()

  if (errSorteio) {
    console.error('Erro ao criar sorteio:', errSorteio.message)
    process.exit(1)
  }
  console.log('✅ Sorteio criado:', sorteio.id)

  // 3. Gera 50 cartelas com status "paga"
  // Busca maior código existente para evitar duplicatas
  const { data: maxRow } = await supabase
    .from('cartelas')
    .select('codigo')
    .order('codigo', { ascending: false })
    .limit(1)
    .single()

  const baseCode = maxRow ? maxRow.codigo + 1 : 200001

  const cartelas = []

  for (let i = 0; i < 50; i++) {
    const numeros = gerarNumerosCartela()
    cartelas.push({
      codigo:         baseCode + i,
      sorteio_id:     sorteio.id,
      ponto_id:       ponto.id,
      numeros,
      status:         'paga',
      tipo_pagamento: 'cash',
      valor_pago:     2.00
    })
  }

  const { data: cartelasInseridas, error: errCartelas } = await supabase
    .from('cartelas')
    .insert(cartelas)
    .select('id')

  if (errCartelas) {
    console.error('Erro ao criar cartelas:', errCartelas.message)
    process.exit(1)
  }
  console.log(`✅ Cartelas geradas: ${cartelasInseridas.length}`)

  // 4. POST /iniciar
  const resp = await fetch('http://localhost:3001/iniciar', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`
    },
    body: JSON.stringify({ sorteioId: sorteio.id })
  })

  const respJson = await resp.json()
  console.log('\n🎱 Resposta do /iniciar:', respJson)

  console.log('\n📋 Resumo:')
  console.log('   Ponto ID  :', ponto.id)
  console.log('   Sorteio ID:', sorteio.id)
  console.log('   Cartelas  :', cartelasInseridas.length)
}

/**
 * Gera 15 números únicos entre 1 e 90 (3 linhas × 5 colunas)
 */
function gerarNumerosCartela() {
  const set = new Set()
  while (set.size < 15) {
    set.add(Math.floor(Math.random() * 90) + 1)
  }
  return Array.from(set)
}

seed().catch(err => {
  console.error('Erro inesperado:', err)
  process.exit(1)
})
