function bindAuthFuncional(request, user, paramName = 'authCodFunc') {
  if (!user || user.isAdmin) return;
  if (!request.parameters?.[paramName]) {
    request.input(paramName, Number(user.funcional));
  }
}

function accessScopePredicate(escadaAlias = 'esc', paramName = 'authCodFunc') {
  return `(
    EXISTS (
      SELECT 1
      FROM TESTE..TB_COORD_GA AS auth_ga
      WHERE auth_ga.COD_FUNC = @${paramName}
        AND auth_ga.CHAVE_GERENCIA_AREA = ${escadaAlias}.CHAVE_GERENCIA_AREA
    )
    OR EXISTS (
      SELECT 1
      FROM TESTE..TB_COORD_COORDENADOR AS auth_coord
      WHERE auth_coord.COD_FUNC = @${paramName}
        AND auth_coord.CHAVE_COORDENACAO = ${escadaAlias}.CHAVE_COORDENACAO
    )
    OR EXISTS (
      SELECT 1
      FROM TESTE..TB_COORD_SUP AS auth_sup
      WHERE auth_sup.COD_FUNC = @${paramName}
        AND auth_sup.CHAVE_SUPERVISAO = ${escadaAlias}.CHAVE_SUPERVISAO
    )
  )`;
}

function applyAccessScope(request, user, escadaAlias = 'esc', paramName = 'authCodFunc') {
  if (!user || user.isAdmin) return '';
  bindAuthFuncional(request, user, paramName);
  return ` AND ${accessScopePredicate(escadaAlias, paramName)}`;
}

function accessScopeExistsForEntity(
  request,
  user,
  matchSql,
  escadaAlias = 'auth_ent',
  paramName = 'authCodFunc'
) {
  if (!user || user.isAdmin) return '';
  bindAuthFuncional(request, user, paramName);
  return `
    AND EXISTS (
      SELECT 1
      FROM MESU..CONS_DISTRIBUICAO_ENTIDADES AS ${escadaAlias}
      WHERE ${matchSql}
        AND ${accessScopePredicate(escadaAlias, paramName)}
    )
  `;
}

function authCacheKey(user) {
  return user?.isAdmin ? 'admin' : `funcional:${user?.funcional ?? 'anonimo'}`;
}

export {
  bindAuthFuncional,
  accessScopePredicate,
  applyAccessScope,
  accessScopeExistsForEntity,
  authCacheKey,
};
