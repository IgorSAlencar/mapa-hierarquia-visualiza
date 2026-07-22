import type { CommercialSeatLevel } from '@/lib/mapDataApi';

export interface AgencyPopupInfo {
  nome: string;
  sub: string;
  kind: string;
  codAg: string;
  enderecoFormatado: string;
  commercialLevel: CommercialSeatLevel | null;
  chaveEntidade: number | null;
  personName: string;
  warName: string;
  email: string;
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

function readCommercialLevel(value: unknown): CommercialSeatLevel | null {
  const normalized = String(value ?? '').trim();
  if (normalized === 'supervisor' || normalized === 'coordenador' || normalized === 'gerente_area') {
    return normalized;
  }
  return null;
}

function readPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
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
    commercialLevel: readCommercialLevel(record.commercial_level),
    chaveEntidade: readPositiveInteger(record.chave_entidade),
    personName: String(record.pessoa_nome ?? '').trim(),
    warName: String(record.nome_guerra ?? '').trim(),
    email: String(record.email_func ?? '').trim(),
  };
}

export function buildAgencyPopupHtml(
  info: AgencyPopupInfo,
  options?: { compact?: boolean }
): string {
  const { nome, sub, kind, codAg, enderecoFormatado, personName, warName } = info;
  const isAgency = kind === 'agencia';
  const isCommercialSeat = kind === 'supervisor';
  const title = nome.trim() || 'Agência';
  const subtitle = sub.trim() || 'Agência';

  const cardClass = [
    'agency-popup-card',
    options?.compact ? 'agency-popup-card--compact' : '',
    isCommercialSeat ? 'agency-popup-card--seat' : '',
  ].filter(Boolean).join(' ');

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

  const displayWarName = warName || personName;
  const displayFullName = personName && personName !== displayWarName ? personName : '';
  const initials = displayWarName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  const personBlock = isCommercialSeat && displayWarName
    ? `<div class="agency-popup-person">
        <span class="agency-popup-person-avatar" aria-hidden="true">${escapeHtml(initials || 'GC')}</span>
        <span class="agency-popup-person-copy">
          <strong>${escapeHtml(displayWarName)}</strong>
          ${displayFullName ? `<span>${escapeHtml(displayFullName)}</span>` : ''}
        </span>
      </div>`
    : '';

  return `<div class="${cardClass}">
    ${metaRow}
    <h3 class="agency-popup-title">${escapeHtml(title)}</h3>
    ${personBlock}
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
