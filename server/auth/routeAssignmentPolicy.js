const CROSS_PORTFOLIO_ASSIGNMENT_ROLES = new Set(['coordenador', 'gerente_area']);

/**
 * Níveis que podem direcionar um roteiro a um GC mesmo quando as lojas não
 * pertencem à carteira da supervisão escolhida. O escopo hierárquico de quem
 * atribui continua sendo validado separadamente.
 */
export function canAssignRouteOutsideOwnerPortfolio(user) {
  return Boolean(user?.isAdmin || CROSS_PORTFOLIO_ASSIGNMENT_ROLES.has(user?.role));
}
