USE [TESTE];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_PADDING ON;
SET ANSI_WARNINGS ON;
SET ARITHABORT ON;
SET CONCAT_NULL_YIELDS_NULL ON;
SET NUMERIC_ROUNDABORT OFF;
GO

IF OBJECT_ID(N'dbo.TB_VISITA_TRATATIVA', N'U') IS NULL
    THROW 51030, 'Execute primeiro 01_create_visitas_notificacoes.sql.', 1;

IF OBJECT_ID(N'dbo.TB_PRODUTO_FOCO', N'U') IS NULL
    THROW 51031, 'Catálogo de produtos não encontrado.', 1;
GO

DECLARE @CorrelationId UNIQUEIDENTIFIER = NEWID();
DECLARE @Hoje DATE = CONVERT(DATE, SYSDATETIME());

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO dbo.TB_VISITA_TRATATIVA (
        PARADA_ROTEIRO_ID,
        ROTEIRO_ID,
        VISITA_ORIGEM_ID,
        SEQUENCIA,
        EH_ATUAL,
        CHAVE_LOJA,
        NOME_LOJA,
        COD_AG,
        CHAVE_SUPERVISAO,
        ENDERECO,
        COD_FUNC_RESPONSAVEL,
        NOME_RESPONSAVEL,
        COD_FUNC_CRIADOR,
        NOME_CRIADOR,
        DATA_PLANEJADA,
        HORARIO_PLANEJADO,
        FUSO_HORARIO,
        PRIORIDADE,
        ORIENTACAO,
        STATUS,
        RESULTADO_COMERCIAL,
        CRIADO_POR,
        ATUALIZADO_POR
    )
    SELECT
        p.ID,
        r.ID,
        NULL,
        1,
        1,
        p.CHAVE_LOJA,
        p.NOME,
        p.COD_AG,
        r.CHAVE_SUPERVISAO,
        p.ENDERECO,
        r.COD_FUNC_RESPONSAVEL,
        r.NOME_RESPONSAVEL,
        r.COD_FUNC_CRIADOR,
        r.NOME_CRIADOR,
        r.DATA_ROTEIRO,
        TRY_CONVERT(TIME(0), NULLIF(LTRIM(RTRIM(p.HORARIO)), N'')),
        'America/Sao_Paulo',
        r.PRIORIDADE,
        r.ORIENTACAO,
        'PENDENTE',
        'SEM_RESULTADO',
        r.COD_FUNC_CRIADOR,
        r.COD_FUNC_CRIADOR
    FROM dbo.ROTEIROS_MAPA AS r
    INNER JOIN dbo.ROTEIRO_PARADAS_MAPA AS p
        ON p.ROTEIRO_ID = r.ID
    WHERE r.STATUS_GESTAO = 'ATIVO'
      AND p.ATIVO = 1
      AND r.DATA_ROTEIRO >= @Hoje
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.TB_VISITA_TRATATIVA AS v
          WHERE v.PARADA_ROTEIRO_ID = p.ID
      );

    ;WITH Focos AS (
        SELECT
            v.ID AS VISITA_ID,
            v.CRIADO_POR,
            UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(100), j.[value])))) AS FOCO
        FROM dbo.TB_VISITA_TRATATIVA AS v
        INNER JOIN dbo.ROTEIRO_PARADAS_MAPA AS p
            ON p.ID = v.PARADA_ROTEIRO_ID
        CROSS APPLY OPENJSON(p.FOCOS_JSON) AS j
        WHERE v.DATA_PLANEJADA >= @Hoje
          AND v.SEQUENCIA = 1
    ),
    FocosMapeados AS (
        SELECT DISTINCT
            VISITA_ID,
            CRIADO_POR,
            CASE
                WHEN FOCO IN (N'CRÉDITO', N'CREDITO') THEN 'CREDITO'
                WHEN FOCO = N'CIELO' THEN 'CIELO'
                WHEN FOCO IN (N'NEGÓCIO', N'NEGOCIO', N'FAZER NEGÓCIO', N'FAZER NEGOCIO')
                    THEN 'FAZER_NEGOCIO'
                WHEN FOCO = N'ATIVO PADE' THEN 'ATIVO_PADE'
                WHEN FOCO IN (N'PROPOSTA DE VALOR', N'PROPOSTA VALOR')
                    THEN 'PROPOSTA_VALOR'
                WHEN FOCO = N'RELACIONAMENTO' THEN 'RELACIONAMENTO'
                ELSE NULL
            END AS CODIGO_PRODUTO
        FROM Focos
    )
    INSERT INTO dbo.TB_VISITA_PRODUTO (
        VISITA_ID,
        PRODUTO_ID,
        REGRA_ACOMPANHAMENTO_ID,
        CODIGO_PRODUTO_SNAPSHOT,
        NOME_PRODUTO_SNAPSHOT,
        TIPO_OPORTUNIDADE,
        OPORTUNIDADE_SNAPSHOT_JSON,
        STATUS_TRATATIVA,
        NECESSITA_ACOMPANHAMENTO,
        STATUS_ACOMPANHAMENTO,
        CRIADO_POR,
        ATUALIZADO_POR
    )
    SELECT
        f.VISITA_ID,
        p.ID,
        r.ID,
        p.CODIGO,
        p.NOME,
        'GERAL',
        N'{}',
        'PENDENTE',
        0,
        'NAO_APLICAVEL',
        f.CRIADO_POR,
        f.CRIADO_POR
    FROM FocosMapeados AS f
    INNER JOIN dbo.TB_PRODUTO_FOCO AS p
        ON p.CODIGO = f.CODIGO_PRODUTO
       AND p.ATIVO = 1
    LEFT JOIN dbo.TB_PRODUTO_REGRA_ACOMPANHAMENTO AS r
        ON r.PRODUTO_ID = p.ID
       AND r.TIPO_OPORTUNIDADE = 'GERAL'
       AND r.ATIVO = 1
    WHERE f.CODIGO_PRODUTO IS NOT NULL
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.TB_VISITA_PRODUTO AS vp
          WHERE vp.VISITA_ID = f.VISITA_ID
            AND vp.PRODUTO_ID = p.ID
      );

    INSERT INTO dbo.TB_HISTORICO_VISITA (
        VISITA_ID,
        TIPO_EVENTO,
        STATUS_ANTERIOR,
        STATUS_NOVO,
        DADOS_NOVOS_JSON,
        MOTIVO,
        COD_FUNC_ATOR,
        ORIGEM,
        CORRELATION_ID
    )
    SELECT
        v.ID,
        'VISITA_CRIADA_BACKFILL',
        NULL,
        v.STATUS,
        (
            SELECT
                v.ROTEIRO_ID AS roteiroId,
                v.PARADA_ROTEIRO_ID AS paradaId,
                v.DATA_PLANEJADA AS dataPlanejada
            FOR JSON PATH, WITHOUT_ARRAY_WRAPPER
        ),
        N'Backfill idempotente de roteiro ativo com data atual ou futura.',
        NULL,
        'SISTEMA',
        @CorrelationId
    FROM dbo.TB_VISITA_TRATATIVA AS v
    WHERE v.DATA_PLANEJADA >= @Hoje
      AND NOT EXISTS (
          SELECT 1
          FROM dbo.TB_HISTORICO_VISITA AS h
          WHERE h.VISITA_ID = v.ID
            AND h.TIPO_EVENTO IN ('VISITA_CRIADA', 'VISITA_CRIADA_BACKFILL')
      );

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

-- Resultado esperado: nenhuma linha. Corrigir os focos antes de ativar a UI.
SELECT DISTINCT
    p.ROTEIRO_ID,
    p.ID AS PARADA_ROTEIRO_ID,
    p.NOME,
    CONVERT(NVARCHAR(100), j.[value]) AS FOCO_NAO_MAPEADO
FROM dbo.ROTEIRO_PARADAS_MAPA AS p
INNER JOIN dbo.ROTEIROS_MAPA AS r
    ON r.ID = p.ROTEIRO_ID
CROSS APPLY OPENJSON(p.FOCOS_JSON) AS j
WHERE r.STATUS_GESTAO = 'ATIVO'
  AND p.ATIVO = 1
  AND r.DATA_ROTEIRO >= CONVERT(DATE, SYSDATETIME())
  AND UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(100), j.[value])))) NOT IN (
      N'CRÉDITO', N'CREDITO', N'CIELO', N'NEGÓCIO', N'NEGOCIO',
      N'FAZER NEGÓCIO', N'FAZER NEGOCIO', N'ATIVO PADE',
      N'PROPOSTA DE VALOR', N'PROPOSTA VALOR', N'RELACIONAMENTO'
  );
GO
