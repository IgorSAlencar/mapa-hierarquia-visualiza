import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { VisitRoute, VisitRouteOwner } from '@/data/visitRoutes';
import { useAuth } from '@/context/AuthContext';
import { fetchRouteOwners, saveRouteVersion } from '@/lib/visitRoutesApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Props {
  route: VisitRoute;
  onSaved: (route: VisitRoute) => void;
}

function requestUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function routeStoreKeys(route: VisitRoute): string[] {
  return [...new Set(
    route.stops
      .map((stop) => String(stop.chaveLoja ?? '').trim())
      .filter(Boolean)
  )];
}

const SaveRouteDialog: React.FC<Props> = ({ route, onSaved }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [owners, setOwners] = useState<VisitRouteOwner[]>([]);
  const [ownerKey, setOwnerKey] = useState('');
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => requestUuid());
  const storeKeys = useMemo(() => routeStoreKeys(route), [route.id, route.stops]);

  const canPersist = Boolean(
    route.plannedDate &&
    route.origin &&
    route.distanceMeters &&
    route.durationBreakdown?.source === 'calculated' &&
    route.routeGeometry && route.routeGeometry.length >= 2 &&
    route.stops.length > 0
  );
  const selectedOwner = useMemo(
    () => owners.find((owner) => `${owner.funcional}:${owner.chaveSupervisao}` === ownerKey) ?? null,
    [ownerKey, owners]
  );

  useEffect(() => {
    setRequestId(requestUuid());
    setError(null);
  }, [route.id]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingOwners(true);
    setError(null);
    setOwners([]);
    setOwnerKey('');
    void fetchRouteOwners(storeKeys)
      .then((items) => {
        if (!active) return;
        setOwners(items);
        const self = items.find((item) => item.funcional === user?.funcional);
        const initial = self ?? (items.length === 1 ? items[0] : null);
        if (initial) setOwnerKey(`${initial.funcional}:${initial.chaveSupervisao}`);
        if (items.length === 0) {
          setError('Nenhum Gerente Comercial do seu escopo cobre todas as lojas deste roteiro.');
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível listar os responsáveis.');
      })
      .finally(() => {
        if (active) setLoadingOwners(false);
      });
    return () => { active = false; };
  }, [open, route.id, storeKeys, user?.funcional]);

  const persistForOwner = async (owner: VisitRouteOwner) => {
    const savedRoute = await saveRouteVersion(route, owner, requestId);
    onSaved(savedRoute);
    setOpen(false);
    toast.success(`Roteiro salvo como versão ${savedRoute.saved?.version ?? 1}.`);
  };

  const saveForOwner = async (owner: VisitRouteOwner | null) => {
    if (!owner || !canPersist || saving) return;
    setSaving(true);
    setError(null);
    try {
      await persistForOwner(owner);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível salvar o roteiro.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const saveDirectlyForCommercialManager = async () => {
    if (!canPersist || saving) return;
    setSaving(true);
    setError(null);
    try {
      const items = await fetchRouteOwners(storeKeys);
      setOwners(items);
      const self = items.find((owner) => owner.funcional === user?.funcional) ?? null;
      if (!self) throw new Error('Não foi possível identificar o Gerente Comercial responsável.');
      await persistForOwner(self);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Não foi possível salvar o roteiro.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (route.saved) {
    return (
      <span className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">
        <CheckCircle2 className="h-4 w-4" />
        Roteiro salvo · v{route.saved.version}
      </span>
    );
  }

  if (user?.role === 'supervisor') {
    return (
      <button
        type="button"
        onClick={() => void saveDirectlyForCommercialManager()}
        disabled={!canPersist || saving}
        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
        title={canPersist ? 'Salvar roteiro diretamente' : 'Aguarde o cálculo da rota viária'}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? 'Salvando...' : 'Salvar roteiro'}
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!canPersist}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
          title={canPersist ? 'Salvar uma versão imutável do roteiro' : 'Aguarde o cálculo da rota viária'}
        >
          <Save className="h-4 w-4" />
          Salvar roteiro
        </button>
      </DialogTrigger>
      <DialogContent className="w-[min(94vw,440px)] rounded-2xl border-slate-200 bg-white">
        <DialogHeader>
          <DialogTitle>Salvar roteiro</DialogTitle>
          <DialogDescription>
            A geometria, a ordem das visitas e as oportunidades serão preservadas como uma nova versão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <p className="font-bold text-slate-900">{route.nome}</p>
            <p className="mt-1 text-slate-500">{route.stops.length} visitas · {route.distanciaKm} km · {route.duracaoEstimada}</p>
          </div>
          <label className="block text-xs font-semibold text-slate-700">
            Gerente Comercial responsável
            <select
              value={ownerKey}
              onChange={(event) => setOwnerKey(event.target.value)}
              disabled={loadingOwners || owners.length === 0}
              className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            >
              <option value="">
                {loadingOwners ? 'Carregando...' : owners.length === 0 ? 'Nenhum GC compatível' : 'Selecione o responsável'}
              </option>
              {owners.map((owner) => (
                <option key={`${owner.funcional}:${owner.chaveSupervisao}`} value={`${owner.funcional}:${owner.chaveSupervisao}`}>
                  {owner.nome} · {owner.descricaoSupervisao ?? owner.chaveSupervisao}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[10px] text-slate-500">
            Lista limitada aos Gerentes Comerciais do seu escopo cuja supervisão cobre as lojas deste roteiro.
          </p>
          {loadingOwners && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando responsáveis...</p>}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>

        <DialogFooter>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700">Cancelar</button>
          <button
            type="button"
            onClick={() => void saveForOwner(selectedOwner)}
            disabled={!selectedOwner || saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-45"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Confirmar salvamento
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SaveRouteDialog;
