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
import type { StoreProductionPoint } from './mapDataApi';

export type RoutePdfProductionByStore = Record<string, StoreProductionPoint | null>;

interface PdfFonts {
  regular: PDFFont;
  bold: PDFFont;
}

interface BusinessProduct {
  label: string;
  quantity: number;
  value?: number;
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

function currentProduction(
  stop: VisitStop,
  productionByStore: RoutePdfProductionByStore
): StoreProductionPoint | null {
  const key = String(stop.chaveLoja ?? '').trim();
  return key ? productionByStore[key] ?? null : null;
}

function businessProducts(production: StoreProductionPoint | null): BusinessProduct[] {
  return [
    { label: 'Contas', quantity: clampNumber(production?.qtdContas) },
    { label: 'Consignado', quantity: clampNumber(production?.qtdConsig), value: clampNumber(production?.vlrConsig) },
    { label: 'LIME', quantity: clampNumber(production?.qtdLime), value: clampNumber(production?.vlrLime) },
    { label: 'Crédito parcelado', quantity: clampNumber(production?.qtdCreditoParcelado), value: clampNumber(production?.vlrCreditoParcelado) },
    { label: 'Cartões', quantity: clampNumber(production?.qtdCartao) },
    { label: 'FGTS', quantity: clampNumber(production?.qtdFgts) },
    { label: 'Vida', quantity: clampNumber(production?.qtdVida) },
    { label: 'Microsseguros', quantity: clampNumber(production?.qtdMicro) },
    { label: 'Residencial', quantity: clampNumber(production?.qtdResidencial) },
    { label: 'Dental', quantity: clampNumber(production?.qtdDental) },
    { label: 'Super Protegido', quantity: clampNumber(production?.qtdSuper) },
    { label: 'Seguro débito', quantity: clampNumber(production?.qtdSegDebito) },
    { label: 'Consórcio', quantity: clampNumber(production?.qtdConsorcio) },
    { label: 'Expresso da Sorte', quantity: clampNumber(production?.qtdExpSorte) },
  ];
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
    start: { x: MARGIN, y: 34 },
    end: { x: A4_WIDTH - MARGIN, y: 34 },
    thickness: 0.6,
    color: COLORS.line,
  });
  page.drawText(truncateToWidth(route.nome, fonts.regular, 7.5, 250), {
    x: MARGIN,
    y: 20,
    size: 7.5,
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
    : `Supervisão ${String(route.chaveSupervisao).padStart(3, '0')}`;
  page.drawText(truncateToWidth(supervision, fonts.regular, 8.5, 250), {
    x: MARGIN + 18,
    y: 649,
    size: 8.5,
    font: fonts.regular,
    color: COLORS.slate,
  });
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
    ['Cielo M0', route.stops.filter((stop) => stop.oportunidades?.oportunidadeCielo).length],
    ['Proposta de valor', route.stops.filter((stop) => stop.oportunidades?.oportunidadePropostaValor).length],
    ['Ativo PADE', route.stops.filter((stop) => stop.oportunidades?.oportunidadeAtivoPade).length],
    ['Com negócio M0', route.stops.filter((stop) => stop.oportunidades?.oportunidadeNegocio).length],
  ] as const;
  page.drawText('PANORAMA COMERCIAL', { x: MARGIN, y: 457, size: 8, font: fonts.bold, color: COLORS.ink });
  const width = (A4_WIDTH - MARGIN * 2) / totals.length;
  totals.forEach(([label, total], index) => {
    const x = MARGIN + width * index;
    if (index > 0) {
      page.drawLine({ start: { x, y: 417 }, end: { x, y: 450 }, thickness: 0.7, color: COLORS.line });
    }
    page.drawText(`${total}/${route.stops.length}`, {
      x: x + 10,
      y: 430,
      size: 13,
      font: fonts.bold,
      color: total > 0 ? COLORS.green : COLORS.slate,
    });
    page.drawText(truncateToWidth(label.toUpperCase(), fonts.bold, 6.2, width - 20), {
      x: x + 10,
      y: 417,
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
  active: boolean
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
  page.drawText(active ? 'SIM' : 'NÃO', {
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

function drawProductGrid(
  page: PDFPage,
  fonts: PdfFonts,
  products: BusinessProduct[],
  x: number,
  y: number,
  width: number
): void {
  const gap = 7;
  const cellWidth = (width - gap) / 2;
  products.forEach((product, index) => {
    const active = clampNumber(product.quantity) > 0;
    const column = index % 2;
    const row = Math.floor(index / 2);
    const cellX = x + column * (cellWidth + gap);
    const cellY = y - row * 16 - 15;
    page.drawRectangle({
      x: cellX,
      y: cellY,
      width: cellWidth,
      height: 15,
      color: active ? COLORS.surfaceBlue : COLORS.surfaceSoft,
      borderColor: active ? color('#CDE1EF') : COLORS.line,
      borderWidth: 0.35,
    });
    page.drawRectangle({
      x: cellX,
      y: cellY,
      width: 2,
      height: 15,
      color: active ? COLORS.blue : COLORS.line,
    });
    const detail = product.value && product.value > 0
      ? `${formatQuantity(product.quantity)} | ${formatCurrencyCompact(product.value)}`
      : `QTD ${formatQuantity(product.quantity)}`;
    const detailFont = active ? fonts.bold : fonts.regular;
    const detailSize = 5.8;
    const detailWidth = detailFont.widthOfTextAtSize(detail, detailSize);
    page.drawText(truncateToWidth(product.label, active ? fonts.bold : fonts.regular, 5.9, cellWidth - detailWidth - 20), {
      x: cellX + 7,
      y: cellY + 5.2,
      size: 5.9,
      font: active ? fonts.bold : fonts.regular,
      color: active ? COLORS.ink : COLORS.muted,
    });
    page.drawText(detail, {
      x: cellX + cellWidth - detailWidth - 7,
      y: cellY + 5.2,
      size: detailSize,
      font: detailFont,
      color: active ? COLORS.blueDark : COLORS.inactiveIcon,
    });
  });
}

function drawStoreCard(
  page: PDFPage,
  fonts: PdfFonts,
  stop: VisitStop,
  production: StoreProductionPoint | null,
  top: number
): void {
  const x = MARGIN;
  const width = A4_WIDTH - MARGIN * 2;
  const height = 322;
  const bottom = top - height;
  page.drawRectangle({ x, y: bottom, width, height, color: COLORS.white, borderColor: COLORS.line, borderWidth: 0.8 });
  page.drawRectangle({ x: x + 0.8, y: top - 66, width: width - 1.6, height: 65.2, color: COLORS.surfaceSoft });
  page.drawRectangle({ x: x + 0.8, y: top - 66, width: 3.2, height: 65.2, color: COLORS.brand });

  page.drawCircle({ x: x + 24, y: top - 29, size: 14, color: COLORS.brand });
  const order = String(stop.ordem);
  page.drawText(order, {
    x: x + 24 - fonts.bold.widthOfTextAtSize(order, 9) / 2,
    y: top - 32,
    size: 9,
    font: fonts.bold,
    color: COLORS.white,
  });
  page.drawText(truncateToWidth(stop.nome, fonts.bold, 12, 330), {
    x: x + 48,
    y: top - 25,
    size: 12,
    font: fonts.bold,
    color: COLORS.ink,
  });
  const storeIdentity = [
    stop.chaveLoja ? `Loja ${stop.chaveLoja}` : null,
    stop.codAg ? `AG ${stop.codAg}` : null,
    stop.horario,
  ].filter(Boolean).join(' | ');
  page.drawText(truncateToWidth(storeIdentity, fonts.regular, 7.5, 330), {
    x: x + 48,
    y: top - 40,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.slate,
  });
  page.drawText(formatPeriod(production?.periodo), {
    x: x + width - 74,
    y: top - 29,
    size: 8,
    font: fonts.bold,
    color: COLORS.brand,
  });
  page.drawText('REFERÊNCIA', {
    x: x + width - 74,
    y: top - 41,
    size: 5.5,
    font: fonts.bold,
    color: COLORS.muted,
  });

  page.drawText(truncateToWidth(stop.endereco || stop.cep || 'Endereço não informado', fonts.regular, 7.2, width - 32), {
    x: x + 16,
    y: top - 61,
    size: 7.2,
    font: fonts.regular,
    color: COLORS.slate,
  });

  const metricY = top - 111;
  const metricGap = 7;
  const metricWidth = (width - 32 - metricGap * 3) / 4;
  drawStoreMetric(page, fonts, x + 16, metricY, metricWidth, 'QTD TRX contábil', formatQuantity(production?.qtdTrxContabil), true);
  drawStoreMetric(page, fonts, x + 16 + (metricWidth + metricGap), metricY, metricWidth, 'QTD TRX negócio', formatQuantity(production?.qtdTrxNegocio), true);
  drawStoreMetric(page, fonts, x + 16 + (metricWidth + metricGap) * 2, metricY, metricWidth, 'Crédito M0', formatQuantity(production?.qtdCred));
  drawStoreMetric(page, fonts, x + 16 + (metricWidth + metricGap) * 3, metricY, metricWidth, 'Fat. Cielo', formatCurrency(production?.vlrFatCielo));

  const opportunities = stop.oportunidades;
  const statuses = [
    ['Cielo', opportunities?.oportunidadeCielo === true],
    ['Crédito', opportunities?.oportunidadeCredito === true],
    ['Negócio', opportunities?.oportunidadeNegocio === true],
    ['Ativo PADE', opportunities?.oportunidadeAtivoPade === true],
    ['Proposta de valor', opportunities?.oportunidadePropostaValor === true],
  ] as const;
  const statusGap = 5;
  const statusWidth = (width - 32 - statusGap * (statuses.length - 1)) / statuses.length;
  statuses.forEach(([label, active], index) => {
    drawStatusCard(
      page,
      fonts,
      x + 16 + index * (statusWidth + statusGap),
      top - 149,
      statusWidth,
      label,
      active
    );
  });

  page.drawText('COMPOSIÇÃO DAS TRANSAÇÕES DE NEGÓCIO', {
    x: x + 16,
    y: top - 164,
    size: 6.1,
    font: fonts.bold,
    color: COLORS.ink,
  });
  const productionCaption = 'produção do período | Vida/Micro: 3 = 1';
  page.drawText(productionCaption.toUpperCase(), {
    x: x + width - 16 - fonts.regular.widthOfTextAtSize(productionCaption.toUpperCase(), 5.4),
    y: top - 164,
    size: 5.4,
    font: fonts.regular,
    color: COLORS.muted,
  });
  drawProductGrid(page, fonts, businessProducts(production), x + 16, top - 171, width - 32);

  page.drawLine({
    start: { x: x + 16, y: bottom + 31 },
    end: { x: x + width - 16, y: bottom + 31 },
    thickness: 0.6,
    color: COLORS.line,
  });
  page.drawText('FOCO COMERCIAL', { x: x + 16, y: bottom + 18, size: 5.8, font: fonts.bold, color: COLORS.muted });
  page.drawText(truncateToWidth(stop.produtoFoco || 'Relacionamento', fonts.bold, 8, 195), {
    x: x + 16,
    y: bottom + 5,
    size: 8,
    font: fonts.bold,
    color: COLORS.brand,
  });
  page.drawText('PRÓXIMA AÇÃO', { x: x + 250, y: bottom + 18, size: 5.8, font: fonts.bold, color: COLORS.muted });
  page.drawText(truncateToWidth(stop.proximaAcao || 'Conduzir visita comercial', fonts.regular, 7.5, width - 266), {
    x: x + 250,
    y: bottom + 5,
    size: 7.5,
    font: fonts.regular,
    color: COLORS.ink,
  });
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
      drawStoreCard(page, fonts, stop, currentProduction(stop, productionByStore), cardIndex === 0 ? 724 : 386);
    });
    drawPageChrome(page, fonts, route, 2 + Math.floor(index / 2), totalPages, generatedAt);
  }

  return pdf.save();
}

export function routePdfFilename(route: VisitRoute): string {
  const date = pdfText(route.plannedDate || new Date().toISOString().slice(0, 10), 'roteiro');
  const name = pdfText(route.nome, 'roteiro-comercial')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return `${name || 'roteiro-comercial'}-${date}.pdf`;
}
