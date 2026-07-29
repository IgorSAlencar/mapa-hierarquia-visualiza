USE [TESTE];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;
GO

/*
Remove do feed as notificações vinculadas a roteiros cancelados, preservando
o histórico para auditoria. Também neutraliza eventos ainda pendentes no
outbox para impedir que a notificação seja recriada.

O script é idempotente e pode ser executado novamente sem alterar registros
já cancelados. Execute-o depois de publicar o backend atualizado e reiniciar
o worker de visitas.
*/

IF OBJECT_ID(N'dbo.ROTEIROS_MAPA', N'U') IS NULL
   OR OBJECT_ID(N'dbo.TB_NOTIFICACAO', N'U') IS NULL
   OR OBJECT_ID(N'dbo.TB_NOTIFICACAO_USUARIO', N'U') IS NULL
   OR OBJECT_ID(N'dbo.TB_EVENTO_OUTBOX', N'U') IS NULL
BEGIN
    THROW 50001, 'As tabelas de roteiros/notificações não foram encontradas no banco TESTE.', 1;
END;
GO

DECLARE @Agora DATETIME2(3) = SYSUTCDATETIME();
DECLARE @NotificacoesCanceladas INT = 0;
DECLARE @DestinatariosCancelados INT = 0;
DECLARE @EventosNeutralizados INT = 0;

DECLARE @Notificacoes TABLE (
    ID BIGINT NOT NULL PRIMARY KEY
);

BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO @Notificacoes (ID)
    SELECT n.ID
    FROM dbo.TB_NOTIFICACAO AS n WITH (UPDLOCK, HOLDLOCK)
    INNER JOIN dbo.ROTEIROS_MAPA AS r WITH (HOLDLOCK)
        ON r.ID = n.ROTEIRO_ID
    WHERE r.STATUS_GESTAO = 'CANCELADO';

    UPDATE n
    SET
        STATUS = 'CANCELADA',
        RESOLVIDA_EM_UTC = COALESCE(n.RESOLVIDA_EM_UTC, @Agora),
        RESOLVIDA_POR = COALESCE(r.ATUALIZADO_POR, n.COD_FUNC_ORIGEM),
        MOTIVO_RESOLUCAO = 'ROTEIRO_CANCELADO'
    FROM dbo.TB_NOTIFICACAO AS n
    INNER JOIN @Notificacoes AS alvo
        ON alvo.ID = n.ID
    INNER JOIN dbo.ROTEIROS_MAPA AS r
        ON r.ID = n.ROTEIRO_ID
    WHERE n.STATUS = 'ATIVA';

    SET @NotificacoesCanceladas = @@ROWCOUNT;

    UPDATE nu
    SET
        STATUS = 'CANCELADA',
        RESOLVIDA_EM_UTC = COALESCE(nu.RESOLVIDA_EM_UTC, @Agora),
        ADIADA_ATE_EM_UTC = NULL,
        ACAO_EXECUTADA = 'ROTEIRO_CANCELADO',
        ACAO_EXECUTADA_EM_UTC = @Agora,
        ATUALIZADO_EM_UTC = @Agora,
        ATUALIZADO_POR = COALESCE(r.ATUALIZADO_POR, n.COD_FUNC_ORIGEM, nu.ATUALIZADO_POR)
    FROM dbo.TB_NOTIFICACAO_USUARIO AS nu
    INNER JOIN @Notificacoes AS alvo
        ON alvo.ID = nu.NOTIFICACAO_ID
    INNER JOIN dbo.TB_NOTIFICACAO AS n
        ON n.ID = nu.NOTIFICACAO_ID
    INNER JOIN dbo.ROTEIROS_MAPA AS r
        ON r.ID = n.ROTEIRO_ID
    WHERE nu.STATUS NOT IN ('RESOLVIDA', 'ARQUIVADA', 'CANCELADA');

    SET @DestinatariosCancelados = @@ROWCOUNT;

    UPDATE outbox
    SET
        STATUS = 'PROCESSADO',
        PROCESSADO_EM_UTC = COALESCE(outbox.PROCESSADO_EM_UTC, @Agora),
        BLOQUEADO_ATE_EM_UTC = NULL,
        BLOQUEADO_POR_WORKER = NULL,
        ULTIMO_ERRO = N'Ignorado porque o roteiro foi cancelado.'
    FROM dbo.TB_EVENTO_OUTBOX AS outbox
    WHERE outbox.STATUS IN ('PENDENTE', 'ERRO', 'PROCESSANDO')
      AND EXISTS (
          SELECT 1
          FROM dbo.ROTEIROS_MAPA AS r
          WHERE r.STATUS_GESTAO = 'CANCELADO'
            AND (
                (
                    outbox.AGREGADO_TIPO = 'ROTEIRO'
                    AND TRY_CONVERT(UNIQUEIDENTIFIER, outbox.AGREGADO_ID) = r.ID
                )
                OR TRY_CONVERT(
                    UNIQUEIDENTIFIER,
                    JSON_VALUE(outbox.PAYLOAD_JSON, '$.routeId')
                ) = r.ID
            )
      );

    SET @EventosNeutralizados = @@ROWCOUNT;

    COMMIT TRANSACTION;

    SELECT
        @NotificacoesCanceladas AS NOTIFICACOES_CANCELADAS,
        @DestinatariosCancelados AS DESTINATARIOS_CANCELADOS,
        @EventosNeutralizados AS EVENTOS_OUTBOX_NEUTRALIZADOS;

    SELECT COUNT_BIG(*) AS NOTIFICACOES_ATIVAS_EM_ROTEIROS_CANCELADOS
    FROM dbo.TB_NOTIFICACAO AS n
    INNER JOIN dbo.ROTEIROS_MAPA AS r
        ON r.ID = n.ROTEIRO_ID
    WHERE n.STATUS = 'ATIVA'
      AND r.STATUS_GESTAO = 'CANCELADO';
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
