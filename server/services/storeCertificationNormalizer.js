const STATUS_PRIORITY = new Map([
  ['BLOQUEADO - PERDA DA CERTIFICAÇÃO', 5],
  ['BLOQUEADO - SEM CERTIFICAÇÃO', 4],
  ['A BLOQUEAR - SEM CERTIFICAÇÃO', 3],
  ['CERTIFICAÇÃO OK - PENDENTE RENOVAÇÃO', 2],
  ['CERTIFICAÇÃO OK', 1],
  ['SEM CERTIFICAÇÃO', 0],
]);

function normalizeText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeDate(value) {
  if (value == null || String(value).trim() === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function highestPriorityStatus(statuses) {
  return statuses.reduce((selected, status) => {
    if (!status) return selected;
    if (!selected) return status;
    return (STATUS_PRIORITY.get(status) ?? 0) > (STATUS_PRIORITY.get(selected) ?? 0)
      ? status
      : selected;
  }, null);
}

export function normalizeStoreCertificationRows(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const people = [];
  const seen = new Set();

  for (const row of source) {
    const certificationDate = normalizeDate(row.DATA_CERTIFICACAO);
    if (!certificationDate) continue;

    const name = normalizeText(row.NOME_INSCRITO) ?? 'NOME NÃO INFORMADO';
    const cpf = normalizeText(row.CPF);
    const expirationDate = normalizeDate(row.DATA_VENCIMENTO);
    const status = normalizeText(row.STATUS_CERTIFICACAO) ?? 'CERTIFICAÇÃO OK';
    const identity = cpf || `${name}|${certificationDate}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    people.push({
      name,
      cpf,
      status,
      certificationDate,
      expirationDate,
    });
  }

  people.sort((left, right) => {
    const leftExpiration = left.expirationDate ?? '9999';
    const rightExpiration = right.expirationDate ?? '9999';
    return leftExpiration.localeCompare(rightExpiration) || left.name.localeCompare(right.name);
  });

  const rowStatuses = source.map((row) => normalizeText(row.STATUS_CERTIFICACAO));
  return {
    status: highestPriorityStatus([
      ...rowStatuses,
      ...people.map((person) => person.status),
    ]),
    people,
  };
}
