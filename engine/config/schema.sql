-- ============================================================
-- BINGO ONLINE — Schema Supabase (PostgreSQL)
-- Execute no SQL Editor do Supabase
-- ============================================================

-- 1. PONTOS VENDEDORES
CREATE TABLE pontos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  cidade        TEXT NOT NULL,
  estado        CHAR(2) NOT NULL DEFAULT 'MG',
  operador_id   UUID,
  comissao_pct  DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  display_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  divida_total  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. SORTEIOS
CREATE TABLE sorteios (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero              SERIAL UNIQUE,
  status              TEXT NOT NULL DEFAULT 'agendado'
                      CHECK (status IN ('agendado','ativo','pausado','finalizado','cancelado')),
  inicio_em           TIMESTAMPTZ NOT NULL,
  finalizado_em       TIMESTAMPTZ,

  -- Configuração financeira
  preco_cartela       DECIMAL(8,2) NOT NULL DEFAULT 2.00,
  total_cartelas      INT NOT NULL DEFAULT 1000,
  pct_kuadra          DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  pct_kina            DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  pct_keno            DECIMAL(5,2) NOT NULL DEFAULT 30.00,
  pct_ponto           DECIMAL(5,2) NOT NULL DEFAULT 20.00,
  acumulado_ate_bola  INT NOT NULL DEFAULT 35,

  -- Prêmios calculados (preenchidos ao criar)
  premio_kuadra       DECIMAL(10,2),
  premio_kina         DECIMAL(10,2),
  premio_keno         DECIMAL(10,2),

  -- Acumulado de rodadas anteriores
  acumulado_valor     DECIMAL(10,2) DEFAULT 0,

  -- Bolas sorteadas (array crescente)
  bolas_sorteadas     INT[] DEFAULT '{}',

  -- Auditoria
  seed_hash           TEXT,   -- SHA256 do seed antes do sorteio
  seed_valor          TEXT,   -- Revelado após finalizar
  arrecadacao_total   DECIMAL(10,2) DEFAULT 0,

  criado_em           TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CARTELAS
CREATE TABLE cartelas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          BIGINT UNIQUE NOT NULL,  -- Número impresso na cartela física
  sorteio_id      UUID NOT NULL REFERENCES sorteios(id) ON DELETE CASCADE,
  ponto_id        UUID REFERENCES pontos(id),

  -- Os 15 números (3 linhas × 5 colunas, universo 1-90)
  numeros         INT[] NOT NULL,

  -- Status de venda
  status          TEXT NOT NULL DEFAULT 'disponivel'
                  CHECK (status IN ('disponivel','vendida','paga','cancelada')),
  tipo_pagamento  TEXT CHECK (tipo_pagamento IN ('pix','cash',NULL)),

  -- Comprador
  comprador_nome  TEXT,
  comprador_tel   TEXT,

  -- Financeiro
  valor_pago      DECIMAL(8,2),
  pix_txid        TEXT,      -- ID da transação PIX (Iugu)
  pago_em         TIMESTAMPTZ,

  criado_em       TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para busca rápida por sorteio (verificação de ganhadores)
CREATE INDEX idx_cartelas_sorteio ON cartelas(sorteio_id) WHERE status = 'paga';
CREATE INDEX idx_cartelas_codigo  ON cartelas(codigo);

-- 4. BOLAS (log de cada bola sorteada)
CREATE TABLE bolas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sorteio_id  UUID NOT NULL REFERENCES sorteios(id) ON DELETE CASCADE,
  numero      INT NOT NULL CHECK (numero BETWEEN 1 AND 90),
  sequencia   INT NOT NULL,       -- 1ª bola, 2ª bola, etc.
  sorteada_em TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (sorteio_id, numero)
);

-- Índice para realtime subscription eficiente
CREATE INDEX idx_bolas_sorteio ON bolas(sorteio_id, sequencia);

-- 5. GANHADORES
CREATE TABLE ganhadores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sorteio_id        UUID NOT NULL REFERENCES sorteios(id),
  cartela_id        UUID NOT NULL REFERENCES cartelas(id),
  ponto_id          UUID REFERENCES pontos(id),
  tipo              TEXT NOT NULL CHECK (tipo IN ('kuadra','kina','keno')),
  bola_na_sequencia INT NOT NULL,  -- Em qual bola ocorreu
  premio_valor      DECIMAL(10,2) NOT NULL,
  pago_em           TIMESTAMPTZ,
  pix_pago_txid     TEXT,
  criado_em         TIMESTAMPTZ DEFAULT NOW()
);

-- 6. TRANSAÇÕES FINANCEIRAS
CREATE TABLE transacoes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo        TEXT NOT NULL CHECK (tipo IN ('venda_pix','venda_cash','premio','comissao','repasse','saque')),
  sorteio_id  UUID REFERENCES sorteios(id),
  ponto_id    UUID REFERENCES pontos(id),
  cartela_id  UUID REFERENCES cartelas(id),
  valor       DECIMAL(10,2) NOT NULL,
  descricao   TEXT,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REALTIME: Habilitar para as tabelas que o display precisa
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE bolas;
ALTER PUBLICATION supabase_realtime ADD TABLE ganhadores;
ALTER PUBLICATION supabase_realtime ADD TABLE sorteios;

-- ============================================================
-- RLS (Row Level Security)
-- ============================================================
ALTER TABLE pontos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cartelas  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bolas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ganhadores ENABLE ROW LEVEL SECURITY;

-- Display TV só lê bolas e ganhadores do sorteio ativo (via token)
CREATE POLICY "bolas_publico_leitura" ON bolas
  FOR SELECT USING (true);

CREATE POLICY "ganhadores_publico_leitura" ON ganhadores
  FOR SELECT USING (true);

CREATE POLICY "sorteios_publico_leitura" ON sorteios
  FOR SELECT USING (true);

-- ============================================================
-- FUNÇÃO: Gerar série de cartelas
-- ============================================================
CREATE OR REPLACE FUNCTION gerar_cartelas(
  p_sorteio_id UUID,
  p_ponto_id   UUID,
  p_quantidade INT
)
RETURNS INT AS $$
DECLARE
  i INT;
  nums INT[];
  base_codigo BIGINT;
  novo_codigo BIGINT;
BEGIN
  SELECT COALESCE(MAX(codigo), 100000) INTO base_codigo FROM cartelas;

  FOR i IN 1..p_quantidade LOOP
    -- Gera 15 números únicos entre 1 e 90
    SELECT ARRAY(
      SELECT DISTINCT floor(random()*90+1)::INT
      FROM generate_series(1,200)
      ORDER BY 1
      LIMIT 15
    ) INTO nums;

    novo_codigo := base_codigo + i;

    INSERT INTO cartelas (codigo, sorteio_id, ponto_id, numeros)
    VALUES (novo_codigo, p_sorteio_id, p_ponto_id, nums);
  END LOOP;

  RETURN p_quantidade;
END;
$$ LANGUAGE plpgsql;
