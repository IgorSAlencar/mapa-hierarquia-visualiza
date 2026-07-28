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

IF OBJECT_ID(N'dbo.TB_PRODUTO_FOCO', N'U') IS NULL
    THROW 51010, 'Execute primeiro 01_create_visitas_notificacoes.sql.', 1;

DECLARE @UsuarioSistema INT = 0;
DECLARE @InicioVigencia DATE = DATEFROMPARTS(2026, 7, 1);

BEGIN TRY
    BEGIN TRANSACTION;

    DECLARE @Produtos TABLE (
        CODIGO VARCHAR(40) NOT NULL,
        NOME NVARCHAR(100) NOT NULL,
        DESCRICAO NVARCHAR(500) NULL,
        ESTRATEGIA_VALIDACAO VARCHAR(60) NULL,
        PARAMETROS_JSON NVARCHAR(MAX) NOT NULL,
        CRIAR_REGRA BIT NOT NULL
    );

    INSERT INTO @Produtos (
        CODIGO, NOME, DESCRICAO, ESTRATEGIA_VALIDACAO, PARAMETROS_JSON, CRIAR_REGRA
    )
    VALUES
        (
            'CREDITO',
            N'Crédito',
            N'Acompanha produção de crédito posterior à visita.',
            'CREDITO_PRODUCAO',
            N'{"comparison":"AFTER_VISIT_GREATER_THAN_BASELINE","minimumDelta":0}',
            1
        ),
        (
            'CIELO',
            N'Cielo',
            N'Acompanha ativação, adesão ou primeira transação posterior à visita.',
            'CIELO_ATIVACAO_TRANSACAO',
            N'{"evidence":["ACTIVATION","ADHESION","FIRST_TRANSACTION"]}',
            1
        ),
        (
            'PROPOSTA_VALOR',
            N'Proposta de Valor',
            N'Acompanha a saída da condição sem proposta de valor.',
            'PROPOSTA_VALOR_STATUS',
            N'{"fromStatus":"SEM_PROPOSTA_VALOR","expectedExit":true}',
            1
        ),
        (
            'FAZER_NEGOCIO',
            N'Fazer Negócio',
            N'Acompanha ação registrada após a visita.',
            'FAZER_NEGOCIO_ACAO',
            N'{"requireActionAfterVisit":true}',
            1
        ),
        (
            'ATIVO_PADE',
            N'Ativo PADE',
            N'Acompanha atingimento ou evolução do critério PADE homologado.',
            'ATIVO_PADE_EVOLUCAO',
            N'{"comparison":"GREATER_THAN_BASELINE","criterion":"CURRENT_MAP_RULE"}',
            1
        ),
        (
            'RELACIONAMENTO',
            N'Relacionamento',
            N'Foco geral sem verificação automática; acompanhamento é manual.',
            NULL,
            N'{"manual":true}',
            0
        );

    INSERT INTO dbo.TB_PRODUTO_FOCO (
        CODIGO,
        NOME,
        DESCRICAO,
        ESTRATEGIA_VALIDACAO,
        ATIVO,
        CRIADO_POR,
        ATUALIZADO_POR
    )
    SELECT
        s.CODIGO,
        s.NOME,
        s.DESCRICAO,
        s.ESTRATEGIA_VALIDACAO,
        1,
        @UsuarioSistema,
        @UsuarioSistema
    FROM @Produtos AS s
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TB_PRODUTO_FOCO AS p
        WHERE p.CODIGO = s.CODIGO
    );

    INSERT INTO dbo.TB_PRODUTO_REGRA_ACOMPANHAMENTO (
        PRODUTO_ID,
        TIPO_OPORTUNIDADE,
        PRAZO_DIAS,
        DIAS_UTEIS,
        HORA_EXECUCAO_LOCAL,
        MAX_TENTATIVAS_TECNICAS,
        INTERVALO_REAVALIACAO_HORAS,
        MAX_ADIAMENTOS_USUARIO,
        ESTRATEGIA_VALIDACAO,
        PARAMETROS_JSON,
        VERSAO_REGRA,
        VIGENCIA_INICIO,
        VIGENCIA_FIM,
        ATIVO,
        CRIADO_POR,
        ATUALIZADO_POR
    )
    SELECT
        p.ID,
        'GERAL',
        4,
        0,
        TIMEFROMPARTS(9, 0, 0, 0, 0),
        5,
        24,
        3,
        s.ESTRATEGIA_VALIDACAO,
        s.PARAMETROS_JSON,
        1,
        @InicioVigencia,
        NULL,
        1,
        @UsuarioSistema,
        @UsuarioSistema
    FROM @Produtos AS s
    INNER JOIN dbo.TB_PRODUTO_FOCO AS p
        ON p.CODIGO = s.CODIGO
    WHERE s.CRIAR_REGRA = 1
      AND NOT EXISTS (
        SELECT 1
        FROM dbo.TB_PRODUTO_REGRA_ACOMPANHAMENTO AS r
        WHERE r.PRODUTO_ID = p.ID
          AND r.TIPO_OPORTUNIDADE = 'GERAL'
          AND r.ATIVO = 1
    );

    DECLARE @RegrasNotificacao TABLE (
        CODIGO VARCHAR(60) NOT NULL,
        TIPO_NOTIFICACAO VARCHAR(60) NOT NULL,
        EVENTO_GATILHO VARCHAR(80) NOT NULL,
        PRIORIDADE_PADRAO VARCHAR(10) NOT NULL,
        ATRASO_INICIAL_MINUTOS INT NOT NULL,
        EXPIRACAO_MINUTOS INT NULL,
        TEMPLATE_TITULO NVARCHAR(200) NOT NULL,
        TEMPLATE_MENSAGEM NVARCHAR(1000) NOT NULL,
        POLITICA_REPETICAO_JSON NVARCHAR(MAX) NOT NULL,
        POLITICA_ESCALADA_JSON NVARCHAR(MAX) NOT NULL,
        ACOES_JSON NVARCHAR(MAX) NOT NULL
    );

    INSERT INTO @RegrasNotificacao (
        CODIGO,
        TIPO_NOTIFICACAO,
        EVENTO_GATILHO,
        PRIORIDADE_PADRAO,
        ATRASO_INICIAL_MINUTOS,
        EXPIRACAO_MINUTOS,
        TEMPLATE_TITULO,
        TEMPLATE_MENSAGEM,
        POLITICA_REPETICAO_JSON,
        POLITICA_ESCALADA_JSON,
        ACOES_JSON
    )
    VALUES
        (
            'NOVO_ROTEIRO_ATRIBUIDO',
            'NOVO_ROTEIRO_ATRIBUIDO',
            'ROTEIRO_ATRIBUIDO',
            'ALTA',
            0,
            NULL,
            N'Novo roteiro atribuído',
            N'{{originatorName}} cadastrou um roteiro com {{visitCount}} lojas para você visitar em {{plannedDate}}.',
            N'{"intervalHours":[],"maxDeliveries":1,"stopOnAcknowledgement":true}',
            N'{"levels":[]}',
            N'["VER_ROTEIRO","CONFIRMAR_CIENCIA"]'
        ),
        (
            'ROTEIRO_MARCADO_EQUIPE',
            'ROTEIRO_MARCADO_EQUIPE',
            'ROTEIRO_MARCADO_EQUIPE',
            'NORMAL',
            0,
            NULL,
            N'Roteiro marcado pela equipe',
            N'{{originatorName}} marcou um roteiro com {{visitCount}} lojas em {{plannedDate}}.',
            N'{"intervalHours":[],"maxDeliveries":1,"stopOnAcknowledgement":true}',
            N'{"levels":[]}',
            N'["VER_ROTEIRO","CONFIRMAR_CIENCIA"]'
        ),
        (
            'ROTEIRO_ATUALIZADO',
            'ROTEIRO_ATUALIZADO',
            'ROTEIRO_ALTERADO',
            'ALTA',
            0,
            NULL,
            N'Roteiro atualizado',
            N'O roteiro {{routeName}} foi alterado por {{originatorName}}. {{changeSummary}} Revise as novas informações.',
            N'{"intervalHours":[24],"maxDeliveries":2,"stopOnAcknowledgement":true}',
            N'{"levels":[{"afterHours":48,"recipient":"IMMEDIATE_MANAGER"}]}',
            N'["VER_ROTEIRO","CONFIRMAR_CIENCIA"]'
        ),
        (
            'VISITA_PROXIMA',
            'VISITA_PROXIMA',
            'VISITA_ENTROU_JANELA_LEMBRETE',
            'NORMAL',
            0,
            1440,
            N'Visita programada para {{relativeDay}}',
            N'Você possui {{visitCount}} lojas planejadas para {{relativeDay}} a partir das {{firstTime}}.',
            N'{"intervalHours":[],"maxDeliveries":1,"groupBy":"ROUTE_OWNER_WINDOW"}',
            N'{"levels":[]}',
            N'["VER_ROTEIRO","CONFIRMAR_CIENCIA"]'
        ),
        (
            'TRATATIVA_PENDENTE',
            'TRATATIVA_PENDENTE',
            'VISITA_JANELA_ENCERRADA',
            'ALTA',
            0,
            10080,
            N'Tratativa pendente',
            N'A visita à {{storeLabel}} estava programada para {{plannedLabel}} e ainda não possui tratativa registrada.',
            N'{"intervalHours":[24],"maxDeliveries":2,"reuseOccurrence":true}',
            N'{"levels":[{"afterHours":48,"recipient":"IMMEDIATE_MANAGER"},{"afterHours":96,"recipient":"NEXT_MANAGER"}]}',
            N'["REGISTRAR_VISITA","VER_VISITA","REAGENDAR","ADIAR_LEMBRETE"]'
        ),
        (
            'ATRASO_TRATATIVA_EQUIPE',
            'ATRASO_TRATATIVA_EQUIPE',
            'VISITA_ATRASO_ESCALADO',
            'CRITICA',
            0,
            10080,
            N'Atraso de tratativa na equipe',
            N'{{ownerName}} ainda não registrou a tratativa da {{storeLabel}}, planejada para {{plannedDate}}.',
            N'{"intervalHours":[48],"maxDeliveries":2,"reuseOccurrence":true}',
            N'{"levels":[]}',
            N'["VER_VISITA","SOLICITAR_ACOMPANHAMENTO"]'
        ),
        (
            'PRODUTO_SEM_EVOLUCAO',
            'PRODUTO_SEM_EVOLUCAO',
            'VISITA_PRODUTO_SEM_EVOLUCAO',
            'ALTA',
            0,
            NULL,
            N'Oportunidade sem evolução',
            N'A oportunidade de {{productName}} da {{storeLabel}} continua pendente após a visita realizada em {{visitDate}}.',
            N'{"intervalHours":[48,96],"maxDeliveries":3,"reuseOccurrence":true}',
            N'{"levels":[{"afterHours":168,"recipient":"IMMEDIATE_MANAGER"}]}',
            N'["REGISTRAR_ACOMPANHAMENTO","VER_VISITA","REAGENDAR_CONTATO","MARCAR_SEM_CONTINUIDADE","ADIAR_LEMBRETE"]'
        ),
        (
            'CHECKIN_IRREGULAR',
            'CHECKIN_IRREGULAR',
            'CHECKIN_EXIGE_VALIDACAO',
            'ALTA',
            0,
            10080,
            N'Check-in pendente de validação',
            N'O check-in da {{storeLabel}} foi registrado em condição excepcional e precisa de revisão.',
            N'{"intervalHours":[24],"maxDeliveries":2,"reuseOccurrence":true}',
            N'{"levels":[{"afterHours":48,"recipient":"NEXT_MANAGER"}]}',
            N'["VALIDAR_CHECKIN","REJEITAR_CHECKIN","VER_VISITA"]'
        );

    INSERT INTO dbo.TB_NOTIFICACAO_REGRA (
        CODIGO,
        VERSAO_REGRA,
        TIPO_NOTIFICACAO,
        EVENTO_GATILHO,
        PRIORIDADE_PADRAO,
        ATRASO_INICIAL_MINUTOS,
        EXPIRACAO_MINUTOS,
        TEMPLATE_TITULO,
        TEMPLATE_MENSAGEM,
        POLITICA_REPETICAO_JSON,
        POLITICA_ESCALADA_JSON,
        ACOES_JSON,
        CANAIS_JSON,
        VIGENCIA_INICIO,
        VIGENCIA_FIM,
        ATIVO,
        CRIADO_POR,
        ATUALIZADO_POR
    )
    SELECT
        s.CODIGO,
        1,
        s.TIPO_NOTIFICACAO,
        s.EVENTO_GATILHO,
        s.PRIORIDADE_PADRAO,
        s.ATRASO_INICIAL_MINUTOS,
        s.EXPIRACAO_MINUTOS,
        s.TEMPLATE_TITULO,
        s.TEMPLATE_MENSAGEM,
        s.POLITICA_REPETICAO_JSON,
        s.POLITICA_ESCALADA_JSON,
        s.ACOES_JSON,
        N'["IN_APP"]',
        @InicioVigencia,
        NULL,
        1,
        @UsuarioSistema,
        @UsuarioSistema
    FROM @RegrasNotificacao AS s
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TB_NOTIFICACAO_REGRA AS r
        WHERE r.CODIGO = s.CODIGO
          AND r.ATIVO = 1
    );

    DECLARE @Jobs TABLE (
        CODIGO VARCHAR(80) NOT NULL,
        DESCRICAO NVARCHAR(300) NOT NULL,
        INTERVALO_SEGUNDOS INT NOT NULL
    );

    INSERT INTO @Jobs (CODIGO, DESCRICAO, INTERVALO_SEGUNDOS)
    VALUES
        ('OUTBOX_DISPATCHER', N'Materializa eventos transacionais em notificações.', 5),
        ('VISIT_UPCOMING', N'Gera lembretes de visitas próximas.', 300),
        ('VISIT_OVERDUE', N'Gera e escalona tratativas vencidas.', 300),
        ('PRODUCT_EVOLUTION', N'Avalia evolução dos produtos foco.', 900),
        ('NOTIFICATION_RESURFACE', N'Reativa notificações adiadas.', 300),
        ('NOTIFICATION_EXPIRATION', N'Expira notificações fora da janela.', 3600),
        ('CONSISTENCY_RECONCILER', N'Resolve notificações órfãs ou inconsistentes.', 86400);

    INSERT INTO dbo.TB_JOB_CONTROLE (
        CODIGO,
        DESCRICAO,
        INTERVALO_SEGUNDOS,
        ATIVO,
        PROXIMA_EXECUCAO_EM_UTC
    )
    SELECT
        j.CODIGO,
        j.DESCRICAO,
        j.INTERVALO_SEGUNDOS,
        CASE WHEN j.CODIGO = 'OUTBOX_DISPATCHER' THEN 1 ELSE 0 END,
        SYSUTCDATETIME()
    FROM @Jobs AS j
    WHERE NOT EXISTS (
        SELECT 1
        FROM dbo.TB_JOB_CONTROLE AS c
        WHERE c.CODIGO = j.CODIGO
    );

    -- Ambientes que já tinham o job desligado: ativa o dispatch de notificações.
    UPDATE dbo.TB_JOB_CONTROLE
    SET
        ATIVO = 1,
        PROXIMA_EXECUCAO_EM_UTC = SYSUTCDATETIME(),
        BLOQUEADO_ATE_EM_UTC = NULL,
        BLOQUEADO_POR_WORKER = NULL,
        ATUALIZADO_EM_UTC = SYSUTCDATETIME()
    WHERE CODIGO = 'OUTBOX_DISPATCHER'
      AND ATIVO = 0;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
