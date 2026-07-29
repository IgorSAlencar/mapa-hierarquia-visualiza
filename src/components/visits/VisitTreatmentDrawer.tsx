import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  Pencil,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { randomUuid } from '@/lib/randomUuid';
import type { VisitRoute, VisitStop } from '@/data/visitRoutes';
import {
  concludeVisit,
  fetchVisit,
  invalidateNotifications,
  registerCheckin,
  registerNotCompleted,
  rescheduleTreatment,
  saveProductTreatment,
  saveVisitDraft,
  VisitApiError,
  type VisitCommercialResult,
  type VisitProduct,
  type VisitTreatment,
} from '@/lib/visitsApi';
import {
  areVisitProductsComplete,
  isTerminalVisitStatus,
  resolveTreatmentJourneyStep,
  treatmentCompletionIssues,
  type TreatmentJourneyStep,
} from './visitTreatmentJourney';

const steps = ['Início', 'Produtos', 'Finalizar'] as const;

const commercialResults: Array<{
  value: VisitCommercialResult;
  label: string;
  description: string;
}> = [
  { value: 'SEM_RESULTADO', label: 'Sem resultado', description: 'Nenhum avanço comercial nesta visita' },
  { value: 'APRESENTADO', label: 'Produto apresentado', description: 'A solução foi apresentada ao cliente' },
  { value: 'INTERESSE', label: 'Demonstrou interesse', description: 'Cliente sinalizou interesse em avançar' },
  { value: 'PROPOSTA', label: 'Proposta iniciada', description: 'Uma proposta comercial foi aberta' },
  { value: 'CONTRATADO', label: 'Contratado', description: 'Produto ou serviço contratado' },
  { value: 'TRANSACIONOU', label: 'Transacionou', description: 'Cliente realizou a primeira transação' },
  { value: 'SEM_INTERESSE', label: 'Sem interesse', description: 'Cliente não demonstrou interesse' },
  { value: 'SEM_OPORTUNIDADE', label: 'Sem oportunidade', description: 'Não havia oportunidade neste momento' },
  { value: 'OUTRO', label: 'Outro', description: 'Resultado diferente das opções acima' },
];

const productResults = commercialResults.filter((item) => item.value !== 'SEM_RESULTADO');

const notCompletedReasons = [
  ['ESTABELECIMENTO_FECHADO', 'Estabelecimento fechado'],
  ['RESPONSAVEL_AUSENTE', 'Responsável ausente'],
  ['ENDERECO_NAO_LOCALIZADO', 'Endereço não localizado'],
  ['PROBLEMA_DESLOCAMENTO', 'Problema de deslocamento'],
  ['REAGENDADA_COM_CLIENTE', 'Reagendada com o cliente'],
  ['OUTRO', 'Outro'],
] as const;

function today(): string {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function localDateTimeInput(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localTimeInput(value: string): string {
  return value.split('T')[1]?.slice(0, 5) ?? '';
}

function combineLocalDateTime(date: string, time: string): string {
  return date && time ? `${date}T${time}` : '';
}

function withLocalOffset(value: string): string {
  const date = new Date(value);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${value.length === 16 ? `${value}:00` : value}${sign}`
    + `${String(Math.floor(absolute / 60)).padStart(2, '0')}:`
    + `${String(absolute % 60).padStart(2, '0')}`;
}

function dateLabel(value: string): string {
  if (!value) return 'Não informada';
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR');
}

function dateTimeLabel(value: string): string {
  if (!value) return 'Será registrado ao concluir';
  const [date, time = ''] = value.split('T');
  return `${dateLabel(date)}${time ? ` às ${time.slice(0, 5)}` : ''}`;
}

function statusLabel(status: VisitTreatment['status']) {
  return {
    PENDENTE: 'Pendente',
    EM_ANDAMENTO: 'Em andamento',
    REALIZADA: 'Realizada',
    NAO_REALIZADA: 'Não realizada',
    REAGENDADA: 'Reagendada',
    CANCELADA: 'Cancelada',
  }[status];
}

function commercialResultLabel(value: string) {
  return commercialResults.find((item) => item.value === value)?.label ?? value;
}

interface DraftState {
  answer: 'SIM' | 'NAO' | 'REAGENDADA' | null;
  visitDate: string;
  startedAt: string;
  endedAt: string;
  commercialResult: VisitCommercialResult;
  notes: string;
  needsReturn: boolean;
  returnDate: string;
}

function initialDraft(visit: VisitTreatment): DraftState {
  return {
    answer: visit.answer,
    visitDate: visit.visitDate ?? today(),
    startedAt: visit.startedAt
      ? localDateTimeInput(new Date(visit.startedAt))
      : localDateTimeInput(),
    endedAt: visit.endedAt ? localDateTimeInput(new Date(visit.endedAt)) : '',
    commercialResult: visit.commercialResult,
    notes: visit.notes ?? '',
    needsReturn: visit.needsReturn,
    returnDate: visit.returnDate ?? '',
  };
}

function draftPayload(draft: DraftState) {
  return {
    answer: draft.answer,
    visitDate: draft.visitDate || null,
    startedAt: draft.startedAt ? withLocalOffset(draft.startedAt) : null,
    endedAt: draft.endedAt ? withLocalOffset(draft.endedAt) : null,
    commercialResult: draft.commercialResult,
    notes: draft.notes,
    needsReturn: draft.needsReturn,
    returnDate: draft.needsReturn ? draft.returnDate || null : null,
  };
}

interface VisitTreatmentDrawerProps {
  route: VisitRoute;
  stop: VisitStop;
  visitId: string;
  initialStep?: number;
  onClose: () => void;
  onVisitUpdated: (visit: VisitTreatment) => void;
  onFinished: (visit: VisitTreatment) => void;
}

const VisitTreatmentDrawer: React.FC<VisitTreatmentDrawerProps> = ({
  route,
  stop,
  visitId,
  initialStep = 0,
  onClose,
  onVisitUpdated,
  onFinished,
}) => {
  const [visit, setVisit] = useState<VisitTreatment | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [step, setStep] = useState<TreatmentJourneyStep>(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notReason, setNotReason] = useState('');
  const [notJustification, setNotJustification] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [resultConfirmed, setResultConfirmed] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [timesExpanded, setTimesExpanded] = useState(false);

  const visitRef = useRef<VisitTreatment | null>(null);
  const draftRef = useRef<DraftState | null>(null);
  const dirtyRef = useRef(false);
  const autosavePromiseRef = useRef<Promise<VisitTreatment | null> | null>(null);
  const commandRunningRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setResultConfirmed(false);
    setContextExpanded(false);
    setNotesExpanded(false);
    setTimesExpanded(false);
    void fetchVisit(visitId)
      .then((next) => {
        if (!active) return;
        const nextDraft = initialDraft(next);
        visitRef.current = next;
        draftRef.current = nextDraft;
        dirtyRef.current = false;
        setVisit(next);
        setDraft(nextDraft);
        setResultConfirmed(
          isTerminalVisitStatus(next.status) || next.commercialResult !== 'SEM_RESULTADO'
        );
        setStep(resolveTreatmentJourneyStep(next, Math.min(2, initialStep)));
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a visita.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [initialStep, visitId]);

  const patchDraft = (values: Partial<DraftState>) => {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, ...values };
    dirtyRef.current = true;
    draftRef.current = next;
    setDraft(next);
  };

  const persistDraft = useCallback(async function persist(force = false): Promise<VisitTreatment | null> {
    const pending = autosavePromiseRef.current;
    if (pending) {
      const pendingResult = await pending;
      if (!pendingResult) return null;
      if (force && dirtyRef.current) return persist(true);
      return pendingResult;
    }

    const currentVisit = visitRef.current;
    const currentDraft = draftRef.current;
    const editable = currentVisit?.status === 'PENDENTE' || currentVisit?.status === 'EM_ANDAMENTO';
    if (!currentVisit || !currentDraft || !editable || !dirtyRef.current) return currentVisit;

    dirtyRef.current = false;
    setDraftSaving(true);
    setError(null);
    const payload = draftPayload(currentDraft);
    const request = saveVisitDraft(currentVisit, payload)
      .then((updated) => {
        visitRef.current = updated;
        setVisit(updated);
        onVisitUpdated(updated);
        return updated;
      })
      .catch(async (cause) => {
        if (cause instanceof VisitApiError && cause.code === 'ROW_VERSION_MISMATCH') {
          try {
            const refreshed = await fetchVisit(currentVisit.id);
            const refreshedDraft = initialDraft(refreshed);
            visitRef.current = refreshed;
            setVisit(refreshed);
            onVisitUpdated(refreshed);

            if (JSON.stringify(draftPayload(refreshedDraft)) === JSON.stringify(payload)) {
              draftRef.current = refreshedDraft;
              dirtyRef.current = false;
              setDraft(refreshedDraft);
              setError(null);
              return refreshed;
            }
          } catch {
            // Mantém o erro de versão original quando a atualização também falhar.
          }
        }
        dirtyRef.current = true;
        const message = cause instanceof Error ? cause.message : 'Falha no salvamento automático.';
        setError(message);
        return null;
      })
      .finally(() => {
        autosavePromiseRef.current = null;
        setDraftSaving(false);
      });
    autosavePromiseRef.current = request;

    const result = await request;
    if (!result) return null;
    if (force && dirtyRef.current) return persist(true);
    return result;
  }, [onVisitUpdated]);

  useEffect(() => {
    const editable = visit?.status === 'PENDENTE' || visit?.status === 'EM_ANDAMENTO';
    if (!draft || !editable || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [draft, persistDraft, visit?.status]);

  const applyServerVisit = (updated: VisitTreatment, resetDraft = true) => {
    visitRef.current = updated;
    setVisit(updated);
    if (resetDraft) {
      const nextDraft = initialDraft(updated);
      draftRef.current = nextDraft;
      dirtyRef.current = false;
      setDraft(nextDraft);
    }
    onVisitUpdated(updated);
    invalidateNotifications();
  };

  const executeCommand = async (
    action: (current: VisitTreatment) => Promise<VisitTreatment>,
    success: string,
    options?: { resetDraft?: boolean; finish?: boolean }
  ) => {
    if (commandRunningRef.current) return null;
    commandRunningRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const current = await persistDraft(true);
      if (!current) return null;
      const updated = await action(current);
      applyServerVisit(updated, options?.resetDraft !== false);
      toast.success(success);
      if (options?.finish) onFinished(updated);
      return updated;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      commandRunningRef.current = false;
      setSaving(false);
    }
  };

  const handleClose = async () => {
    if (!visitRef.current) {
      onClose();
      return;
    }
    setSaving(true);
    const saved = await persistDraft(true);
    setSaving(false);
    if (saved) onClose();
  };

  const confirmCheckin = async () => {
    const currentDraft = draftRef.current;
    if (!currentDraft?.visitDate || !currentDraft.startedAt) {
      setError('Informe a data e o horário do check-in.');
      return;
    }
    patchDraft({ answer: 'SIM' });
    const updated = await executeCommand(
      (current) => registerCheckin(current, {
        occurredAt: withLocalOffset(currentDraft.startedAt),
        visitDate: currentDraft.visitDate,
        deviceEventId: randomUuid(),
      }),
      'Check-in registrado.'
    );
    if (updated) setStep(1);
  };

  const finishVisit = async () => {
    const currentVisit = visitRef.current;
    const currentDraft = draftRef.current;
    if (!currentVisit || !currentDraft) return;
    const issues = treatmentCompletionIssues({
      checkin: currentVisit.checkin,
      products: currentVisit.products,
      resultConfirmed,
      needsReturn: currentDraft.needsReturn,
      returnDate: currentDraft.returnDate,
    });
    if (issues.length > 0) {
      setError({
        CHECKIN_REQUIRED: 'Registre o check-in antes de concluir.',
        PRODUCTS_REQUIRED: 'Conclua a tratativa de todos os produtos foco.',
        COMMERCIAL_RESULT_REQUIRED: 'Escolha o resultado comercial geral.',
        RETURN_DATE_REQUIRED: 'Informe a data prevista para retorno.',
      }[issues[0]] ?? 'Existem informações pendentes.');
      return;
    }

    if (!currentDraft.endedAt) patchDraft({ endedAt: localDateTimeInput() });
    const finalDraft = draftRef.current;
    if (!finalDraft) return;
    await executeCommand(
      (current) => concludeVisit(current, {
        visitDate: finalDraft.visitDate,
        startedAt: withLocalOffset(finalDraft.startedAt),
        endedAt: withLocalOffset(finalDraft.endedAt || localDateTimeInput()),
        commercialResult: finalDraft.commercialResult,
        notes: finalDraft.notes,
        needsReturn: finalDraft.needsReturn,
        returnDate: finalDraft.needsReturn ? finalDraft.returnDate : null,
      }),
      'Visita concluída com sucesso.',
      { finish: true }
    );
  };

  const progress = visit
    ? (visit.routeProgress.total === 0
      ? 0
      : (visit.routeProgress.treated / visit.routeProgress.total) * 100)
    : 0;
  const productsComplete = visit ? areVisitProductsComplete(visit.products) : false;
  const terminal = visit ? isTerminalVisitStatus(visit.status) : false;

  return (
    <aside
      data-visit-treatment-drawer
      className="pointer-events-auto fixed bottom-0 left-0 top-[81px] z-50 flex w-full flex-col border-r border-slate-200 bg-white shadow-2xl shadow-slate-950/20 xl:max-w-[640px]"
      aria-label="Tratativa da visita"
    >
      <header className="border-b border-slate-200 px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <MapPin className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-slate-950">
                {stop.chaveLoja} — {stop.nome}
              </h2>
              {visit && (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                  {statusLabel(visit.status)}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">
              {route.nome} · {stop.ordem}ª parada · {stop.horario}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleClose()}
            disabled={saving || draftSaving}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Fechar tratativa"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {visit && (
          <div className="mt-3">
            <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
              <span>{visit.routeProgress.treated} de {visit.routeProgress.total} visitas tratadas</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </header>

      {!terminal && (
        <nav className="border-b border-slate-200 px-4 py-3 sm:px-5" aria-label="Etapas da tratativa">
          <ol className="grid grid-cols-3 gap-2">
            {steps.map((label, index) => {
              const canOpen = index === 0
                || (index === 1 && Boolean(visit?.checkin))
                || (index === 2 && Boolean(visit?.checkin) && productsComplete);
              return (
                <li key={label}>
                  <button
                    type="button"
                    onClick={() => canOpen && setStep(index as TreatmentJourneyStep)}
                    disabled={loading || !canOpen}
                    aria-current={step === index ? 'step' : undefined}
                    className={cn(
                      'flex w-full items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-semibold transition',
                      step === index
                        ? 'bg-blue-600 text-white shadow-sm'
                        : canOpen
                          ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          : 'bg-slate-50 text-slate-300'
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                      {index + 1}
                    </span>
                    <span>{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {loading && (
          <div className="flex h-full items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando visita...
          </div>
        )}
        {!loading && error && (
          <div role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {!loading && visit && draft && terminal && (
          <TerminalSummary visit={visit} draft={draft} onBack={() => onFinished(visit)} />
        )}
        {!loading && visit && draft && !terminal && (
          <>
            {step === 0 && (
              <section className="space-y-4">
                <SectionTitle
                  title="Como foi a visita?"
                  description="Confirme o que aconteceu para seguir pelo caminho correto."
                />
                <ContextSummary
                  visit={visit}
                  expanded={contextExpanded}
                  onToggle={() => setContextExpanded((value) => !value)}
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <Choice
                    selected={draft.answer === 'SIM'}
                    title="Realizada"
                    description="Iniciar tratativa"
                    onClick={() => patchDraft({
                      answer: 'SIM',
                      visitDate: draft.visitDate || today(),
                      startedAt: draft.startedAt || localDateTimeInput(),
                    })}
                  />
                  <Choice
                    selected={draft.answer === 'NAO'}
                    title="Não realizada"
                    description="Registrar motivo"
                    onClick={() => patchDraft({ answer: 'NAO' })}
                  />
                  <Choice
                    selected={draft.answer === 'REAGENDADA'}
                    title="Reagendada"
                    description="Escolher nova data"
                    onClick={() => patchDraft({ answer: 'REAGENDADA' })}
                  />
                </div>

                {draft.answer === 'SIM' && (
                  <div className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm">
                    <div className="flex items-center gap-3 border-b border-blue-100 bg-blue-50 px-4 py-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white">
                        <CalendarClock className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-blue-950">Data e horário do check-in</p>
                        <p className="text-xs text-blue-700">Confirme ou ajuste antes de continuar.</p>
                      </div>
                    </div>
                    <div className="grid gap-3 p-4 sm:grid-cols-2">
                      <Field label="Data da visita">
                        <input
                          className="field"
                          type="date"
                          value={draft.visitDate}
                          onChange={(event) => {
                            const date = event.target.value;
                            patchDraft({
                              visitDate: date,
                              startedAt: combineLocalDateTime(date, localTimeInput(draft.startedAt)),
                            });
                          }}
                        />
                      </Field>
                      <Field label="Horário do check-in">
                        <input
                          className="field"
                          type="time"
                          value={localTimeInput(draft.startedAt)}
                          onChange={(event) => patchDraft({
                            startedAt: combineLocalDateTime(
                              draft.visitDate || today(),
                              event.target.value
                            ),
                          })}
                        />
                      </Field>
                      <Button
                        className="w-full sm:col-span-2"
                        onClick={() => void confirmCheckin()}
                        disabled={saving || draftSaving || !draft.visitDate || !localTimeInput(draft.startedAt)}
                      >
                        <Clock3 className="mr-2 h-4 w-4" />
                        Confirmar check-in e tratar produtos
                      </Button>
                    </div>
                  </div>
                )}

                {draft.answer === 'NAO' && (
                  <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                    <OptionCards
                      label="Motivo"
                      value={notReason}
                      options={notCompletedReasons.map(([value, label]) => ({ value, label }))}
                      onChange={setNotReason}
                      compact
                    />
                    <Field label={notReason === 'OUTRO' ? 'Justificativa obrigatória' : 'Complemento opcional'}>
                      <Textarea
                        rows={3}
                        value={notJustification}
                        onChange={(event) => setNotJustification(event.target.value)}
                      />
                    </Field>
                    <Button
                      variant="destructive"
                      className="w-full"
                      disabled={saving || !notReason || (notReason === 'OUTRO' && !notJustification.trim())}
                      onClick={() => void executeCommand(
                        (current) => registerNotCompleted(current, {
                          reason: notReason,
                          justification: notJustification,
                        }),
                        'Visita registrada como não realizada.',
                        { finish: true }
                      )}
                    >
                      Encerrar e voltar ao roteiro
                    </Button>
                  </div>
                )}

                {draft.answer === 'REAGENDADA' && (
                  <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:grid-cols-2">
                    <Field label="Nova data">
                      <input
                        className="field"
                        type="date"
                        min={today()}
                        value={newDate}
                        onChange={(event) => setNewDate(event.target.value)}
                      />
                    </Field>
                    <Field label="Horário opcional">
                      <input
                        className="field"
                        type="time"
                        value={newTime}
                        onChange={(event) => setNewTime(event.target.value)}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Observação opcional">
                        <Textarea
                          rows={3}
                          value={notJustification}
                          onChange={(event) => setNotJustification(event.target.value)}
                        />
                      </Field>
                    </div>
                    <Button
                      className="sm:col-span-2"
                      disabled={saving || !newDate}
                      onClick={() => void executeCommand(
                        (current) => rescheduleTreatment(current, {
                          newDate,
                          newTime: newTime || null,
                          reason: 'REAGENDADA_COM_CLIENTE',
                          justification: notJustification || null,
                          priority: current.priority,
                        }),
                        'Visita reagendada e novo episódio criado.',
                        { finish: true }
                      )}
                    >
                      Confirmar e voltar ao roteiro
                    </Button>
                  </div>
                )}
              </section>
            )}

            {step === 1 && (
              <section className="space-y-4">
                <SectionTitle
                  title="Produtos foco"
                  description={`${visit.productProgress.treated} de ${visit.productProgress.total} concluídos. Abra apenas o que precisa registrar.`}
                />
                <div className="space-y-2">
                  {visit.products.map((product) => (
                    <ProductCard
                      key={`${product.id}:${product.rowVersion}`}
                      product={product}
                      saving={saving}
                      onSave={async (body) => {
                        const updated = await executeCommand(
                          (current) => {
                            const currentProduct = current.products.find((item) => item.id === product.id) ?? product;
                            return saveProductTreatment(current, currentProduct, body);
                          },
                          `${product.name} concluído.`,
                          { resetDraft: false }
                        );
                        if (updated && areVisitProductsComplete(updated.products)) setStep(2);
                        return updated;
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <SectionTitle
                  title="Finalizar visita"
                  description="Revise o que foi registrado e informe o resultado geral."
                />

                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-950">Resumo da tratativa</h4>
                      <p className="text-xs text-slate-500">Confira os dados antes de concluir.</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      Produtos concluídos
                    </span>
                  </div>
                  <div className="grid gap-2 p-4 sm:grid-cols-2">
                    <Info
                      label="Check-in"
                      value={`${dateLabel(draft.visitDate)} às ${localTimeInput(draft.startedAt) || '—'}`}
                    />
                    <Info
                      label="Agência"
                      value={[
                        visit.store.agencyCode,
                        visit.store.agencyName,
                      ].filter(Boolean).join(' - ') || 'Não informada'}
                    />
                  </div>
                  <div className="border-t border-slate-200 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Produtos registrados
                      </p>
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Alterar
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {visit.products.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              {product.name}
                            </span>
                            <span className="block truncate text-[11px] text-slate-500">
                              {product.treatmentStatus === 'NAO_ABORDADO'
                                ? product.notAddressedReason || 'Não abordado'
                                : [
                                    product.needsFollowUp ? 'Com acompanhamento' : null,
                                    product.notes || null,
                                  ].filter(Boolean).join(' · ') || 'Registro concluído'}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-slate-500">
                            {product.treatmentStatus === 'NAO_ABORDADO'
                              ? 'Não abordado'
                              : commercialResultLabel(product.result ?? '')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <OptionCards
                  label="Resultado comercial geral"
                  hint="Escolha a opção que melhor representa o resultado da visita."
                  value={resultConfirmed ? draft.commercialResult : ''}
                  options={commercialResults}
                  onChange={(value) => {
                    setResultConfirmed(true);
                    patchDraft({ commercialResult: value as VisitCommercialResult });
                  }}
                />

                <Disclosure
                  open={notesExpanded}
                  onToggle={() => setNotesExpanded((value) => !value)}
                  icon={<Pencil className="h-4 w-4" />}
                  title="Observação geral"
                  summary={draft.notes ? 'Observação adicionada' : 'Opcional'}
                >
                  <Textarea
                    rows={4}
                    value={draft.notes}
                    onChange={(event) => patchDraft({ notes: event.target.value })}
                    placeholder="Conversa, objeções, compromissos ou contexto relevante..."
                  />
                </Disclosure>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <Checkbox
                    checked={draft.needsReturn}
                    onCheckedChange={(checked) => patchDraft({
                      needsReturn: checked === true,
                      returnDate: checked === true ? draft.returnDate : '',
                    })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-900">Necessita retorno</span>
                    <span className="text-xs text-slate-500">Cria um compromisso de acompanhamento.</span>
                  </span>
                </label>
                {draft.needsReturn && (
                  <Field label="Data prevista para retorno">
                    <input
                      className="field max-w-xs"
                      type="date"
                      min={today()}
                      value={draft.returnDate}
                      onChange={(event) => patchDraft({ returnDate: event.target.value })}
                    />
                  </Field>
                )}

                <Disclosure
                  open={timesExpanded}
                  onToggle={() => setTimesExpanded((value) => !value)}
                  icon={<CalendarClock className="h-4 w-4" />}
                  title="Data e horários"
                  summary={`${dateTimeLabel(draft.startedAt)} · término automático`}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Data da visita">
                      <input
                        className="field"
                        type="date"
                        value={draft.visitDate}
                        onChange={(event) => {
                          const date = event.target.value;
                          patchDraft({
                            visitDate: date,
                            startedAt: combineLocalDateTime(date, localTimeInput(draft.startedAt)),
                            endedAt: draft.endedAt
                              ? combineLocalDateTime(date, localTimeInput(draft.endedAt))
                              : '',
                          });
                        }}
                      />
                    </Field>
                    <Field label="Horário de início">
                      <input
                        className="field"
                        type="time"
                        value={localTimeInput(draft.startedAt)}
                        onChange={(event) => patchDraft({
                          startedAt: combineLocalDateTime(draft.visitDate, event.target.value),
                        })}
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Horário de término">
                        <input
                          className="field"
                          type="time"
                          value={localTimeInput(draft.endedAt)}
                          onChange={(event) => patchDraft({
                            endedAt: event.target.value
                              ? combineLocalDateTime(draft.visitDate, event.target.value)
                              : '',
                          })}
                        />
                      </Field>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Se ficar vazio, será preenchido com o horário da conclusão.
                      </p>
                    </div>
                  </div>
                </Disclosure>

                <Button
                  size="lg"
                  className="w-full"
                  disabled={saving || draftSaving || treatmentCompletionIssues({
                    checkin: visit.checkin,
                    products: visit.products,
                    resultConfirmed,
                    needsReturn: draft.needsReturn,
                    returnDate: draft.returnDate,
                  }).length > 0}
                  onClick={() => void finishVisit()}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Concluir visita e voltar ao roteiro
                </Button>
              </section>
            )}
          </>
        )}
      </div>

      {!loading && visit && draft && !terminal && (
        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
          <Button
            variant="ghost"
            disabled={step === 0 || saving}
            onClick={() => setStep((value) => Math.max(0, value - 1) as TreatmentJourneyStep)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
          </Button>
          <div className="flex min-w-0 items-center gap-2 text-[11px] text-slate-500">
            {saving || draftSaving
              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
              : <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
            <span className="truncate">{saving || draftSaving ? 'Salvando...' : 'Rascunho salvo'}</span>
          </div>
          {step < 2 ? (
            <Button
              variant="outline"
              disabled={
                saving
                || (step === 0 && !visit.checkin)
                || (step === 1 && !productsComplete)
              }
              onClick={() => setStep((value) => Math.min(2, value + 1) as TreatmentJourneyStep)}
            >
              Próxima <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : <span className="w-[104px]" aria-hidden />}
        </footer>
      )}
    </aside>
  );
};

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-lg font-bold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
  );
}

function ContextSummary({
  visit,
  expanded,
  onToggle,
}: {
  visit: VisitTreatment;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        aria-expanded={expanded}
      >
        <MapPin className="h-4 w-4 shrink-0 text-blue-700" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">{visit.store.address ?? 'Endereço não informado'}</span>
          <span className="block text-xs text-slate-500">
            {dateLabel(visit.plannedDate)}
            {visit.plannedTime ? ` às ${visit.plannedTime.slice(0, 5)}` : ''}
            {' · '}{visit.products.length} produto{visit.products.length === 1 ? '' : 's'} foco
          </span>
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {expanded && (
        <div className="grid gap-2 border-t border-slate-200 bg-white p-3 sm:grid-cols-2">
          <Info
            label="Agência"
            value={[
              visit.store.agencyCode,
              visit.store.agencyName,
            ].filter(Boolean).join(' - ') || 'Não informada'}
          />
          <Info label="Responsável" value={`${visit.owner.name} (${visit.owner.code})`} />
          <div className="flex flex-wrap gap-1.5 sm:col-span-2">
            {visit.products.map((product) => (
              <span key={product.id} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {product.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TerminalSummary({
  visit,
  draft,
  onBack,
}: {
  visit: VisitTreatment;
  draft: DraftState;
  onBack: () => void;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <CheckCircle2 className="h-7 w-7 shrink-0" />
        <div>
          <h3 className="font-bold">Tratativa encerrada</h3>
          <p className="text-sm">Status: {statusLabel(visit.status)}. O histórico e a auditoria foram preservados.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Data da visita" value={dateLabel(draft.visitDate)} />
        <Info label="Check-in" value={visit.checkin ? new Date(visit.checkin.serverAt).toLocaleString('pt-BR') : 'Não registrado'} />
        <Info label="Produtos foco" value={`${visit.productProgress.treated} de ${visit.productProgress.total} tratados`} />
        <Info label="Resultado" value={commercialResultLabel(draft.commercialResult)} />
        <Info label="Retorno" value={draft.needsReturn ? dateLabel(draft.returnDate) : 'Não necessário'} />
        <Info label="Observação" value={draft.notes || 'Sem observação'} />
      </div>
      <Button className="w-full" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao roteiro
      </Button>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Choice({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-xl border p-3 text-left transition',
        selected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
          : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      <span className="block text-sm font-bold text-slate-900">{title}</span>
      <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
    </button>
  );
}

function OptionCards({
  label,
  hint,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  hint?: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; description?: string }>;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-bold uppercase tracking-wide text-slate-600">
        {label}
      </legend>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      <div
        className="mt-2 grid gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'group flex items-start gap-3 rounded-xl border text-left transition',
                compact ? 'px-3 py-2.5' : 'p-3',
                selected
                  ? 'border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-100'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
              )}
            >
              <span className={cn(
                'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                selected
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-300 bg-white text-transparent'
              )}>
                <Check className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-slate-900">{option.label}</span>
                {!compact && option.description && (
                  <span className="mt-0.5 block text-xs leading-snug text-slate-500">
                    {option.description}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Disclosure({
  open,
  onToggle,
  icon,
  title,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
        aria-expanded={open}
      >
        <span className="text-blue-700">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          <span className="block truncate text-xs text-slate-500">{summary}</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="border-t border-slate-200 p-4">{children}</div>}
    </div>
  );
}

function ProductCard({
  product,
  saving,
  onSave,
}: {
  product: VisitProduct;
  saving: boolean;
  onSave: (body: {
    status: 'TRATADO' | 'NAO_ABORDADO';
    result?: string;
    notes?: string;
    notAddressedReason?: string;
    needsFollowUp: boolean;
  }) => Promise<VisitTreatment | null>;
}) {
  const complete = product.treatmentStatus !== 'PENDENTE';
  const [expanded, setExpanded] = useState(!complete);
  const [addressed, setAddressed] = useState<boolean | null>(
    complete ? product.treatmentStatus !== 'NAO_ABORDADO' : null
  );
  const [result, setResult] = useState(
    product.result && product.result !== 'NAO_ABORDADO' ? product.result : ''
  );
  const [notes, setNotes] = useState(product.notes ?? '');
  const [reason, setReason] = useState(product.notAddressedReason ?? '');
  const [followUp, setFollowUp] = useState(product.needsFollowUp);
  const [detailsOpen, setDetailsOpen] = useState(Boolean(product.notes || product.needsFollowUp));

  if (!expanded) {
    return (
      <article className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Check className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold text-slate-900">{product.name}</h4>
            <p className="truncate text-xs text-slate-500">
              {product.treatmentStatus === 'NAO_ABORDADO'
                ? 'Não abordado'
                : commercialResultLabel(product.result ?? '')}
              {product.needsFollowUp ? ' · acompanhamento' : ''}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
          </Button>
        </div>
      </article>
    );
  }

  const invalid = addressed == null
    || (addressed && !result)
    || (!addressed && !reason.trim());

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <PackageCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-bold text-slate-900">{product.name}</h4>
          <p className="text-xs text-slate-500">{complete ? 'Editando tratativa' : 'Pendente'}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-slate-700">O produto foi abordado?</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setAddressed(true)}
            aria-pressed={addressed === true}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm font-semibold',
              addressed === true ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200'
            )}
          >
            Sim
          </button>
          <button
            type="button"
            onClick={() => setAddressed(false)}
            aria-pressed={addressed === false}
            className={cn(
              'rounded-xl border px-3 py-2 text-sm font-semibold',
              addressed === false ? 'border-rose-400 bg-rose-50 text-rose-800' : 'border-slate-200'
            )}
          >
            Não
          </button>
        </div>
      </div>

      {addressed === true && (
        <div className="mt-3">
          <OptionCards
            label="Resultado"
            value={result}
            options={productResults}
            onChange={setResult}
            compact
          />
        </div>
      )}

      {addressed === false && (
        <div className="mt-3">
          <Field label="Por que não foi abordado?">
            <Textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        </div>
      )}

      {addressed === true && (
        <Disclosure
          open={detailsOpen}
          onToggle={() => setDetailsOpen((value) => !value)}
          icon={<Pencil className="h-4 w-4" />}
          title="Mais detalhes"
          summary={notes || (followUp ? 'Com acompanhamento' : 'Opcional')}
        >
          {addressed && (
            <label className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold">
              <Checkbox checked={followUp} onCheckedChange={(value) => setFollowUp(value === true)} />
              Necessita acompanhamento
            </label>
          )}
          <Field label="Observação opcional">
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </Disclosure>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {complete && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}>
            Cancelar
          </Button>
        )}
        <Button
          size="sm"
          disabled={saving || invalid}
          onClick={() => void onSave(addressed
            ? { status: 'TRATADO', result, notes, needsFollowUp: followUp }
            : {
                status: 'NAO_ABORDADO',
                notAddressedReason: reason,
                needsFollowUp: false,
              })}
        >
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Concluir produto
        </Button>
      </div>
    </article>
  );
}

export default VisitTreatmentDrawer;
