/*
  ORIENTACAO — TB_MAPA_PONTO_REGIONAL (espelho de src/data/regionMapPointsMock.ts)
  Requer TB_UF populada (02_SEED_DIMENSOES.sql).
*/

-- USE [TESTE];
-- GO

SET NOCOUNT ON;

INSERT INTO dbo.TB_MAPA_PONTO_REGIONAL (PONTO_ID, KIND, NOME, UF_SIGLA, LONGITUDE, LATITUDE) VALUES
(N'ra-sp-1', N'agencia', N'Agência Paulista', N'SP', -46.6333, -23.5505),
(N'ra-sp-2', N'agencia', N'Agência Pinheiros', N'SP', -46.6919, -23.5615),
(N'ra-sp-3', N'agencia', N'Agência Campinas Centro', N'SP', -47.0618, -22.9056),
(N'ra-rj-1', N'agencia', N'Agência Copacabana', N'RJ', -43.1822, -22.9711),
(N'ra-rj-2', N'agencia', N'Agência Niterói', N'RJ', -43.1033, -22.8833),
(N'ra-ba-1', N'agencia', N'Agência Pelourinho', N'BA', -38.508, -12.9718),
(N'ra-ba-2', N'agencia', N'Agência Lauro de Freitas', N'BA', -38.321, -12.8978),
(N'ra-mg-1', N'agencia', N'Agência Savassi', N'MG', -43.937, -19.934),
(N'ra-mg-2', N'agencia', N'Agência Uberlândia', N'MG', -48.2772, -18.9186),
(N'rs-sp-1', N'supervisor', N'Supervisão — Centro SP', N'SP', -46.641, -23.548),
(N'rs-sp-2', N'supervisor', N'Supervisão — Zona Sul SP', N'SP', -46.672, -23.62),
(N'rs-sp-3', N'supervisor', N'Supervisão — Campinas', N'SP', -47.058, -22.89),
(N'rs-rj-1', N'supervisor', N'Supervisão — Zona Norte RJ', N'RJ', -43.25, -22.87),
(N'rs-rj-2', N'supervisor', N'Supervisão — Baixada', N'RJ', -43.1, -22.82),
(N'rs-ba-1', N'supervisor', N'Supervisão — Salvador', N'BA', -38.49, -12.99),
(N'rs-ba-2', N'supervisor', N'Supervisão — Camaçari', N'BA', -38.324, -12.698),
(N'rs-mg-1', N'supervisor', N'Supervisão — BH Centro', N'MG', -43.938, -19.92),
(N'rl-sp-1', N'loja', N'Loja Higienópolis', N'SP', -46.655, -23.541),
(N'rl-sp-2', N'loja', N'Loja Moema', N'SP', -46.662, -23.603),
(N'rl-sp-3', N'loja', N'Loja Campinas Shopping', N'SP', -47.048, -22.905),
(N'rl-rj-1', N'loja', N'Loja Barra', N'RJ', -43.365, -23.006),
(N'rl-rj-2', N'loja', N'Loja Tijuca', N'RJ', -43.233, -22.924),
(N'rl-ba-1', N'loja', N'Loja Paralela', N'BA', -38.456, -12.983),
(N'rl-ba-2', N'loja', N'Loja Feira de Santana', N'BA', -38.966, -12.266),
(N'rl-mg-1', N'loja', N'Loja Pampulha', N'MG', -43.993, -19.856),
(N'rl-mg-2', N'loja', N'Loja Juiz de Fora', N'MG', -43.35, -21.76);

PRINT N'Seed TB_MAPA_PONTO_REGIONAL: camadas regionais (mock regionMapPoints).';
GO
