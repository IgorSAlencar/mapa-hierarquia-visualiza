export interface StorePopupInfo {
  kind: 'loja';
  nome: string;
  chaveLoja: string;
  codAg: string;
  statusTablet: string;
  dataBloqueio: string;
  motivoBloqueio: string;
  tipoPosto: string;
  segmento: string;
  dataUltimaTransacao: string;
  cieloM0: boolean | null;
  checklist: boolean | null;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function readFlag(value: unknown): boolean | null {
  const raw = text(value).toLowerCase();
  if (!raw) return null;
  if (raw === '1' || raw === 'true' || raw === 'sim') return true;
  if (raw === '0' || raw === 'false' || raw === 'nao' || raw === 'não') return false;
  return null;
}

export function readStorePopupInfoFromProperties(
  properties: GeoJSON.GeoJsonProperties | Record<string, unknown> | null | undefined
): StorePopupInfo {
  const p = (properties ?? {}) as Record<string, unknown>;
  return {
    kind: 'loja',
    nome: text(p.nome) || 'Loja',
    chaveLoja: text(p.chave_loja),
    codAg: text(p.cod_ag),
    statusTablet: text(p.status_tablet),
    dataBloqueio: text(p.dt_bloqueio),
    motivoBloqueio: text(p.motivo_bloqueio),
    tipoPosto: text(p.tipo_posto),
    segmento: text(p.desc_segto),
    dataUltimaTransacao: text(p.dt_ult_trx),
    cieloM0: readFlag(p.cielo_m0),
    checklist: readFlag(p.checklist),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value: string): string {
  if (!value) return 'Não informado';
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

const icons = {
  store: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10h18M5 10v9h14v-9M4 5h16l1 5a3 3 0 0 1-5 2 3 3 0 0 1-4 0 3 3 0 0 1-4 0 3 3 0 0 1-5-2l1-5Zm6 14v-5h4v5"/></svg>',
  tablet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M10 18h4"/></svg>',
  checklist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11l2 2 4-5"/><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 3v2h6V3"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>',
  briefcase: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18"/></svg>',
  segment: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="m8 7 3 9m5-9-3 9"/></svg>',
  cielo: '<span class="store-popup-cielo-logo" aria-hidden="true">cielo</span>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
} as const;

function statusItem(
  modifier: string,
  icon: string,
  label: string,
  value: string,
  detail = ''
): string {
  return `<div class="store-popup-status store-popup-status--${modifier}">
    <span class="store-popup-status-icon">${icon}</span>
    <span class="store-popup-status-copy">
      <span class="store-popup-status-label">${escapeHtml(label)}</span>
      <span class="store-popup-status-value">${escapeHtml(value)}</span>
      ${detail ? `<span class="store-popup-status-detail">${escapeHtml(detail)}</span>` : ''}
    </span>
  </div>`;
}

function detailItem(icon: string, label: string, value: string, modifier = ''): string {
  return `<div class="store-popup-detail${modifier ? ` store-popup-detail--${modifier}` : ''}">
    <span class="store-popup-detail-icon">${icon}</span>
    <span class="store-popup-detail-copy">
      <span class="store-popup-detail-label">${escapeHtml(label)}</span>
      <span class="store-popup-detail-value" title="${escapeHtml(value)}">${escapeHtml(value)}</span>
    </span>
  </div>`;
}

export function buildStorePopupHtml(info: StorePopupInfo): string {
  const tablet = info.statusTablet.toUpperCase() || 'NÃO INFORMADO';
  const tabletModifier =
    tablet === 'INSTALADO' ? 'positive' : tablet === 'S/ TABLET' ? 'warning' : 'neutral';
  const isBlocked = Boolean(info.dataBloqueio);
  const checklistValue =
    info.checklist == null ? 'Não informado' : info.checklist ? 'Regularizado' : 'Pendente';
  const checklistModifier =
    info.checklist == null ? 'neutral' : info.checklist ? 'positive' : 'warning';
  const cieloValue = info.cieloM0 == null ? 'Não informado' : info.cieloM0 ? 'Sim' : 'Não';
  return `<article class="store-popup-card" aria-label="Informações da loja ${escapeHtml(info.nome)}">
    <header class="store-popup-header">
      <span class="store-popup-store-icon">${icons.store}</span>
      <span class="store-popup-heading">
        <strong class="store-popup-title" title="${escapeHtml(info.nome)}">${escapeHtml(info.nome)}</strong>
        <span class="store-popup-key">${info.chaveLoja ? `Chave ${escapeHtml(info.chaveLoja)}` : 'Chave não informada'}</span>
        <span class="store-popup-context">
          <span><b>Tipo de posto</b>${escapeHtml(info.tipoPosto || 'Não informado')}</span>
          <span><b>Segmento</b>${escapeHtml(info.segmento || 'Não informado')}</span>
        </span>
      </span>
      <span class="store-popup-close" aria-hidden="true">${icons.close}</span>
    </header>
    <div class="store-popup-divider"></div>
    <section class="store-popup-status-grid">
      ${statusItem(tabletModifier, icons.tablet, 'Tablet', tablet)}
      ${statusItem(checklistModifier, icons.checklist, 'Checklist', checklistValue)}
      ${statusItem(isBlocked ? 'danger' : 'positive', icons.lock, 'Bloqueio', isBlocked ? 'Bloqueada' : 'Não bloqueada', isBlocked ? formatDate(info.dataBloqueio) : '')}
    </section>
    <section class="store-popup-details-grid">
      ${detailItem(icons.cielo, 'Cielo M0', cieloValue, info.cieloM0 ? 'cielo-positive' : 'cielo-neutral')}
      <div class="store-popup-detail store-popup-detail--empty" aria-hidden="true"></div>
      ${detailItem(icons.clock, 'Última transação', formatDate(info.dataUltimaTransacao))}
    </section>
    ${
      isBlocked && info.motivoBloqueio
        ? `<div class="store-popup-reason"><strong>Motivo do bloqueio</strong><span>${escapeHtml(info.motivoBloqueio)}</span></div>`
        : ''
    }
  </article>`;
}
