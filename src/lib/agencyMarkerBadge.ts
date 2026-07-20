import type mapboxgl from 'mapbox-gl';

export const AGENCY_MARKER_BADGE_IMAGE_ID = 'agency-marker-badge';

const AGENCY_MARKER_BADGE_URL = '/agencia.png';
const BADGE_TEXTURE_SIZE = 64;
const ALPHA_THRESHOLD = 8;

/**
 * O PNG original pode ter margem transparente. O recorte faz o disco visivel
 * ocupar exatamente o mesmo diametro do circle marker desenhado pelo Mapbox.
 */
function createCroppedBadgeImage(image: HTMLImageElement): ImageData {
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.naturalWidth;
  sourceCanvas.height = image.naturalHeight;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('Canvas 2D indisponivel para preparar o badge de agencia.');

  sourceContext.drawImage(image, 0, 0);
  const sourceImage = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const alpha = sourceImage.data[(y * sourceCanvas.width + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error('O badge de agencia nao possui pixels visiveis.');
  }

  const visibleWidth = maxX - minX + 1;
  const visibleHeight = maxY - minY + 1;
  const cropSize = Math.max(visibleWidth, visibleHeight);
  const centerX = (minX + maxX + 1) / 2;
  const centerY = (minY + maxY + 1) / 2;
  const cropX = Math.max(0, Math.min(sourceCanvas.width - cropSize, centerX - cropSize / 2));
  const cropY = Math.max(0, Math.min(sourceCanvas.height - cropSize, centerY - cropSize / 2));

  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = BADGE_TEXTURE_SIZE;
  badgeCanvas.height = BADGE_TEXTURE_SIZE;
  const badgeContext = badgeCanvas.getContext('2d');
  if (!badgeContext) throw new Error('Canvas 2D indisponivel para redimensionar o badge de agencia.');

  badgeContext.drawImage(
    image,
    cropX,
    cropY,
    cropSize,
    cropSize,
    0,
    0,
    BADGE_TEXTURE_SIZE,
    BADGE_TEXTURE_SIZE
  );
  return badgeContext.getImageData(0, 0, BADGE_TEXTURE_SIZE, BADGE_TEXTURE_SIZE);
}

function loadBadgeImageElement(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Falha ao carregar ${AGENCY_MARKER_BADGE_URL}.`));
    image.src = AGENCY_MARKER_BADGE_URL;
  });
}

export async function loadAgencyMarkerBadgeImage(map: mapboxgl.Map): Promise<boolean> {
  try {
    const image = await loadBadgeImageElement();
    const badgeImage = createCroppedBadgeImage(image);
    if (map.hasImage(AGENCY_MARKER_BADGE_IMAGE_ID)) {
      map.removeImage(AGENCY_MARKER_BADGE_IMAGE_ID);
    }
    map.addImage(AGENCY_MARKER_BADGE_IMAGE_ID, badgeImage, { pixelRatio: 1 });
    return true;
  } catch (error) {
    console.warn('Badge de agencia nao carregado; o marker padrao sera mantido:', error);
    return false;
  }
}

/** Mesmo diametro do MARKER_CIRCLE_RADIUS (2 x raio), em uma textura de 64 px. */
export const AGENCY_MARKER_BADGE_ICON_SIZE: mapboxgl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  3,
  8 / BADGE_TEXTURE_SIZE,
  6,
  12 / BADGE_TEXTURE_SIZE,
  10,
  16 / BADGE_TEXTURE_SIZE,
  14,
  22 / BADGE_TEXTURE_SIZE,
];

/** Acompanha o marker de agencia quando ele cresce ao ser selecionado. */
export const AGENCY_MARKER_BADGE_ICON_SIZE_HIGHLIGHT: mapboxgl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['zoom'],
  3,
  12 / BADGE_TEXTURE_SIZE,
  6,
  16 / BADGE_TEXTURE_SIZE,
  10,
  22 / BADGE_TEXTURE_SIZE,
  14,
  28 / BADGE_TEXTURE_SIZE,
];
