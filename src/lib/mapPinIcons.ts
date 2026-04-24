/** Gera PNG em data URL para ícones de alfinete no Mapbox (symbol layers). */

import type { Map } from 'mapbox-gl';

const SIZE = 72;

function roundedPinPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, tipY: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, Math.PI * 1.15, Math.PI * 1.85, true);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
}

function dataUrlFromCanvas(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

export function createAgenciaPinDataUrl(fill = '#b91c1c'): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = SIZE / 2;
  const cy = SIZE * 0.34;
  const r = SIZE * 0.22;
  roundedPinPath(ctx, cx, cy, r, SIZE - 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(SIZE * 0.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AG', cx, cy + 1);
  return dataUrlFromCanvas(canvas);
}

export function createSupervisorPinDataUrl(fill = '#7c3aed'): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = SIZE / 2;
  const cy = SIZE * 0.34;
  const r = SIZE * 0.22;
  roundedPinPath(ctx, cx, cy, r, SIZE - 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // silhueta simples: cabeça + corpo
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.15, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.35, cy + r * 0.55);
  ctx.quadraticCurveTo(cx - r * 0.45, cy + r * 0.15, cx, cy + r * 0.2);
  ctx.quadraticCurveTo(cx + r * 0.45, cy + r * 0.15, cx + r * 0.35, cy + r * 0.55);
  ctx.quadraticCurveTo(cx, cy + r * 0.75, cx - r * 0.35, cy + r * 0.55);
  ctx.fill();
  return dataUrlFromCanvas(canvas);
}

export function createLojaPinDataUrl(fill = '#0d9488'): string {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const cx = SIZE / 2;
  const cy = SIZE * 0.34;
  const r = SIZE * 0.22;
  roundedPinPath(ctx, cx, cy, r, SIZE - 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  // fachada + toldo
  const w = r * 0.9;
  const h = r * 0.55;
  const bx = cx - w / 2;
  const by = cy + r * 0.05;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.moveTo(bx - 2, by);
  ctx.lineTo(cx, by - r * 0.35);
  ctx.lineTo(bx + w + 2, by);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.fillRect(bx + w * 0.35, by + h * 0.25, w * 0.3, h * 0.55);
  return dataUrlFromCanvas(canvas);
}

export const REGION_PIN_IMAGE_IDS = {
  agencia: 'region-pin-agencia',
  supervisor: 'region-pin-supervisor',
  loja: 'region-pin-loja',
} as const;

export function loadRegionPinImages(map: Map): Promise<void> {
  const urls = {
    [REGION_PIN_IMAGE_IDS.agencia]: createAgenciaPinDataUrl(),
    [REGION_PIN_IMAGE_IDS.supervisor]: createSupervisorPinDataUrl(),
    [REGION_PIN_IMAGE_IDS.loja]: createLojaPinDataUrl(),
  };

  const loads = Object.entries(urls).map(
    ([id, url]) =>
      new Promise<void>((resolve, reject) => {
        map.loadImage(url, (err, image) => {
          if (err || !image) {
            reject(err ?? new Error(`Falha ao carregar ícone ${id}`));
            return;
          }
          try {
            if (map.hasImage(id)) map.removeImage(id);
            map.addImage(id, image, { pixelRatio: 2 });
          } catch (e) {
            reject(e);
            return;
          }
          resolve();
        });
      })
  );

  return Promise.all(loads).then(() => undefined);
}
