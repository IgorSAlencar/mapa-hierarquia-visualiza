import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import type { VisitRoute, VisitStop } from '../data/visitRoutes';
import type {
  StoreCertificationOverview,
  StoreCertificationPerson,
  StoreProductionPoint,
} from './mapDataApi';
import {
  buildProductComparisonRows,
  dashWhenZero,
  formatPeriodShort,
  formatSignedCurrency,
  formatSignedQuantity,
  type ProductComparisonRow,
  type RoutePdfStoreProduction,
} from './routePdf/productionComparison.ts';

export type { RoutePdfStoreProduction } from './routePdf/productionComparison.ts';
export type RoutePdfProductionByStore = Record<string, RoutePdfStoreProduction | null>;

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

const A4_WIDTH = PageSizes.A4[0];
const A4_HEIGHT = PageSizes.A4[1];
const MARGIN = 36;

const COLORS = {
  brand: color('#B20A2C'),
  brandDark: color('#7D1024'),
  ink: color('#172033'),
  slate: color('#526078'),
  muted: color('#7A879B'),
  line: color('#DDE3EA'),
  surface: color('#F5F7FA'),
  surfaceSoft: color('#FAFBFC'),
  surfaceBlue: color('#EDF5FB'),
  blue: color('#1378B8'),
  blueDark: color('#0D5A8B'),
  green: color('#13835F'),
  greenSurface: color('#E9F6F1'),
  greenBorder: color('#B9E1D3'),
  warning: color('#9A6500'),
  warningSurface: color('#FFF7DF'),
  warningBorder: color('#E9D493'),
  negative: color('#9A3A4B'),
  negativeSurface: color('#F9EDF0'),
  inactiveSurface: color('#F1F4F7'),
  inactiveIcon: color('#68758A'),
  white: rgb(1, 1, 1),
};

function color(hex: string): RGB {
  const value = hex.replace('#', '');
  return rgb(
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255
  );
}

function pdfText(value: unknown, fallback = '-'): string {
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || fallback;
}

function clampNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatQuantity(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(clampNumber(value));
}

function formatCurrency(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(clampNumber(value));
}

function formatCurrencyCompact(value: unknown): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(clampNumber(value));
}

function formatPeriod(period: unknown): string {
  const raw = String(Math.trunc(clampNumber(period))).padStart(6, '0');
  if (!/^\d{6}$/.test(raw)) return 'Mês atual';
  return `${raw.slice(4, 6)}/${raw.slice(0, 4)}`;
}

function formatGeneratedAt(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = pdfText(text).split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncateToWidth(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = pdfText(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let result = safe;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > maxWidth) {
    result = result.slice(0, -1);
  }
  return `${result.trim()}...`;
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    x: number;
    y: number;
    maxWidth: number;
    maxLines: number;
    size: number;
    lineHeight: number;
    font: PDFFont;
    color?: RGB;
  }
): number {
  const lines = wrapText(text, options.font, options.size, options.maxWidth);
  const visible = lines.slice(0, options.maxLines);
  if (lines.length > options.maxLines && visible.length > 0) {
    visible[visible.length - 1] = truncateToWidth(
      `${visible[visible.length - 1]}...`,
      options.font,
      options.size,
      options.maxWidth
    );
  }
  visible.forEach((line, index) => {
    page.drawText(line, {
      x: options.x,
      y: options.y - index * options.lineHeight,
      size: options.size,
      font: options.font,
      color: options.color ?? COLORS.ink,
    });
  });
  return visible.length * options.lineHeight;
}

function endpointName(value: VisitRoute['origin'] | VisitRoute['destination'], fallback: string): string {
  return pdfText(value?.nome, fallback);
}

function storeProduction(
  stop: VisitStop,
  productionByStore: RoutePdfProductionByStore
): RoutePdfStoreProduction | null {
  const key = String(stop.chaveLoja ?? '').trim();
  return key ? productionByStore[key] ?? null : null;
}

function drawPageChrome(
  page: PDFPage,
  fonts: PdfFonts,
  route: VisitRoute,
  pageNumber: number,
  totalPages: number,
  generatedAt: Date
): void {
  page.drawRectangle({ x: 0, y: A4_HEIGHT - 8, width: A4_WIDTH, height: 8, color: COLORS.brand });
  page.drawLine({
    start: { x: MARGIN, y: 42 },
    end: { x: A4_WIDTH - MARGIN, y: 42 },
    thickness: 0.6,
    color: COLORS.line,
  });

  const leftMaxWidth = 170;
  const originLabel = truncateToWidth(
    endpointName(route.origin, 'Início'),
    fonts.regular,
    7,
    leftMaxWidth
  );
  const destinationLabel = truncateToWidth(
    endpointName(route.destination, 'Última visita'),
    fonts.regular,
    7,
    leftMaxWidth
  );
  page.drawText(originLabel, {
    x: MARGIN,
    y: 26,
    size: 7,
    font: fonts.regular,
    color: COLORS.muted,
  });
  page.drawText(destinationLabel, {
    x: MARGIN,
    y: 14,
    size: 7,
    font: fonts.regular,
    color: COLORS.muted,
  });

  const center = `Gerado em ${formatGeneratedAt(generatedAt)} | Uso interno`;
  const centerWidth = fonts.regular.widthOfTextAtSize(center, 7.5);
  page.drawText(center, {
    x: (A4_WIDTH - centerWidth) / 2,
    y: 20,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.muted,
  });
  const pageLabel = `${pageNumber}/${totalPages}`;
  page.drawText(pageLabel, {
    x: A4_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize(pageLabel, 7.5),
    y: 20,
    size: 7.5,
    font: fonts.bold,
    color: COLORS.slate,
  });
}

function drawCoverHeader(page: PDFPage, fonts: PdfFonts, route: VisitRoute): void {
  page.drawText('MAPA COMERCIAL', {
    x: MARGIN,
    y: 790,
    size: 9,
    font: fonts.bold,
    color: COLORS.brand,
  });
  page.drawText('ROTEIRO DE VISITAS', {
    x: MARGIN,
    y: 756,
    size: 25,
    font: fonts.bold,
    color: COLORS.ink,
  });
  drawWrappedText(page, route.nome, {
    x: MARGIN,
    y: 731,
    maxWidth: A4_WIDTH - MARGIN * 2,
    maxLines: 2,
    size: 11,
    lineHeight: 14,
    font: fonts.regular,
    color: COLORS.slate,
  });

  page.drawRectangle({
    x: MARGIN,
    y: 628,
    width: A4_WIDTH - MARGIN * 2,
    height: 76,
    color: COLORS.surface,
    borderColor: COLORS.line,
    borderWidth: 0.8,
  });
  page.drawRectangle({ x: MARGIN, y: 628, width: 5, height: 76, color: COLORS.brand });
  page.drawText('RESPONSÁVEL', {
    x: MARGIN + 18,
    y: 682,
    size: 7,
    font: fonts.bold,
    color: COLORS.muted,
  });
  page.drawText(truncateToWidth(route.gerenteComercial, fonts.bold, 11, 250), {
    x: MARGIN + 18,
    y: 665,
    size: 11,
    font: fonts.bold,
    color: COLORS.ink,
  });
  const supervision = route.owner?.descricaoSupervisao
    ? `${route.owner.descricaoSupervisao} | Funcional ${route.owner.funcional}`
    : route.chaveSupervisao > 0
      ? `Supervisão ${String(route.chaveSupervisao).padStart(3, '0')}`
      : null;
  if (supervision) {
    page.drawText(truncateToWidth(supervision, fonts.regular, 8.5, 250), {
      x: MARGIN + 18,
      y: 649,
      size: 8.5,
      font: fonts.regular,
      color: COLORS.slate,
    });
  }
  page.drawText('DATA PLANEJADA', {
    x: 375,
    y: 682,
    size: 7,
    font: fonts.bold,
    color: COLORS.muted,
  });
  page.drawText(pdfText(route.data), {
    x: 375,
    y: 663,
    size: 9.5,
    font: fonts.bold,
    color: COLORS.ink,
  });
}

function drawRouteLine(page: PDFPage, fonts: PdfFonts, route: VisitRoute): void {
  const y = 596;
  page.drawText('JORNADA', { x: MARGIN, y: y + 10, size: 7, font: fonts.bold, color: COLORS.muted });
  page.drawCircle({ x: MARGIN + 8, y: y - 14, size: 5, color: COLORS.brand });
  page.drawLine({
    start: { x: MARGIN + 15, y: y - 14 },
    end: { x: A4_WIDTH - MARGIN - 15, y: y - 14 },
    thickness: 2,
    color: COLORS.line,
  });
  page.drawCircle({ x: A4_WIDTH - MARGIN - 8, y: y - 14, size: 5, color: COLORS.blue });
  page.drawText(truncateToWidth(endpointName(route.origin, 'Início'), fonts.bold, 8.5, 210), {
    x: MARGIN,
    y: y - 33,
    size: 8.5,
    font: fonts.bold,
    color: COLORS.ink,
  });
  const destination = truncateToWidth(endpointName(route.destination, 'Última visita'), fonts.bold, 8.5, 210);
  page.drawText(destination, {
    x: A4_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize(destination, 8.5),
    y: y - 33,
    size: 8.5,
    font: fonts.bold,
    color: COLORS.ink,
  });
}

function drawMetricCard(
  page: PDFPage,
  fonts: PdfFonts,
  x: number,
  y: number,
  width: number,
  value: string,
  label: string,
  accent: RGB = COLORS.ink
): void {
  page.drawRectangle({ x, y, width, height: 52, color: COLORS.white, borderColor: COLORS.line, borderWidth: 0.8 });
  page.drawText(truncateToWidth(value, fonts.bold, 15, width - 18), {
    x: x + 9,
    y: y + 27,
    size: 15,
    font: fonts.bold,
    color: accent,
  });
  page.drawText(truncateToWidth(label.toUpperCase(), fonts.bold, 6.5, width - 18), {
    x: x + 9,
    y: y + 11,
    size: 6.5,
    font: fonts.bold,
    color: COLORS.muted,
  });
}

function drawCoverMetrics(page: PDFPage, fonts: PdfFonts, route: VisitRoute): void {
  const y = 484;
  const gap = 8;
  const width = (A4_WIDTH - MARGIN * 2 - gap * 3) / 4;
  const travel = route.durationBreakdown?.travelMinutes;
  const visit = route.durationBreakdown?.visitMinutes;
  const values = [
    [`${formatQuantity(route.distanciaKm)} km`, 'Distância total', COLORS.brand],
    [route.duracaoEstimada, 'Duração estimada', COLORS.ink],
    [travel != null ? `${formatQuantity(travel)} min` : '-', 'Deslocamento', COLORS.blueDark],
    [visit != null ? `${formatQuantity(visit)} min` : `${route.stops.length} visitas`, 'Tempo em visitas', COLORS.green],
  ] as const;
  values.forEach(([value, label, accent], index) => {
    drawMetricCard(page, fonts, MARGIN + index * (width + gap), y, width, value, label, accent);
  });
}

function drawCoverSnapshot(page: PDFPage, fonts: PdfFonts, route: VisitRoute): void {
  const totals = [
    ['Cielo', route.stops.filter((stop) => stop.oportunidades?.oportunidadeCielo).length],
    ['Proposta de valor', route.stops.filter((stop) => stop.oportunidades?.oportunidadePropostaValor).length],
    ['Ativo PADE', route.stops.filter((stop) => stop.oportunidades?.oportunidadeAtivoPade).length],
    ['Realizando Negócio', route.stops.filter((stop) => stop.oportunidades?.oportunidadeNegocio).length],
  ] as const;
  page.drawText('PANORAMA COMERCIAL', { x: MARGIN, y: 457, size: 8, font: fonts.bold, color: COLORS.ink });
  page.drawText('Lojas com a Oportunidade / Total de visitas do roteiro', {
    x: MARGIN,
    y: 443,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.muted,
  });
  const width = (A4_WIDTH - MARGIN * 2) / totals.length;
  totals.forEach(([label, total], index) => {
    const x = MARGIN + width * index;
    if (index > 0) {
      page.drawLine({ start: { x, y: 405 }, end: { x, y: 432 }, thickness: 0.7, color: COLORS.line });
    }
    page.drawText(`${total}/${route.stops.length}`, {
      x: x + 10,
      y: 418,
      size: 13,
      font: fonts.bold,
      color: total > 0 ? COLORS.green : COLORS.slate,
    });
    page.drawText(truncateToWidth(label.toUpperCase(), fonts.bold, 6.2, width - 20), {
      x: x + 10,
      y: 405,
      size: 6.2,
      font: fonts.bold,
      color: COLORS.muted,
    });
  });
}

function drawCoverAgenda(page: PDFPage, fonts: PdfFonts, route: VisitRoute): void {
  const ordered = [...route.stops].sort((a, b) => a.ordem - b.ordem);
  const shown = ordered.slice(0, 8);
  page.drawText('AGENDA DO DIA', { x: MARGIN, y: 381, size: 8, font: fonts.bold, color: COLORS.ink });
  page.drawText('Sequência planejada para execução em campo', {
    x: MARGIN,
    y: 367,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.muted,
  });
  const columnWidth = (A4_WIDTH - MARGIN * 2 - 12) / 2;
  shown.forEach((stop, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * (columnWidth + 12);
    const y = 309 - row * 57;
    page.drawRectangle({ x, y, width: columnWidth, height: 44, color: COLORS.surface, borderColor: COLORS.line, borderWidth: 0.6 });
    page.drawCircle({ x: x + 18, y: y + 22, size: 11, color: COLORS.brand });
    const order = String(stop.ordem);
    page.drawText(order, {
      x: x + 18 - fonts.bold.widthOfTextAtSize(order, 8) / 2,
      y: y + 19,
      size: 8,
      font: fonts.bold,
      color: COLORS.white,
    });
    page.drawText(truncateToWidth(stop.nome, fonts.bold, 8.5, columnWidth - 58), {
      x: x + 38,
      y: y + 26,
      size: 8.5,
      font: fonts.bold,
      color: COLORS.ink,
    });
    page.drawText(`${pdfText(stop.horario)} | ${pdfText(stop.produtoFoco, 'Relacionamento')}`, {
      x: x + 38,
      y: y + 12,
      size: 7,
      font: fonts.regular,
      color: COLORS.slate,
      maxWidth: columnWidth - 50,
    });
  });
  if (ordered.length > shown.length) {
    page.drawText(`+ ${ordered.length - shown.length} visitas detalhadas nas próximas páginas`, {
      x: MARGIN,
      y: 88,
      size: 7.5,
      font: fonts.bold,
      color: COLORS.brand,
    });
  }
}

function drawDetailHeader(page: PDFPage, fonts: PdfFonts, route: VisitRoute, first: number, last: number): void {
  page.drawText('ROTEIRO DE VISITAS', { x: MARGIN, y: 792, size: 7, font: fonts.bold, color: COLORS.brand });
  page.drawText('Caderno de campo', { x: MARGIN, y: 767, size: 18, font: fonts.bold, color: COLORS.ink });
  page.drawText(`Visitas ${first} a ${last} de ${route.stops.length}`, {
    x: MARGIN,
    y: 750,
    size: 8.5,
    font: fonts.regular,
    color: COLORS.slate,
  });
  const date = pdfText(route.data);
  page.drawText(date, {
    x: A4_WIDTH - MARGIN - fonts.bold.widthOfTextAtSize(date, 8.5),
    y: 769,
    size: 8.5,
    font: fonts.bold,
    color: COLORS.slate,
  });
}

function drawStatusCard(
  page: PDFPage,
  fonts: PdfFonts,
  x: number,
  y: number,
  width: number,
  label: string,
  active: boolean,
  value = active ? 'SIM' : 'NÃO'
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height: 29,
    color: active ? COLORS.greenSurface : COLORS.inactiveSurface,
    borderColor: active ? COLORS.greenBorder : COLORS.line,
    borderWidth: 0.6,
  });
  const iconColor = active ? COLORS.green : COLORS.inactiveIcon;
  page.drawCircle({ x: x + 12, y: y + 14.5, size: 6, color: iconColor });
  if (active) {
    page.drawLine({
      start: { x: x + 8.8, y: y + 14.5 },
      end: { x: x + 11.2, y: y + 12.1 },
      thickness: 1.1,
      color: COLORS.white,
    });
    page.drawLine({
      start: { x: x + 11.2, y: y + 12.1 },
      end: { x: x + 15.5, y: y + 17.2 },
      thickness: 1.1,
      color: COLORS.white,
    });
  } else {
    page.drawLine({
      start: { x: x + 9, y: y + 14.5 },
      end: { x: x + 15, y: y + 14.5 },
      thickness: 1.1,
      color: COLORS.white,
    });
  }
  page.drawText(truncateToWidth(label.toUpperCase(), fonts.bold, 5.2, width - 29), {
    x: x + 23,
    y: y + 17.5,
    size: 5.2,
    font: fonts.bold,
    color: COLORS.muted,
  });
  page.drawText(truncateToWidth(value, fonts.bold, 7.3, width - 29), {
    x: x + 23,
    y: y + 6.5,
    size: 7.3,
    font: fonts.bold,
    color: active ? COLORS.green : COLORS.slate,
  });
}

function drawStoreMetric(
  page: PDFPage,
  fonts: PdfFonts,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  emphasis = false
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height: 37,
    color: emphasis ? COLORS.surfaceBlue : COLORS.surface,
    borderColor: emphasis ? COLORS.blue : COLORS.line,
    borderWidth: 0.6,
  });
  page.drawText(label.toUpperCase(), { x: x + 7, y: y + 24, size: 5.8, font: fonts.bold, color: COLORS.muted });
  page.drawText(truncateToWidth(value, fonts.bold, 11, width - 14), {
    x: x + 7,
    y: y + 8,
    size: 11,
    font: fonts.bold,
    color: emphasis ? COLORS.blueDark : COLORS.ink,
  });
}

function formatCertificationDate(value: string | null): string {
  if (!value) return 'sem data';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'sem data';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function compactPersonName(person: StoreCertificationPerson): string {
  const parts = pdfText(person.name, 'Nome não informado').split(' ').filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts.at(-1)}`;
}

function certificationDetail(certification: StoreCertificationOverview | undefined): string {
  if (!certification) return 'Dado não carregado';
  if (certification.people.length === 0) return 'Nenhuma pessoa certificada';

  const shown = certification.people.slice(0, 2).map((person) =>
    `${compactPersonName(person)} ${formatCertificationDate(person.expirationDate)}`
  );
  const remaining = certification.people.length - shown.length;
  return `${shown.join(' | ')}${remaining > 0 ? ` | +${remaining}` : ''}`;
}

function certificationAppearance(
  certification: StoreCertificationOverview | undefined
): { label: string; color: RGB; surface: RGB; border: RGB } {
  if (!certification) {
    return {
      label: 'INDISPONÍVEL',
      color: COLORS.inactiveIcon,
      surface: COLORS.inactiveSurface,
      border: COLORS.line,
    };
  }
  const status = String(certification.status ?? '').toUpperCase();
  if (status.includes('PERDA') || status.startsWith('BLOQUEADO')) {
    return {
      label: status.includes('PERDA') ? 'VENCIDA' : 'BLOQUEADA',
      color: COLORS.negative,
      surface: COLORS.negativeSurface,
      border: color('#E4C3CB'),
    };
  }
  if (status.includes('PENDENTE RENOVAÇÃO') || status.startsWith('A BLOQUEAR')) {
    return {
      label: status.includes('PENDENTE') ? 'RENOVAR' : 'A BLOQUEAR',
      color: COLORS.warning,
      surface: COLORS.warningSurface,
      border: COLORS.warningBorder,
    };
  }
  if (certification.people.length > 0) {
    return {
      label: 'EM DIA',
      color: COLORS.green,
      surface: COLORS.greenSurface,
      border: COLORS.greenBorder,
    };
  }
  return {
    label: 'SEM CERT.',
    color: COLORS.negative,
    surface: COLORS.negativeSurface,
    border: color('#E4C3CB'),
  };
}

function drawCertificationSummary(
  page: PDFPage,
  fonts: PdfFonts,
  certification: StoreCertificationOverview | undefined,
  x: number,
  y: number,
  width: number
): void {
  const appearance = certificationAppearance(certification);
  const height = 24;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: appearance.surface,
    borderColor: appearance.border,
    borderWidth: 0.6,
  });
  page.drawCircle({ x: x + 9, y: y + 12, size: 4, color: appearance.color });
  page.drawCircle({ x: x + 9, y: y + 12, size: 1.6, color: COLORS.white });

  page.drawText('CERTIFICAÇÃO', {
    x: x + 17,
    y: y + 15,
    size: 4.8,
    font: fonts.bold,
    color: appearance.color,
  });

  const badgeWidth = fonts.bold.widthOfTextAtSize(appearance.label, 4.6) + 7;
  page.drawRectangle({
    x: x + width - badgeWidth - 5,
    y: y + 13,
    width: badgeWidth,
    height: 7.5,
    color: COLORS.white,
    opacity: 0.78,
  });
  page.drawText(appearance.label, {
    x: x + width - badgeWidth - 1.5,
    y: y + 15,
    size: 4.6,
    font: fonts.bold,
    color: appearance.color,
  });

  page.drawText(
    truncateToWidth(certificationDetail(certification), fonts.bold, 5.4, width - 24),
    {
      x: x + 17,
      y: y + 5.2,
      size: 5.4,
      font: fonts.bold,
      color: COLORS.ink,
    }
  );
}

interface GridColumn {
  start: number;
  width: number;
}

interface ProductGridCellTexts {
  prevQty: string;
  prevVlr: string;
  curQty: string;
  curVlr: string;
  difQty: string;
  difVlr: string;
  active: boolean;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  baseX: number,
  column: GridColumn,
  baselineY: number,
  size: number,
  font: PDFFont,
  textColor: RGB
): void {
  const textWidth = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: baseX + column.start + Math.max(0, (column.width - textWidth) / 2),
    y: baselineY,
    size,
    font,
    color: textColor,
  });
}

function maxMeasuredWidth(texts: string[], font: PDFFont, size: number): number {
  let max = 0;
  for (const text of texts) {
    max = Math.max(max, font.widthOfTextAtSize(text, size));
  }
  return max;
}

function buildProductCellTexts(row: ProductComparisonRow): ProductGridCellTexts {
  return {
    prevQty: dashWhenZero(formatQuantity(row.previousQuantity), row.previousQuantity),
    prevVlr: row.previousValue && row.previousValue > 0 ? formatCurrencyCompact(row.previousValue) : '-',
    curQty: dashWhenZero(formatQuantity(row.currentQuantity), row.currentQuantity),
    curVlr: row.currentValue && row.currentValue > 0 ? formatCurrencyCompact(row.currentValue) : '-',
    difQty: formatSignedQuantity(row.quantityDelta),
    difVlr: formatSignedCurrency(row.valueDelta),
    active: row.currentQuantity > 0,
  };
}

function drawProductGrid(
  page: PDFPage,
  fonts: PdfFonts,
  rows: ProductComparisonRow[],
  x: number,
  y: number,
  width: number,
  previousLabel: string,
  currentLabel: string
): void {
  const gap = 7;
  const cellWidth = (width - gap) / 2;
  const padding = 7;
  // Só padding à esquerda: o bloco numérico termina na borda direita da metade,
  // alinhado com Fat. Cielo / Proposta de valor / Observação.
  const usable = cellWidth - padding;
  const valueSize = 5.2;
  const headerSize = 4.6;
  const groupTitleSize = 4.8;
  const colGap = 2;
  const cellPad = 3;
  const minLabelWidth = 52;
  const minQtyWidth = 16;
  const minVlrWidth = 22;

  const cells = rows.map(buildProductCellTexts);
  const qtyHeaderWidth = fonts.bold.widthOfTextAtSize('QTD', headerSize);
  const vlrHeaderWidth = fonts.bold.widthOfTextAtSize('VLR', headerSize);

  let qtyWidth = Math.max(
    minQtyWidth,
    qtyHeaderWidth,
    maxMeasuredWidth(cells.map((cell) => cell.prevQty), fonts.regular, valueSize),
    maxMeasuredWidth(cells.map((cell) => cell.curQty), fonts.bold, valueSize),
    maxMeasuredWidth(cells.map((cell) => cell.difQty), fonts.bold, valueSize)
  ) + cellPad * 2;

  let vlrWidth = Math.max(
    minVlrWidth,
    vlrHeaderWidth,
    maxMeasuredWidth(cells.map((cell) => cell.prevVlr), fonts.regular, valueSize),
    maxMeasuredWidth(cells.map((cell) => cell.curVlr), fonts.bold, valueSize),
    maxMeasuredWidth(cells.map((cell) => cell.difVlr), fonts.bold, valueSize),
    fonts.bold.widthOfTextAtSize(previousLabel, groupTitleSize) / 2,
    fonts.bold.widthOfTextAtSize(currentLabel, groupTitleSize) / 2,
    fonts.bold.widthOfTextAtSize('DIF.', groupTitleSize) / 2
  ) + cellPad * 2;

  const numbersBudget = Math.max(80, usable - minLabelWidth);
  const groupsNeeded = (qtyWidth + colGap + vlrWidth) * 3;
  if (groupsNeeded > numbersBudget) {
    const fixedQty = qtyWidth * 3;
    const flexible = Math.max(minVlrWidth * 3, numbersBudget - fixedQty - colGap * 3);
    vlrWidth = Math.max(minVlrWidth, flexible / 3);
    const stillOver = (qtyWidth + colGap + vlrWidth) * 3 - numbersBudget;
    if (stillOver > 0) {
      qtyWidth = Math.max(minQtyWidth, qtyWidth - stillOver / 3);
    }
  }

  const groupInner = qtyWidth + colGap + vlrWidth;
  const difVlr: GridColumn = { start: usable - vlrWidth, width: vlrWidth };
  const difQty: GridColumn = { start: difVlr.start - colGap - qtyWidth, width: qtyWidth };
  const curVlr: GridColumn = { start: difQty.start - vlrWidth, width: vlrWidth };
  const curQty: GridColumn = { start: curVlr.start - colGap - qtyWidth, width: qtyWidth };
  const prevVlr: GridColumn = { start: curQty.start - vlrWidth, width: vlrWidth };
  const prevQty: GridColumn = { start: prevVlr.start - colGap - qtyWidth, width: qtyWidth };
  const prevGroup: GridColumn = { start: prevQty.start, width: groupInner };
  const curGroup: GridColumn = { start: curQty.start, width: groupInner };
  const difGroup: GridColumn = { start: difQty.start, width: groupInner };
  const labelMaxWidth = Math.max(24, prevQty.start - 6);
  const productBandWidth = cellWidth;

  const headerHeight = 17;
  const rowHeight = 13;
  const rowCount = Math.ceil(rows.length / 2);
  const gridBottom = y - headerHeight - rowCount * rowHeight;

  const positionOf = (index: number) => ({
    column: Math.floor(index / rowCount),
    rowIndex: index % rowCount,
  });

  rows.forEach((row, index) => {
    const active = cells[index].active;
    const { column, rowIndex } = positionOf(index);
    const cellX = x + column * (cellWidth + gap);
    const cellY = y - headerHeight - (rowIndex + 1) * rowHeight;
    page.drawRectangle({
      x: cellX,
      y: cellY,
      width: productBandWidth,
      height: rowHeight,
      color: active ? COLORS.surfaceBlue : COLORS.surfaceSoft,
      borderColor: active ? color('#CDE1EF') : COLORS.line,
      borderWidth: 0.35,
    });
    page.drawRectangle({
      x: cellX,
      y: cellY,
      width: 2,
      height: rowHeight,
      color: active ? COLORS.blue : COLORS.line,
    });
  });

  for (let column = 0; column < 2; column += 1) {
    const cellX = x + column * (cellWidth + gap);
    const baseX = cellX + padding;
    const bandHeight = y - gridBottom;

    page.drawRectangle({
      x: baseX + prevGroup.start,
      y: gridBottom,
      width: prevGroup.width,
      height: bandHeight,
      borderColor: COLORS.line,
      borderWidth: 0.35,
    });
    page.drawRectangle({
      x: baseX + curGroup.start,
      y: gridBottom,
      width: curGroup.width,
      height: bandHeight,
      color: COLORS.surfaceBlue,
      opacity: 0.55,
      borderColor: color('#CDE1EF'),
      borderWidth: 0.35,
    });
    page.drawRectangle({
      x: baseX + difGroup.start,
      y: gridBottom,
      width: difGroup.width,
      height: bandHeight,
      borderColor: COLORS.line,
      borderWidth: 0.35,
    });

    drawCenteredText(page, previousLabel, baseX, prevGroup, y - 7.5, groupTitleSize, fonts.bold, COLORS.muted);
    drawCenteredText(page, currentLabel, baseX, curGroup, y - 7.5, groupTitleSize, fonts.bold, COLORS.blueDark);
    drawCenteredText(page, 'DIF.', baseX, difGroup, y - 7.5, groupTitleSize, fonts.bold, COLORS.muted);
    drawCenteredText(page, 'QTD', baseX, prevQty, y - 14, headerSize, fonts.bold, COLORS.muted);
    drawCenteredText(page, 'VLR', baseX, prevVlr, y - 14, headerSize, fonts.bold, COLORS.muted);
    drawCenteredText(page, 'QTD', baseX, curQty, y - 14, headerSize, fonts.bold, COLORS.blueDark);
    drawCenteredText(page, 'VLR', baseX, curVlr, y - 14, headerSize, fonts.bold, COLORS.blueDark);
    drawCenteredText(page, 'QTD', baseX, difQty, y - 14, headerSize, fonts.bold, COLORS.muted);
    drawCenteredText(page, 'VLR', baseX, difVlr, y - 14, headerSize, fonts.bold, COLORS.muted);
  }

  rows.forEach((row, index) => {
    const cell = cells[index];
    const { column, rowIndex } = positionOf(index);
    const cellX = x + column * (cellWidth + gap);
    const baseX = cellX + padding;
    const cellY = y - headerHeight - (rowIndex + 1) * rowHeight;
    const baseline = cellY + 4.6;
    const labelFont = cell.active ? fonts.bold : fonts.regular;

    page.drawText(truncateToWidth(row.label, labelFont, 5.6, labelMaxWidth), {
      x: baseX,
      y: baseline,
      size: 5.6,
      font: labelFont,
      color: cell.active ? COLORS.ink : COLORS.muted,
    });

    drawCenteredText(page, cell.prevQty, baseX, prevQty, baseline, valueSize, fonts.regular, COLORS.slate);
    drawCenteredText(
      page,
      truncateToWidth(cell.prevVlr, fonts.regular, valueSize, prevVlr.width - 2),
      baseX,
      prevVlr,
      baseline,
      valueSize,
      fonts.regular,
      COLORS.slate
    );

    const curFont = cell.active ? fonts.bold : fonts.regular;
    const curColor = cell.active ? COLORS.blueDark : COLORS.inactiveIcon;
    drawCenteredText(page, cell.curQty, baseX, curQty, baseline, valueSize, curFont, curColor);
    drawCenteredText(
      page,
      truncateToWidth(cell.curVlr, curFont, valueSize, curVlr.width - 2),
      baseX,
      curVlr,
      baseline,
      valueSize,
      curFont,
      curColor
    );

    const qtyDifColor = row.quantityDelta > 0
      ? COLORS.green
      : row.quantityDelta < 0
        ? COLORS.negative
        : COLORS.muted;
    drawCenteredText(page, cell.difQty, baseX, difQty, baseline, valueSize, fonts.bold, qtyDifColor);

    const vlrDifColor = (row.valueDelta ?? 0) > 0
      ? COLORS.green
      : (row.valueDelta ?? 0) < 0
        ? COLORS.negative
        : COLORS.muted;
    drawCenteredText(
      page,
      truncateToWidth(cell.difVlr, fonts.bold, valueSize, difVlr.width - 2),
      baseX,
      difVlr,
      baseline,
      valueSize,
      fonts.bold,
      vlrDifColor
    );
  });
}

function drawStoreCard(
  page: PDFPage,
  fonts: PdfFonts,
  stop: VisitStop,
  productionPair: RoutePdfStoreProduction | null,
  top: number
): void {
  const production = productionPair?.current ?? null;
  const certification = productionPair?.certification;
  const x = MARGIN;
  const width = A4_WIDTH - MARGIN * 2;
  const height = 322;
  const bottom = top - height;
  page.drawRectangle({ x, y: bottom, width, height, color: COLORS.white, borderColor: COLORS.line, borderWidth: 0.8 });
  page.drawRectangle({ x: x + 0.8, y: top - 72, width: width - 1.6, height: 71.2, color: COLORS.surfaceSoft });
  page.drawRectangle({ x: x + 0.8, y: top - 72, width: 3.2, height: 71.2, color: COLORS.brand });

  page.drawCircle({ x: x + 24, y: top - 26, size: 14, color: COLORS.brand });
  const order = String(stop.ordem);
  page.drawText(order, {
    x: x + 24 - fonts.bold.widthOfTextAtSize(order, 9) / 2,
    y: top - 29,
    size: 9,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText(truncateToWidth(stop.nome, fonts.bold, 12, 330), {
    x: x + 48,
    y: top - 22,
    size: 12,
    font: fonts.bold,
    color: COLORS.ink,
  });

  const locationLabel = [stop.municipio, stop.uf].filter(Boolean).join('/');
  const metaPrimary = [
    stop.chaveLoja ? `Chave ${stop.chaveLoja}` : null,
    stop.horario ? `Horário ${stop.horario}` : null,
    locationLabel || null,
  ].filter(Boolean).join('   ·   ');
  page.drawText(truncateToWidth(metaPrimary || 'Dados da loja não informados', fonts.regular, 7.5, 360), {
    x: x + 48,
    y: top - 36,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.slate,
  });

  const agencyLabel = stop.codAg
    ? (stop.nomeAg ? `${stop.codAg} - ${stop.nomeAg}` : String(stop.codAg))
    : null;
  const certificationX = x + width - 210;
  const headerDetailWidth = certificationX - (x + 48) - 8;
  if (agencyLabel) {
    page.drawText(truncateToWidth(`Agência ${agencyLabel}`, fonts.regular, 7.2, headerDetailWidth), {
      x: x + 48,
      y: top - 48,
      size: 7.2,
      font: fonts.regular,
      color: COLORS.slate,
    });
  }
  if (stop.statusTablet) {
    page.drawText(truncateToWidth(`Tablet ${stop.statusTablet}`, fonts.regular, 7.2, headerDetailWidth), {
      x: x + 48,
      y: top - 59,
      size: 7.2,
      font: fonts.regular,
      color: COLORS.slate,
    });
  }

  page.drawText(formatPeriod(production?.periodo), {
    x: x + width - 74,
    y: top - 26,
    size: 8,
    font: fonts.bold,
    color: COLORS.brand,
  });
  page.drawText('REFERÊNCIA', {
    x: x + width - 74,
    y: top - 38,
    size: 5.5,
    font: fonts.bold,
    color: COLORS.muted,
  });

  const rawAddress = pdfText(stop.endereco || stop.cep || '', '');
  const normalizedLocation = pdfText(locationLabel, '').toUpperCase();
  const addressLooksLikeLocationOnly = Boolean(
    normalizedLocation
    && rawAddress
    && pdfText(rawAddress, '').toUpperCase() === normalizedLocation
  );
  const addressLabel = addressLooksLikeLocationOnly
    ? ''
    : rawAddress;
  if (addressLabel) {
    page.drawText(truncateToWidth(addressLabel, fonts.regular, 7.2, headerDetailWidth), {
      x: x + 48,
      y: top - 70,
      size: 7.2,
      font: fonts.regular,
      color: COLORS.slate,
    });
  }
  drawCertificationSummary(
    page,
    fonts,
    certification,
    certificationX,
    top - 68,
    width - (certificationX - x) - 16
  );

  const metricY = top - 111;
  const metricGap = 7;
  const metricWidth = (width - 32 - metricGap * 3) / 4;
  drawStoreMetric(page, fonts, x + 16, metricY, metricWidth, 'QTD TRX contábil', formatQuantity(production?.qtdTrxContabil), true);
  drawStoreMetric(page, fonts, x + 16 + (metricWidth + metricGap), metricY, metricWidth, 'QTD TRX negócio', formatQuantity(production?.qtdTrxNegocio), true);
  drawStoreMetric(page, fonts, x + 16 + (metricWidth + metricGap) * 2, metricY, metricWidth, 'Crédito', formatCurrency(production?.vlrCred));
  drawStoreMetric(page, fonts, x + 16 + (metricWidth + metricGap) * 3, metricY, metricWidth, 'Fat. Cielo', formatCurrency(production?.vlrFatCielo));

  const opportunities = stop.oportunidades;
  const checklistDone = stop.checklist === 'OK';
  const checklistValue = stop.checklist === 'OK'
    ? 'SIM'
    : stop.checklist === 'VENCIDO'
      ? 'VENCIDO'
      : stop.checklist === 'NÃO APTO'
        ? 'NÃO APTO'
        : 'NÃO';
  const statuses = [
    ['Checklist', checklistDone, checklistValue],
    ['Tem Cielo?', opportunities?.oportunidadeCielo === true, undefined],
    ['Fez Crédito?', opportunities?.oportunidadeCredito === true, undefined],
    ['Fez Negócio?', opportunities?.oportunidadeNegocio === true, undefined],
    ['Ativo PADE?', opportunities?.oportunidadeAtivoPade === true, undefined],
    ['Tem Proposta de Valor?', opportunities?.oportunidadePropostaValor === true, undefined],
  ] as const;
  const statusGap = 5;
  const statusWidth = (width - 32 - statusGap * (statuses.length - 1)) / statuses.length;
  statuses.forEach(([label, active, value], index) => {
    drawStatusCard(
      page,
      fonts,
      x + 16 + index * (statusWidth + statusGap),
      top - 149,
      statusWidth,
      label,
      active,
      value
    );
  });

  page.drawText('COMPOSIÇÃO DAS TRANSAÇÕES DE NEGÓCIO', {
    x: x + 16,
    y: top - 161,
    size: 6.1,
    font: fonts.bold,
    color: COLORS.ink,
  });
  const productionCaption = 'Vida/Micro: 3 = 1';
  page.drawText(productionCaption.toUpperCase(), {
    x: x + width - 16 - fonts.regular.widthOfTextAtSize(productionCaption.toUpperCase(), 5.4),
    y: top - 161,
    size: 5.4,
    font: fonts.regular,
    color: COLORS.muted,
  });
  drawProductGrid(
    page,
    fonts,
    buildProductComparisonRows(productionPair),
    x + 16,
    top - 168,
    width - 32,
    formatPeriodShort(productionPair?.previous?.periodo),
    formatPeriodShort(productionPair?.current?.periodo, 'ATUAL')
  );

  const contentWidth = width - 32;
  const sectionGap = 7;
  const halfWidth = (contentWidth - sectionGap) / 2;
  const leftX = x + 16;
  const rightX = leftX + halfWidth + sectionGap;

  page.drawLine({
    start: { x: leftX, y: bottom + 40 },
    end: { x: x + width - 16, y: bottom + 40 },
    thickness: 0.6,
    color: COLORS.line,
  });

  const noteBottom = bottom + 5;
  const noteHeight = 30;

  page.drawText('FOCO COMERCIAL', {
    x: leftX,
    y: bottom + 32,
    size: 5.5,
    font: fonts.bold,
    color: COLORS.muted,
  });
  page.drawText(truncateToWidth(stop.produtoFoco || 'Relacionamento', fonts.bold, 7.5, halfWidth), {
    x: leftX,
    y: bottom + 22,
    size: 7.5,
    font: fonts.bold,
    color: COLORS.brand,
  });
  page.drawText('PRÓXIMA AÇÃO', {
    x: leftX,
    y: bottom + 13,
    size: 5.5,
    font: fonts.bold,
    color: COLORS.muted,
  });
  page.drawText(truncateToWidth(stop.proximaAcao || 'Conduzir visita comercial', fonts.regular, 7, halfWidth), {
    x: leftX,
    y: bottom + 4,
    size: 7,
    font: fonts.regular,
    color: COLORS.ink,
  });

  page.drawRectangle({
    x: rightX,
    y: noteBottom,
    width: halfWidth,
    height: noteHeight,
    color: COLORS.surfaceSoft,
    borderColor: COLORS.line,
    borderWidth: 0.6,
  });
  page.drawText('OBSERVAÇÃO', {
    x: rightX + 6,
    y: noteBottom + noteHeight - 9,
    size: 5.5,
    font: fonts.bold,
    color: COLORS.muted,
  });
  for (const lineOffset of [12, 21]) {
    page.drawLine({
      start: { x: rightX + 6, y: noteBottom + noteHeight - lineOffset },
      end: { x: rightX + halfWidth - 6, y: noteBottom + noteHeight - lineOffset },
      thickness: 0.4,
      color: COLORS.line,
    });
  }
}

export async function buildRoutePdf(
  route: VisitRoute,
  productionByStore: RoutePdfProductionByStore,
  generatedAt = new Date()
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Roteiro de visitas - ${pdfText(route.nome)}`);
  pdf.setSubject('Planejamento profissional de visita comercial');
  pdf.setAuthor('Mapa Comercial');
  pdf.setCreator('Mapa Comercial');
  pdf.setCreationDate(generatedAt);
  const fonts: PdfFonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
  const orderedStops = [...route.stops].sort((a, b) => a.ordem - b.ordem);
  const totalPages = 1 + Math.ceil(orderedStops.length / 2);

  const cover = pdf.addPage(PageSizes.A4);
  drawCoverHeader(cover, fonts, route);
  drawRouteLine(cover, fonts, route);
  drawCoverMetrics(cover, fonts, route);
  drawCoverSnapshot(cover, fonts, route);
  drawCoverAgenda(cover, fonts, route);
  drawPageChrome(cover, fonts, route, 1, totalPages, generatedAt);

  for (let index = 0; index < orderedStops.length; index += 2) {
    const page = pdf.addPage(PageSizes.A4);
    const stops = orderedStops.slice(index, index + 2);
    drawDetailHeader(page, fonts, route, index + 1, index + stops.length);
    stops.forEach((stop, cardIndex) => {
      drawStoreCard(page, fonts, stop, storeProduction(stop, productionByStore), cardIndex === 0 ? 724 : 386);
    });
    drawPageChrome(page, fonts, route, 2 + Math.floor(index / 2), totalPages, generatedAt);
  }

  return pdf.save();
}

export function routePdfFilename(route: VisitRoute): string {
  const destination = pdfText(
    route.destination?.nome || route.stops.at(-1)?.nome || route.nome,
    'Destino'
  )
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 60)
    .trim() || 'Destino';

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(route.plannedDate ?? '');
  const displayDate = /^(\d{1,2})\/(\d{1,2})/.exec(route.data ?? '');
  const today = new Date();
  const date = isoDate
    ? `${isoDate[3]}.${isoDate[2]}`
    : displayDate
      ? `${displayDate[1].padStart(2, '0')}.${displayDate[2].padStart(2, '0')}`
      : `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}`;

  return `Roteiro ${destination} - ${date}.pdf`;
}
