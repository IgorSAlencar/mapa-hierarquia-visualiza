export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  label?: string;
}

interface BridgeResponse {
  type?: unknown;
  requestId?: unknown;
  ok?: unknown;
  coordinates?: {
    latitude?: unknown;
    longitude?: unknown;
    accuracy?: unknown;
  };
  error?: unknown;
}

const DEFAULT_BRIDGE_URL = 'https://mapa-localizacao.stevegamer140.workers.dev/';
const BRIDGE_URL = String(
  import.meta.env.VITE_GEOLOCATION_BRIDGE_URL ?? DEFAULT_BRIDGE_URL
).trim();

function validateCoordinates(value: BridgeResponse['coordinates']): DeviceLocation | null {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  const accuracy = Number(value?.accuracy);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return {
    latitude,
    longitude,
    accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : 0,
  };
}

function requestNativeLocation(): Promise<DeviceLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização indisponível neste dispositivo.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
      }),
      (error) => reject(new Error(error.message || 'A localização não foi autorizada.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 }
    );
  });
}

function createRequestId(): string {
  const values = new Uint32Array(4);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(values);
    return [...values].map((value) => value.toString(16).padStart(8, '0')).join('-');
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Em HTTPS/localhost usa a API nativa. Em HTTP por IP, abre a ponte HTTPS e
 * aceita somente a resposta da janela, origem e solicitação esperadas.
 */
export function requestDeviceLocation(): Promise<DeviceLocation> {
  if (window.isSecureContext) return requestNativeLocation();

  return new Promise((resolve, reject) => {
    let bridgeUrl: URL;
    try {
      bridgeUrl = new URL(BRIDGE_URL);
    } catch {
      reject(new Error('A ponte HTTPS de localização não foi configurada corretamente.'));
      return;
    }

    const bridgeOrigin = bridgeUrl.origin;
    const requestId = createRequestId();
    bridgeUrl.searchParams.set('origin', window.location.origin);
    bridgeUrl.searchParams.set('requestId', requestId);

    // Precisa acontecer diretamente no clique para não ser bloqueado como popup.
    const popup = window.open(
      bridgeUrl.toString(),
      'device-geolocation',
      'popup=yes,width=420,height=520'
    );
    if (!popup) {
      reject(new Error('O navegador bloqueou a janela de localização.'));
      return;
    }

    let settled = false;
    let timeout = 0;
    let closedWatcher = 0;

    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearTimeout(timeout);
      window.clearInterval(closedWatcher);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };
    const onMessage = (event: MessageEvent<BridgeResponse>) => {
      if (event.origin !== bridgeOrigin || event.source !== popup) return;
      const data = event.data;
      if (data?.type !== 'device-location' || data.requestId !== requestId) return;
      if (data.ok !== true) {
        fail(typeof data.error === 'string' ? data.error : 'A localização não foi autorizada.');
        return;
      }
      const coordinates = validateCoordinates(data.coordinates);
      if (!coordinates) {
        fail('A ponte retornou coordenadas inválidas.');
        return;
      }
      settled = true;
      cleanup();
      resolve(coordinates);
    };

    window.addEventListener('message', onMessage);
    closedWatcher = window.setInterval(() => {
      if (popup.closed) fail('A janela de localização foi fechada.');
    }, 500);
    timeout = window.setTimeout(() => {
      popup.close();
      fail('A solicitação de localização expirou.');
    }, 30_000);
  });
}
