export interface AgencyPopupInfo {
  nome: string;
  sub: string;
  kind: string;
  codAg: string;
  enderecoFormatado: string;
}

/** Classe no container do Mapbox Popup (click + hover de agência). */
export const AGENCY_MAP_POPUP_CLASS = 'agency-map-popup';

export const agencyMapPopupClickOptions = {
  className: AGENCY_MAP_POPUP_CLASS,
  maxWidth: '288px',
  offset: 16,
} as const;

export const agencyMapPopupHoverOptions = {
  ...agencyMapPopupClickOptions,
  maxWidth: '450px',
  closeButton: false,
  closeOnClick: false,
} as const;

function normalizeCodAgFromProps(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const n = Number(raw.replace(',', '.'));
  if (Number.isFinite(n)) return String(Math.trunc(n));
  return raw;
}

export function readAgencyPopupInfoFromProperties(
  properties: GeoJSON.GeoJsonProperties | Record<string, unknown> | null | undefined
): AgencyPopupInfo {
  const p = properties ?? {};
  const record = p as Record<string, unknown>;
  let codAg = normalizeCodAgFromProps(record.cod_ag);
  if (!codAg) {
    const id = String(record.id ?? '');
    const fromId = id.match(/^sql-agencia-(\d+)/i);
    if (fromId) codAg = fromId[1];
  }
  return {
    nome: String(record.nome ?? ''),
    sub: String(record.subtitulo ?? 'Agência'),
    kind: String(record.kind ?? ''),
    codAg,
    enderecoFormatado: String(record.endereco_formatado ?? '').trim(),
  };
}

export function buildAgencyPopupHtml(
  info: AgencyPopupInfo,
  options?: { compact?: boolean }
): string {
  const { nome, sub, kind, codAg, enderecoFormatado } = info;
  const isAgency = kind === 'agencia';
  const title = nome.trim() || 'Agência';
  const subtitle = sub.trim() || 'Agência';

  const cardClass = options?.compact
    ? 'agency-popup-card agency-popup-card--compact'
    : 'agency-popup-card';

  const codeBadge =
    isAgency && codAg
      ? `<span class="agency-popup-code" title="Código da agência">${escapeHtml(codAg)}</span>`
      : '';

  const metaRow =
    codeBadge || subtitle
      ? `<div class="agency-popup-meta">${codeBadge}<span class="agency-popup-label">${escapeHtml(subtitle)}</span></div>`
      : '';

  const addressBlock = enderecoFormatado
    ? `<div class="agency-popup-address-wrap">
        <span class="agency-popup-address-label">Endereço</span>
        <p class="agency-popup-address">${escapeHtml(enderecoFormatado)}</p>
      </div>`
    : '';

  return `<div class="${cardClass}">
    ${metaRow}
    <h3 class="agency-popup-title">${escapeHtml(title)}</h3>
    ${addressBlock}
  </div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
