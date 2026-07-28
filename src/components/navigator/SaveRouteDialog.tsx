import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Network,
  Route as RouteIcon,
  Save,
  Search,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { VisitRoute, VisitRouteOwner } from '@/data/visitRoutes';
import { useAuth } from '@/context/AuthContext';
import { fetchRouteOwners, saveRouteVersion } from '@/lib/visitRoutesApi';
import { randomUuid } from '@/lib/randomUuid';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  route: VisitRoute;
  onSaved: (route: VisitRoute) => void;
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
  const [ownerSearch, setOwnerSearch] = useState('');
  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false);
  const [loadingOwners, setLoadingOwners] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(() => randomUuid());
  const storeKeys = useMemo(() => routeStoreKeys(route), [route]);
  const canAssignOutsidePortfolio = Boolean(
    user?.isAdmin || user?.role === 'coordenador' || user?.role === 'gerente_area'
  );
  const ownerLookupStoreKeys = useMemo(
    () => canAssignOutsidePortfolio ? [] : storeKeys,
    [canAssignOutsidePortfolio, storeKeys]
  );

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
  const ownerGroups = useMemo(() => {
    const search = ownerSearch.trim().toLocaleLowerCase('pt-BR');
    const filteredOwners = search
      ? owners.filter((owner) => [
          owner.nome,
          owner.funcional,
          owner.descricaoSupervisao,
          owner.nomeCoordenador,
          owner.descricaoCoordenacao,
        ].some((value) => String(value ?? '').toLocaleLowerCase('pt-BR').includes(search)))
      : owners;
    const groups = new Map<string, {
      key: string;
      managerName: string;
      coordinationName: string | null;
      owners: VisitRouteOwner[];
    }>();

    for (const owner of filteredOwners) {
      const key = owner.chaveCoordenacao != null
        ? String(owner.chaveCoordenacao)
        : `sem-coordenacao:${owner.nomeCoordenador ?? owner.descricaoCoordenacao ?? ''}`;
      const current = groups.get(key) ?? {
        key,
        managerName: owner.nomeCoordenador || owner.descricaoCoordenacao || 'Gerente Comercial III',
        coordinationName: owner.nomeCoordenador ? owner.descricaoCoordenacao ?? null : null,
        owners: [],
      };
      current.owners.push(owner);
      groups.set(key, current);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        owners: group.owners.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
      }))
      .sort((a, b) => a.managerName.localeCompare(b.managerName, 'pt-BR'));
  }, [ownerSearch, owners]);

  useEffect(() => {
    setRequestId(randomUuid());
    setError(null);
  }, [route.id]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingOwners(true);
    setError(null);
    setOwners([]);
    setOwnerKey('');
    setOwnerSearch('');
    setOwnerPickerOpen(false);
    void fetchRouteOwners(ownerLookupStoreKeys)
      .then((items) => {
        if (!active) return;
        setOwners(items);
        const self = items.find((item) => item.funcional === user?.funcional);
        const initial = self ?? (items.length === 1 ? items[0] : null);
        if (initial) setOwnerKey(`${initial.funcional}:${initial.chaveSupervisao}`);
        if (items.length === 0) {
          setError(canAssignOutsidePortfolio
            ? 'Nenhum Gerente Comercial disponível no seu escopo.'
            : 'As lojas selecionadas não pertencem integralmente à sua carteira.');
        }
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Não foi possível listar os responsáveis.');
      })
      .finally(() => {
        if (active) setLoadingOwners(false);
      });
    return () => { active = false; };
  }, [canAssignOutsidePortfolio, open, ownerLookupStoreKeys, route.id, user?.funcional]);

  const persistForOwner = async (owner: VisitRouteOwner) => {
    const savedRoute = await saveRouteVersion(route, owner, requestId);
    onSaved(savedRoute);
    setOpen(false);
    toast.success('Roteiro salvo.');
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
        Roteiro salvo
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setOwnerPickerOpen(false);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={!canPersist}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45"
          title={canPersist ? 'Salvar e atribuir roteiro' : 'Aguarde o cálculo da rota viária'}
        >
          <Save className="h-4 w-4" />
          Salvar roteiro
        </button>
      </DialogTrigger>
      <DialogContent className="w-auto max-w-[calc(100vw-2rem)] border-0 bg-transparent p-0 shadow-none [&>button]:hidden">
        <div className="relative flex max-h-[calc(100vh-2rem)] items-center gap-3">
          <section className="relative flex w-[min(94vw,440px)] shrink-0 flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <DialogClose asChild>
              <button
                type="button"
                disabled={saving}
                className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogClose>

            <DialogHeader className="pr-8">
              <DialogTitle>Salvar roteiro</DialogTitle>
              <DialogDescription>
                Escolha o Gerente Comercial responsável pelo roteiro.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="rounded-lg bg-violet-50 p-2 text-violet-600">
                  <RouteIcon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{route.nome}</p>
                  <p className="mt-1 text-[10px] text-slate-500">
                    {route.stops.length} visitas · {route.distanciaKm} km · {route.duracaoEstimada}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-slate-700">Gerente Comercial responsável</p>
                <button
                  type="button"
                  onClick={() => setOwnerPickerOpen(true)}
                  disabled={loadingOwners || owners.length === 0}
                  className={cn(
                    'mt-1.5 flex min-h-12 w-full items-center gap-2.5 rounded-xl border bg-white px-3 py-2 text-left outline-none transition',
                    ownerPickerOpen
                      ? 'border-emerald-400 ring-2 ring-emerald-100'
                      : 'border-slate-200 hover:border-emerald-300',
                    'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60'
                  )}
                >
                  <span className="rounded-lg bg-emerald-50 p-1.5 text-emerald-700">
                    {loadingOwners
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <UserRound className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-900">
                      {loadingOwners
                        ? 'Carregando responsáveis...'
                        : selectedOwner?.nome ?? 'Escolher Gerente Comercial'}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                      {selectedOwner
                        ? selectedOwner.descricaoSupervisao ?? `Supervisão ${selectedOwner.chaveSupervisao}`
                        : 'Clique para consultar sua estrutura'}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                </button>
              </div>

              <p className="text-[10px] leading-relaxed text-slate-500">
                Você pode direcionar o roteiro a qualquer Gerente Comercial do seu escopo.
              </p>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <button
                  type="button"
                  disabled={saving}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
              </DialogClose>
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
          </section>

          {ownerPickerOpen && (
            <aside
              aria-label="Escolher Gerente Comercial"
              className="absolute inset-0 z-20 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl lg:static lg:h-[min(680px,calc(100vh-2rem))] lg:w-[440px]"
            >
              <header className="shrink-0 border-b border-slate-200 px-4 py-4">
                <div className="flex items-start gap-2.5">
                  <span className="rounded-xl bg-emerald-50 p-2 text-emerald-700">
                    <UsersRound className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">Gerentes Comerciais</p>
                    <p className="mt-0.5 text-[10px] text-slate-500">Organizados por Gerente Comercial III</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOwnerPickerOpen(false)}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Fechar seleção de gerente"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <label className="relative mt-3 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <span className="sr-only">Buscar Gerente Comercial</span>
                  <input
                    type="search"
                    value={ownerSearch}
                    onChange={(event) => setOwnerSearch(event.target.value)}
                    placeholder="Buscar gerente, supervisão ou GC III"
                    className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </header>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-4 p-4">
                  {ownerGroups.map((group) => (
                    <section key={group.key} className="space-y-2">
                      <header className="flex items-center gap-2 px-1">
                        <span className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                          <Network className="h-3.5 w-3.5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-blue-600">
                            Gerente Comercial III
                          </p>
                          <p className="truncate text-xs font-bold text-slate-900">{group.managerName}</p>
                          {group.coordinationName && (
                            <p className="truncate text-[10px] text-slate-500">{group.coordinationName}</p>
                          )}
                        </div>
                      </header>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                        {group.owners.map((owner) => {
                          const key = `${owner.funcional}:${owner.chaveSupervisao}`;
                          const selected = ownerKey === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => {
                                setOwnerKey(key);
                                setOwnerPickerOpen(false);
                              }}
                              className={cn(
                                'group flex min-h-[88px] flex-col rounded-xl border bg-white p-3 text-left transition',
                                selected
                                  ? 'border-emerald-400 bg-emerald-50/40 ring-2 ring-emerald-100'
                                  : 'border-slate-200 hover:border-emerald-300 hover:shadow-sm'
                              )}
                            >
                              <span className="flex w-full items-start gap-2.5">
                                <span className={cn(
                                  'rounded-lg p-1.5',
                                  selected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                )}>
                                  <UserRound className="h-4 w-4" aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-bold text-slate-900">{owner.nome}</span>
                                  <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                                    {owner.descricaoSupervisao ?? `Supervisão ${owner.chaveSupervisao}`}
                                  </span>
                                </span>
                                {selected && (
                                  <span className="rounded-full bg-emerald-600 p-1 text-white">
                                    <Check className="h-3 w-3" aria-hidden />
                                  </span>
                                )}
                              </span>
                              <span className="mt-auto pl-9 text-[9px] text-slate-400">Funcional {owner.funcional}</span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}

                  {ownerGroups.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-300 px-4 py-10 text-center">
                      <Search className="mx-auto h-5 w-5 text-slate-300" aria-hidden />
                      <p className="mt-2 text-xs font-semibold text-slate-700">Nenhum gerente encontrado</p>
                      <p className="mt-1 text-[10px] text-slate-500">Tente buscar por outro nome ou supervisão.</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </aside>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SaveRouteDialog;
