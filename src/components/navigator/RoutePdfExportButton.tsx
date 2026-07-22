import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { VisitRoute } from '@/data/visitRoutes';
import {
  fetchStoreProductionHistory,
  type StoreProductionPoint,
} from '@/lib/mapDataApi';
import type { RoutePdfProductionByStore } from '@/lib/routePdfExport';
import { fetchSavedRouteExportData } from '@/lib/visitRoutesApi';

interface Props {
  route: VisitRoute;
}

function latestProduction(history: StoreProductionPoint[]): StoreProductionPoint | null {
  return history.reduce<StoreProductionPoint | null>(
    (latest, item) => !latest || item.periodo > latest.periodo ? item : latest,
    null
  );
}

async function fetchWithConcurrency<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>
): Promise<R[]> {
  const result = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      result[index] = await work(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return result;
}

async function loadProduction(route: VisitRoute): Promise<RoutePdfProductionByStore> {
  if (route.saved) {
    const stores = await fetchSavedRouteExportData(route.id);
    return Object.fromEntries(stores.map((item) => [String(item.chaveLoja), item.production]));
  }

  const storeKeys = [...new Set(
    route.stops
      .map((stop) => String(stop.chaveLoja ?? '').trim())
      .filter(Boolean)
  )];
  const stores = await fetchWithConcurrency(storeKeys, 5, async (chaveLoja) => {
    const overview = await fetchStoreProductionHistory(chaveLoja);
    return [chaveLoja, latestProduction(overview.history)] as const;
  });
  return Object.fromEntries(stores);
}

const RoutePdfExportButton: React.FC<Props> = ({ route }) => {
  const [exporting, setExporting] = useState(false);

  const exportPdf = async () => {
    if (exporting || route.stops.length === 0) return;
    setExporting(true);
    try {
      const productionByStore = await loadProduction(route);
      const { buildRoutePdf, routePdfFilename } = await import('@/lib/routePdfExport');
      const bytes = await buildRoutePdf(route, productionByStore);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = routePdfFilename(route);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success('PDF profissional do roteiro exportado.');
    } catch (reason) {
      const message = reason instanceof Error
        ? reason.message
        : 'Não foi possível gerar o PDF do roteiro.';
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void exportPdf()}
      disabled={exporting || route.stops.length === 0}
      className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
      aria-label="Exportar roteiro em PDF"
      title="Exportar roteiro profissional em PDF"
    >
      {exporting
        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        : <FileDown className="h-4 w-4 text-blue-700" aria-hidden />}
      PDF
    </button>
  );
};

export default RoutePdfExportButton;
