import React from 'react';
import { Building2, Store, X } from 'lucide-react';
import type { AgencyPopupInfo } from '@/components/AgencyInfoPopup';
import StoreProductionChart from '@/components/StoreProductionChart';
import type { StorePopupInfo } from '@/components/StoreInfoPopup';

type MapOverlayMarkerInfoPanelProps = {
  storeFilterCodAg: string | null;
  storeFilterAgencyName: string | null;
  overlayMarkerSelection: AgencyPopupInfo | StorePopupInfo | null;
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

  const storeSelection =
    overlayMarkerSelection?.kind === 'loja' && 'chaveLoja' in overlayMarkerSelection
      ? overlayMarkerSelection
      : null;
  const agencySelection =
    overlayMarkerSelection && 'sub' in overlayMarkerSelection ? overlayMarkerSelection : null;

  const kindLabel =
    agencySelection?.kind === 'agencia'
        ? 'Agência'
        : agencySelection?.sub?.trim() || 'Estrutura comercial';

  if (storeSelection) {
    return (
      <div
        className="mt-2 rounded-xl border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/5 backdrop-blur-sm"
        role="region"
        aria-label={`Produção da loja ${storeSelection.nome}`}
      >
        <div className="flex items-start gap-3 p-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
            <Store className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
              Loja selecionada
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold leading-snug text-slate-900">
              {storeSelection.nome.trim() || 'Loja'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
              <span>
                <span className="text-slate-400">Chave</span>{' '}
                <strong className="font-semibold text-slate-700">
                  {storeSelection.chaveLoja || 'Não informada'}
                </strong>
              </span>
              {storeSelection.codAg ? (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-400" aria-hidden />
                  Agência {storeSelection.codAg}
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Fechar informações da loja"
            title="Fechar informações da loja"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {storeSelection.chaveLoja ? (
          <StoreProductionChart
            chaveLoja={storeSelection.chaveLoja}
            cieloM0={storeSelection.cieloM0}
            propostaValor={storeSelection.propostaValor}
          />
        ) : (
          <div className="border-t border-slate-100 px-3 py-4 text-xs text-slate-500">
            A chave da loja não foi informada; não é possível consultar a produção.
          </div>
        )}
      </div>
    );
  }

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
            {agencySelection?.enderecoFormatado ? (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {agencySelection.enderecoFormatado}
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
      ) : agencySelection ? (
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {kindLabel}
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug text-slate-900">
              {agencySelection.nome.trim() ||
                agencySelection.sub.trim() ||
                'Ponto no mapa'}
            </p>
            {agencySelection.codAg ? (
              <p className="mt-0.5 text-xs font-medium text-slate-600">
                Código: {agencySelection.codAg}
              </p>
            ) : null}
            {agencySelection.sub.trim() &&
            agencySelection.sub.trim() !== agencySelection.nome.trim() ? (
              <p className="mt-0.5 text-xs text-slate-500">{agencySelection.sub}</p>
            ) : null}
            {agencySelection.enderecoFormatado ? (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                {agencySelection.enderecoFormatado}
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
