import { useMemo, useState } from 'react';
import { Check, Copy, ExternalLink, MapPin, QrCode, Route as RouteIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { VisitRoute } from '@/data/visitRoutesMock';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { buildGoogleMapsRouteLink } from '@/lib/googleMapsRouteUrl';

interface Props {
  route: VisitRoute;
}

const RouteQrCodeDialog: React.FC<Props> = ({ route }) => {
  const [copied, setCopied] = useState(false);
  const routeLink = useMemo(() => buildGoogleMapsRouteLink(route), [route]);

  const copyLink = async () => {
    if (!routeLink) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(routeLink.url);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = routeLink.url;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        const copiedWithFallback = document.execCommand('copy');
        textArea.remove();
        if (!copiedWithFallback) throw new Error('NÃ£o foi possÃ­vel copiar o link');
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = routeLink.url;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      const copiedWithFallback = document.execCommand('copy');
      textArea.remove();
      setCopied(copiedWithFallback);
      if (copiedWithFallback) window.setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!routeLink}
          className="flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-semibold text-blue-700 transition-colors hover:border-blue-300 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-45"
          aria-label="Gerar QR Code do roteiro para o Google Maps"
          title={routeLink ? 'Levar roteiro completo para o Google Maps' : 'O roteiro precisa ter pelo menos dois pontos'}
        >
          <QrCode className="h-4 w-4" aria-hidden />
          QR Code
        </button>
      </DialogTrigger>

      {routeLink && (
        <DialogContent className="w-[min(94vw,430px)] gap-4 overflow-hidden rounded-2xl border-slate-200 bg-white p-5 font-sans text-slate-700 shadow-2xl sm:rounded-2xl">
          <DialogHeader className="pr-7 text-left">
            <DialogTitle className="flex items-center gap-2 text-base text-slate-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <QrCode className="h-4 w-4" aria-hidden />
              </span>
              Roteiro no Google Maps
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-slate-500">
              Escaneie com a câmera do celular para abrir a rota na ordem planejada.
            </DialogDescription>
          </DialogHeader>

          <div className="mx-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-lg shadow-slate-900/10">
            <QRCodeSVG
              value={routeLink.url}
              size={220}
              level="M"
              marginSize={2}
              title="QR Code do roteiro no Google Maps"
            />
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
            <RouteSummaryItem icon={<MapPin className="h-3.5 w-3.5" />} label="Origem" value={route.origin?.nome ?? route.stops[0]?.nome ?? 'Início'} />
            <RouteSummaryItem icon={<RouteIcon className="h-3.5 w-3.5" />} label="Visitas" value={String(route.stops.length)} />
            <RouteSummaryItem icon={<MapPin className="h-3.5 w-3.5" />} label="Destino" value={route.destination?.nome ?? route.stops[route.stops.length - 1]?.nome ?? 'Fim'} />
          </div>

          {routeLink.mobileWaypointLimitExceeded && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-800">
              Este roteiro possui {routeLink.intermediateStopCount} paradas intermediárias. Em navegadores móveis, o Google Maps pode limitar a rota a 3 paradas intermediárias{routeLink.generalWaypointLimitExceeded ? '; em outros dispositivos, o limite documentado é 9' : ''}.
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Link copiado' : 'Copiar link'}
            </button>
            <a
              href={routeLink.url}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-700 to-sky-600 px-3 text-xs font-semibold text-white shadow-md shadow-blue-200 transition hover:from-blue-800 hover:to-sky-700"
            >
              Abrir no Maps
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
};

function RouteSummaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg bg-white text-blue-700 shadow-sm">
        {icon}
      </span>
      <p className="mt-1 text-[8px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-[10px] font-bold text-slate-800" title={value}>{value}</p>
    </div>
  );
}

export default RouteQrCodeDialog;
