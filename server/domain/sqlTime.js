/**
 * O driver tedious valida parâmetros TIME como Date. Strings "HH:mm" não são
 * aceitas diretamente, embora sejam válidas no SQL Server.
 */
export function sqlTimeValue(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const normalized = String(value).trim();
  const match = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;

  const date = new Date(0);
  date.setUTCHours(Number(match[1]), Number(match[2]), Number(match[3] ?? 0), 0);
  return date;
}
