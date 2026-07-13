import React from 'react';
import { X } from 'lucide-react';
import type { AgencyPopupInfo } from '@/components/AgencyInfoPopup';

type MapOverlayMarkerInfoPanelProps = {
  storeFilterCodAg: string | null;
  storeFilterAgencyName: string | null;
  overlayMarkerSelection: AgencyPopupInfo | null;
  storeCountOnMap: number;
  overlayLojasActive: boolean;
  onDismiss: () => void;
};

const MapOverlayMarkerInfoPanel: React.FC<MapOverlayMarkerInfoPanelProps> = ({
  storeFilterCodAg,
  storeFilterAgencyName,
  overlayMarkerSelection,
  storeCountOnMap,
  overlayLojasActive,
  onDismiss,
}) => {
  if (!storeFilterCodAg && !overlayMarkerSelection) {
    return null;
  }

  const kindLabel =
    overlayMarkerSelection?.kind === 'loja'
      ? 'Loja'
      : overlayMarkerSelection?.kind === 'agencia'
        ? 'Agência'
        : overlayMarkerSelection?.sub?.trim() || 'Estrutura comercial';

  return (
    <div
      className="mt-2 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-md shadow-slate-900/5 backdrop-blur-sm"
      role="region"
      aria-label="Detalhes do ponto selecionado no mapa"
    >
      {storeFilterCodAg ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-800">
              Agência selecionada
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">
              {storeFilterCodAg} - {storeFilterAgencyName ?? 'Agência'}
            </p>
            {overlayMarkerSelection?.enderecoFormatado ? (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {overlayMarkerSelection.enderecoFormatado}
              </p>
            ) : null}
            {overlayLojasActive && storeCountOnMap > 0 ? (
              <p className="mt-1.5 text-xs text-slate-500">
                {storeCountOnMap.toLocaleString('pt-BR')} loja(s) vinculada(s) visível(is)
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Limpar filtro por agência"
            title="Limpar filtro por agência"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : overlayMarkerSelection ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {kindLabel}
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">
              {overlayMarkerSelection.nome.trim() ||
                overlayMarkerSelection.sub.trim() ||
                'Ponto no mapa'}
            </p>
            {overlayMarkerSelection.codAg ? (
              <p className="mt-0.5 text-xs font-medium text-slate-600">
                Código: {overlayMarkerSelection.codAg}
              </p>
            ) : null}
            {overlayMarkerSelection.sub.trim() &&
            overlayMarkerSelection.sub.trim() !== overlayMarkerSelection.nome.trim() ? (
              <p className="mt-0.5 text-xs text-slate-500">{overlayMarkerSelection.sub}</p>
            ) : null}
            {overlayMarkerSelection.enderecoFormatado ? (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {overlayMarkerSelection.enderecoFormatado}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label={storeFilterCodAg ? 'Limpar filtro por agência' : 'Limpar filtro do Gerente Comercial'}
            title={storeFilterCodAg ? 'Limpar filtro por agência' : 'Limpar filtro do Gerente Comercial'}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default MapOverlayMarkerInfoPanel;
