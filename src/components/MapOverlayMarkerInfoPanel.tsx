import React, { useEffect, useState } from 'react';
import { Building2, Mail, MapPin, Maximize2, Minus, Network, Store, UserRound, X } from 'lucide-react';
import type { AgencyPopupInfo } from '@/components/AgencyInfoPopup';
import StoreProductionChart from '@/components/StoreProductionChart';
import type { StorePopupInfo } from '@/components/StoreInfoPopup';
import {
  fetchAgencyDetail,
  fetchCommercialSeatDetail,
  type AgencyDetail,
  type CommercialSeatDetail,
} from '@/lib/mapDataApi';

const COMMERCIAL_LEVEL_LABEL = {
  supervisor: 'Gerente Comercial',
  coordenador: 'Gerente Comercial III',
  gerente_area: 'Gerente de Gestão',
} as const;

function CommercialSeatInfoCard({
  selection,
  onDismiss,
}: {
  selection: AgencyPopupInfo;
  onDismiss: () => void;
}) {
  const [detail, setDetail] = useState<CommercialSeatDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    setMinimized(false);
    if (!selection.commercialLevel || !selection.chaveEntidade) {
      setDetail(null);
      setError('Identificação da estrutura comercial não informada.');
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setDetail(null);
    fetchCommercialSeatDetail(selection.commercialLevel, selection.chaveEntidade, controller.signal)
      .then(setDetail)
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar os detalhes do responsável.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selection.chaveEntidade, selection.commercialLevel]);

  const levelLabel = selection.commercialLevel
    ? COMMERCIAL_LEVEL_LABEL[selection.commercialLevel]
    : selection.sub || 'Estrutura comercial';
  const fullName = detail?.personName || selection.personName || selection.warName || 'Nome não informado';
  const warName = detail?.warName || selection.warName;
  const email = detail?.email || selection.email;
  const entityName = detail?.entidadeNome || selection.nome || 'Estrutura não informada';
  const hierarchyRows = [
    detail?.superiorDescription
      ? {
          level: detail.superiorLevel || 'Hierarquia superior',
          description: detail.superiorDescription,
          person: detail.superiorWarName || detail.superiorPersonName,
        }
      : null,
    detail?.upperSuperiorDescription
      ? {
          level: detail.upperSuperiorLevel || 'Nível superior seguinte',
          description: detail.upperSuperiorDescription,
          person: detail.upperSuperiorWarName || detail.upperSuperiorPersonName,
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => Boolean(row));

  return (
    <section
      className="mt-2 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/5 backdrop-blur-sm"
      role="region"
      aria-label={`Detalhes de ${fullName}`}
    >
      <div className="bg-white p-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#cc092f] text-white shadow-md shadow-rose-200">
            <UserRound className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#a8072a]">
              {levelLabel}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold leading-snug text-slate-900" title={fullName}>
              {fullName}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
              {warName && warName !== fullName ? (
                <span className="max-w-full truncate rounded-full border border-rose-100 bg-rose-50 px-2 py-0.5 text-[9px] font-medium text-[#a8072a]" title={warName}>
                  {warName}
                </span>
              ) : null}
              <span className="min-w-0 truncate text-[10px] text-slate-500" title={entityName}>
                {entityName}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setMinimized((current) => !current)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-[#a8072a]"
              aria-label={minimized ? 'Restaurar detalhes do responsável comercial' : 'Minimizar detalhes do responsável comercial'}
              title={minimized ? 'Restaurar card' : 'Minimizar card'}
            >
              {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-[#a8072a]"
              aria-label="Fechar detalhes do responsável comercial"
              title="Fechar detalhes"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {!minimized ? (
        <>
          <div className="space-y-2 border-t border-slate-100 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2 text-[10px] text-slate-600">
              <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
              <span className="truncate" title={email || 'E-mail não informado'}>
                {email || 'E-mail não informado'}
              </span>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-2">
              {hierarchyRows.length > 0 ? (
                <div className="space-y-2">
                  {hierarchyRows.map((row, index) => (
                    <div key={`${row.level}-${row.description}`} className="relative flex items-start gap-2">
                      <span className="relative z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-rose-50 text-[#cc092f]">
                        <Network className="h-2.5 w-2.5" aria-hidden />
                      </span>
                      {index < hierarchyRows.length - 1 ? (
                        <span className="absolute left-[7px] top-4 h-[calc(100%+0.5rem)] w-px bg-rose-200" aria-hidden />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-[8px] font-semibold uppercase tracking-wide text-slate-400">
                          {row.level}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] font-medium text-slate-700" title={row.description}>
                          {row.description}
                        </p>
                        {row.person ? (
                          <p className="mt-0.5 truncate text-[9px] text-slate-500" title={row.person}>
                            {row.person}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[10px] text-slate-500">
                  <Network className="h-3.5 w-3.5 shrink-0 text-[#cc092f]" aria-hidden />
                  <span>{loading ? 'Carregando hierarquia...' : 'Topo da estrutura comercial'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/40">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-[#a8072a]">
                <Building2 className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <strong className="block text-sm font-semibold tabular-nums text-slate-900">
                  {loading ? '—' : (detail?.agencyCount ?? 0).toLocaleString('pt-BR')}
                </strong>
                <span className="block text-[8px] uppercase tracking-wide text-slate-400">Agências</span>
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Store className="h-4 w-4" aria-hidden />
              </span>
              <span>
                <strong className="block text-sm font-semibold tabular-nums text-slate-900">
                  {loading ? '—' : (detail?.storeCount ?? 0).toLocaleString('pt-BR')}
                </strong>
                <span className="block text-[8px] uppercase tracking-wide text-slate-400">Lojas</span>
              </span>
            </div>
          </div>

          {loading ? <div className="h-0.5 animate-pulse bg-[#cc092f]" aria-label="Carregando detalhes" /> : null}
          {error ? <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-[9px] text-red-600">{error}</p> : null}
        </>
      ) : null}
    </section>
  );
}

function AgencySelectedInfoCard({
  codAg,
  agencyName,
  address,
  visibleStoreCount,
  storesVisible,
  onDismiss,
}: {
  codAg: string;
  agencyName: string | null;
  address: string | null;
  visibleStoreCount: number;
  storesVisible: boolean;
  onDismiss: () => void;
}) {
  const [detail, setDetail] = useState<AgencyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setMinimized(false);
    setLoading(true);
    setError(null);
    setDetail(null);
    fetchAgencyDetail(codAg, controller.signal)
      .then(setDetail)
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar a hierarquia da agência.'
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [codAg]);

  const displayName = detail?.agencyName || agencyName || 'Agência';

  return (
    <section
      className="mt-2 overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-md shadow-slate-900/5 backdrop-blur-sm"
      role="region"
      aria-label={`Detalhes da agência ${codAg} - ${displayName}`}
    >
      <div className="flex items-start gap-3 p-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#cc092f] text-white shadow-sm shadow-rose-200">
          <Building2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[#a8072a]">
            Agência selecionada
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold leading-snug text-slate-900" title={`${codAg} - ${displayName}`}>
            {codAg} - {displayName}
          </p>
          {!minimized && address ? (
            <p className="mt-1 flex min-w-0 items-start gap-1 text-[10px] leading-snug text-slate-500">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden />
              <span className="line-clamp-2" title={address}>{address}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized((current) => !current)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-[#a8072a]"
            aria-label={minimized ? 'Restaurar detalhes da agência' : 'Minimizar detalhes da agência'}
            title={minimized ? 'Restaurar card' : 'Minimizar card'}
          >
            {minimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-[#a8072a]"
            aria-label="Limpar filtro por agência"
            title="Limpar filtro por agência"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized ? (
        <>
          <div className="border-t border-slate-100 px-3 py-2.5">
            <div className="mb-1.5 flex items-center gap-1.5">
              <Network className="h-3 w-3 text-[#cc092f]" aria-hidden />
              <p className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Atendimento comercial
              </p>
            </div>
            {detail?.hierarchy.length ? (
              <div className="grid grid-cols-3 divide-x divide-slate-100 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/70">
                {detail.hierarchy.map((item, index) => {
                  const person = item.warName || item.personName || 'Não informado';
                  return (
                    <div
                      key={`${item.level}-${item.key ?? index}`}
                      className={index === 0 ? 'min-w-0 bg-rose-50/60 px-2 py-2' : 'min-w-0 px-2 py-2'}
                      title={[item.level, item.description, item.personName].filter(Boolean).join(' • ')}
                    >
                      <p className="truncate text-[7px] font-semibold uppercase tracking-wide text-slate-400">
                        {item.level}
                      </p>
                      <p className={index === 0 ? 'mt-0.5 truncate text-[9px] font-semibold text-[#a8072a]' : 'mt-0.5 truncate text-[9px] font-medium text-slate-700'}>
                        {person}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 px-2.5 py-2 text-[9px] text-slate-500">
                {loading ? 'Carregando responsáveis...' : 'Hierarquia comercial não informada.'}
              </p>
            )}
          </div>

          {storesVisible && visibleStoreCount > 0 ? (
            <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/40 px-3 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <Store className="h-3.5 w-3.5" aria-hidden />
              </span>
              <p className="text-[10px] text-slate-500">
                <strong className="font-semibold tabular-nums text-slate-800">
                  {visibleStoreCount.toLocaleString('pt-BR')}
                </strong>{' '}
                loja(s) vinculada(s) visível(is)
              </p>
            </div>
          ) : null}

          {loading ? <div className="h-0.5 animate-pulse bg-[#cc092f]" aria-label="Carregando detalhes da agência" /> : null}
          {error ? <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-[9px] text-red-600">{error}</p> : null}
        </>
      ) : null}
    </section>
  );
}

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
                  {storeSelection.codAg}
                  {storeSelection.nomeAg ? ` - ${storeSelection.nomeAg}` : ''}
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

  if (agencySelection?.kind === 'supervisor') {
    return <CommercialSeatInfoCard selection={agencySelection} onDismiss={onDismiss} />;
  }

  if (storeFilterCodAg) {
    return (
      <AgencySelectedInfoCard
        codAg={storeFilterCodAg}
        agencyName={storeFilterAgencyName}
        address={agencySelection?.enderecoFormatado || null}
        visibleStoreCount={storeCountOnMap}
        storesVisible={overlayLojasActive}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <div
      className="mt-2 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-md shadow-slate-900/5 backdrop-blur-sm"
      role="region"
      aria-label="Detalhes do ponto selecionado no mapa"
    >
      {agencySelection ? (
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
