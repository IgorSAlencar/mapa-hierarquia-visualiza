import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  PackageCheck,
  Save,
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
  type VisitCommercialResult,
  type VisitProduct,
  type VisitTreatment,
} from '@/lib/visitsApi';

const steps = [
  'Dados da visita',
  'Confirmação',
  'Produtos foco',
  'Resultado',
  'Próximos passos',
  'Revisão',
] as const;

const commercialResults: Array<{ value: VisitCommercialResult; label: string }> = [
  { value: 'SEM_RESULTADO', label: 'Sem resultado' },
  { value: 'APRESENTADO', label: 'Produto apresentado' },
  { value: 'INTERESSE', label: 'Demonstrou interesse' },
  { value: 'PROPOSTA', label: 'Proposta iniciada' },
  { value: 'CONTRATADO', label: 'Contratado' },
  { value: 'TRANSACIONOU', label: 'Transacionou' },
  { value: 'SEM_INTERESSE', label: 'Sem interesse' },
  { value: 'SEM_OPORTUNIDADE', label: 'Sem oportunidade' },
  { value: 'OUTRO', label: 'Outro' },
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

function withLocalOffset(value: string): string {
  const date = new Date(value);
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absolute = Math.abs(offset);
  return `${value.length === 16 ? `${value}:00` : value}${sign}`
    + `${String(Math.floor(absolute / 60)).padStart(2, '0')}:`
    + `${String(absolute % 60).padStart(2, '0')}`;
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

interface VisitTreatmentDrawerProps {
  route: VisitRoute;
  stop: VisitStop;
  visitId: string;
  initialStep?: number;
  onClose: () => void;
  onVisitUpdated: (visit: VisitTreatment) => void;
  onNext: () => void;
}

const VisitTreatmentDrawer: React.FC<VisitTreatmentDrawerProps> = ({
  route,
  stop,
  visitId,
  initialStep = 0,
  onClose,
  onVisitUpdated,
  onNext,
}) => {
  const [visit, setVisit] = useState<VisitTreatment | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [step, setStep] = useState(Math.max(0, Math.min(5, initialStep)));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notReason, setNotReason] = useState('');
  const [notJustification, setNotJustification] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const dirtyRef = useRef(false);
  const autosaveRunning = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void fetchVisit(visitId)
      .then((next) => {
        if (!active) return;
        setVisit(next);
        setDraft(initialDraft(next));
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível abrir a visita.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [visitId]);

  const editable = visit?.status === 'PENDENTE' || visit?.status === 'EM_ANDAMENTO';
  const setDraftValue = <K extends keyof DraftState>(key: K, value: DraftState[K]) => {
    dirtyRef.current = true;
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  useEffect(() => {
    if (!visit || !draft || !editable || !dirtyRef.current) return;
    const timer = window.setTimeout(() => {
      if (autosaveRunning.current || !dirtyRef.current) return;
      autosaveRunning.current = true;
      const snapshot = visit;
      void saveVisitDraft(snapshot, {
        answer: draft.answer,
        visitDate: draft.visitDate || null,
        startedAt: draft.startedAt ? withLocalOffset(draft.startedAt) : null,
        endedAt: draft.endedAt ? withLocalOffset(draft.endedAt) : null,
        commercialResult: draft.commercialResult,
        notes: draft.notes,
        needsReturn: draft.needsReturn,
        returnDate: draft.returnDate || null,
      }).then((updated) => {
        dirtyRef.current = false;
        setVisit(updated);
        onVisitUpdated(updated);
      }).catch((cause) => {
        setError(cause instanceof Error ? cause.message : 'Falha no salvamento automático.');
      }).finally(() => {
        autosaveRunning.current = false;
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [draft, editable, onVisitUpdated, visit]);

  const updateVisit = (updated: VisitTreatment) => {
    setVisit(updated);
    setDraft(initialDraft(updated));
    dirtyRef.current = false;
    onVisitUpdated(updated);
    invalidateNotifications();
  };

  const run = async (action: () => Promise<VisitTreatment>, success: string) => {
    setSaving(true);
    setError(null);
    try {
      const updated = await action();
      updateVisit(updated);
      toast.success(success);
      return updated;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.';
      setError(message);
      toast.error(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const progress = visit
    ? (visit.routeProgress.total === 0
      ? 0
      : (visit.routeProgress.treated / visit.routeProgress.total) * 100)
    : 0;
  const productsComplete = visit?.productProgress.treated === visit?.productProgress.total;
  const terminal = visit && !editable;

  const confirmCheckin = async () => {
    if (!visit || !draft) return;
    const now = localDateTimeInput();
    setDraftValue('answer', 'SIM');
    setDraftValue('visitDate', today());
    setDraftValue('startedAt', now);
    const updated = await run(() => registerCheckin(visit, {
      occurredAt: withLocalOffset(now),
      visitDate: today(),
      deviceEventId: randomUuid(),
    }), 'Check-in registrado sem coleta de localização.');
    if (updated) setStep(2);
  };

  const complete = async (goNext: boolean) => {
    if (!visit || !draft) return;
    const updated = await run(() => concludeVisit(visit, {
      visitDate: draft.visitDate,
      startedAt: withLocalOffset(draft.startedAt),
      endedAt: draft.endedAt ? withLocalOffset(draft.endedAt) : null,
      commercialResult: draft.commercialResult,
      notes: draft.notes,
      needsReturn: draft.needsReturn,
      returnDate: draft.needsReturn ? draft.returnDate : null,
    }), 'Visita concluída com sucesso.');
    if (updated && goNext) onNext();
  };

  return (
    <aside
      className="pointer-events-auto fixed bottom-0 right-0 top-[81px] z-50 flex w-full max-w-[760px] flex-col border-l border-slate-200 bg-white shadow-2xl shadow-slate-950/20"
      aria-label="Tratativa da visita"
    >
      <header className="border-b border-slate-200 px-5 py-4">
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
            <p className="mt-1 text-xs text-slate-500">
              {route.nome} · {stop.ordem}ª parada · {stop.horario}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Fechar tratativa"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {visit && (
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-[11px] text-slate-500">
              <span>{visit.routeProgress.treated} de {visit.routeProgress.total} visitas tratadas</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
          </div>
        )}
      </header>

      <nav className="overflow-x-auto border-b border-slate-200 px-5 py-3">
        <ol className="flex min-w-max items-center gap-2">
          {steps.map((label, index) => (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(index)}
                disabled={loading}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-semibold',
                  step === index ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                )}
              >
                <span>{index + 1}</span>
                <span>{label}</span>
              </button>
              {index < steps.length - 1 && <span className="h-px w-3 bg-slate-200" />}
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {loading && (
          <div className="flex h-full items-center justify-center text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando visita...
          </div>
        )}
        {!loading && error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}
        {!loading && visit && draft && (
          <>
            {step === 0 && (
              <section className="space-y-4">
                <SectionTitle title="Dados da visita" description="Contexto preservado durante toda a tratativa." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Loja" value={`${visit.store.key} — ${visit.store.name}`} />
                  <Info label="Agência / território" value={`${visit.store.agencyCode ?? '—'} / ${visit.store.supervisionKey}`} />
                  <Info label="Data planejada" value={`${visit.plannedDate}${visit.plannedTime ? ` às ${visit.plannedTime.slice(0, 5)}` : ''}`} />
                  <Info label="Responsável" value={`${visit.owner.name} (${visit.owner.code})`} />
                  <Info label="Cadastrada por" value={`${visit.createdBy.name} (${visit.createdBy.code})`} />
                  <Info label="Prioridade" value={visit.priority} />
                </div>
                <Info label="Endereço" value={visit.store.address ?? 'Não informado'} />
                <Info label="Orientação" value={visit.orientation ?? 'Sem orientação adicional'} />
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Produtos foco</p>
                  <div className="flex flex-wrap gap-2">
                    {visit.products.map((product) => (
                      <span key={product.id} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                        {product.name}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-5">
                <SectionTitle title="A loja foi realmente visitada?" description="Escolha o que ocorreu para seguir pela jornada correta." />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Choice
                    selected={draft.answer === 'SIM'}
                    title="Sim, visita realizada"
                    description="Registra o check-in e inicia a tratativa."
                    onClick={() => setDraftValue('answer', 'SIM')}
                  />
                  <Choice
                    selected={draft.answer === 'NAO'}
                    title="Não foi possível"
                    description="Exige um motivo para encerrar."
                    onClick={() => setDraftValue('answer', 'NAO')}
                  />
                  <Choice
                    selected={draft.answer === 'REAGENDADA'}
                    title="Visita reagendada"
                    description="Cria um novo episódio pendente."
                    onClick={() => setDraftValue('answer', 'REAGENDADA')}
                  />
                </div>

                {draft.answer === 'SIM' && (
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                    <p className="text-sm font-semibold text-blue-950">Check-in sem geolocalização</p>
                    <p className="mt-1 text-xs text-blue-800">
                      Serão registrados o usuário autenticado, o horário informado com offset e o horário UTC do servidor.
                    </p>
                    <Button className="mt-4" onClick={() => void confirmCheckin()} disabled={saving || Boolean(visit.checkin)}>
                      {visit.checkin ? <Check className="mr-2 h-4 w-4" /> : <Clock3 className="mr-2 h-4 w-4" />}
                      {visit.checkin ? 'Check-in registrado' : 'Registrar check-in e continuar'}
                    </Button>
                  </div>
                )}

                {draft.answer === 'NAO' && (
                  <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                    <Field label="Motivo obrigatório">
                      <select className="field" value={notReason} onChange={(event) => setNotReason(event.target.value)}>
                        <option value="">Selecione...</option>
                        {notCompletedReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </Field>
                    {(notReason === 'OUTRO' || notJustification) && (
                      <Field label={notReason === 'OUTRO' ? 'Justificativa obrigatória' : 'Complemento'}>
                        <Textarea value={notJustification} onChange={(event) => setNotJustification(event.target.value)} />
                      </Field>
                    )}
                    <Button
                      variant="destructive"
                      disabled={saving || !notReason || (notReason === 'OUTRO' && !notJustification.trim())}
                      onClick={() => void run(
                        () => registerNotCompleted(visit, { reason: notReason, justification: notJustification }),
                        'Visita registrada como não realizada.'
                      )}
                    >
                      Encerrar como não realizada
                    </Button>
                  </div>
                )}

                {draft.answer === 'REAGENDADA' && (
                  <div className="grid gap-3 rounded-2xl border border-violet-200 bg-violet-50/60 p-4 sm:grid-cols-2">
                    <Field label="Nova data">
                      <input className="field" type="date" min={today()} value={newDate} onChange={(event) => setNewDate(event.target.value)} />
                    </Field>
                    <Field label="Novo horário">
                      <input className="field" type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Motivo / orientação">
                        <Textarea value={notJustification} onChange={(event) => setNotJustification(event.target.value)} />
                      </Field>
                    </div>
                    <Button
                      className="sm:col-span-2"
                      disabled={saving || !newDate || !notJustification.trim()}
                      onClick={() => void run(
                        () => rescheduleTreatment(visit, {
                          newDate,
                          newTime: newTime || null,
                          reason: 'REAGENDADA_COM_CLIENTE',
                          justification: notJustification,
                          orientation: notJustification,
                          priority: visit.priority,
                        }),
                        'Visita reagendada e novo episódio criado.'
                      )}
                    >
                      Confirmar reagendamento
                    </Button>
                  </div>
                )}
              </section>
            )}

            {step === 2 && (
              <section className="space-y-4">
                <SectionTitle
                  title="Tratativa dos produtos foco"
                  description={`${visit.productProgress.treated} de ${visit.productProgress.total} produtos tratados.`}
                />
                {visit.products.map((product) => (
                  <ProductCard
                    key={`${product.id}:${product.rowVersion}`}
                    visit={visit}
                    product={product}
                    saving={saving}
                    onSave={(body) => run(
                      () => saveProductTreatment(visit, product, body),
                      `${product.name} atualizado.`
                    )}
                  />
                ))}
              </section>
            )}

            {step === 3 && (
              <section className="space-y-4">
                <SectionTitle title="Resultado e observações" description="Registre o resultado comercial geral da visita." />
                <Field label="Resultado comercial">
                  <select
                    className="field"
                    value={draft.commercialResult}
                    onChange={(event) => setDraftValue('commercialResult', event.target.value as VisitCommercialResult)}
                  >
                    {commercialResults.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
                <Field label="Observação geral">
                  <Textarea
                    rows={7}
                    value={draft.notes}
                    onChange={(event) => setDraftValue('notes', event.target.value)}
                    placeholder="O que foi conversado, objeções, compromissos e contexto relevante..."
                  />
                </Field>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Data da visita">
                    <input className="field" type="date" value={draft.visitDate} onChange={(event) => setDraftValue('visitDate', event.target.value)} />
                  </Field>
                  <Field label="Horário de início">
                    <input className="field" type="datetime-local" value={draft.startedAt} onChange={(event) => setDraftValue('startedAt', event.target.value)} />
                  </Field>
                  <Field label="Horário de término (opcional)">
                    <input className="field" type="datetime-local" value={draft.endedAt} onChange={(event) => setDraftValue('endedAt', event.target.value)} />
                  </Field>
                </div>
              </section>
            )}

            {step === 4 && (
              <section className="space-y-4">
                <SectionTitle title="Próximos passos" description="Defina se a visita precisa de retorno." />
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4">
                  <Checkbox
                    checked={draft.needsReturn}
                    onCheckedChange={(checked) => setDraftValue('needsReturn', checked === true)}
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Necessita retorno</span>
                    <span className="text-xs text-slate-500">Cria um compromisso de acompanhamento após a visita.</span>
                  </span>
                </label>
                {draft.needsReturn && (
                  <Field label="Data prevista para retorno">
                    <input
                      className="field max-w-xs"
                      type="date"
                      min={today()}
                      value={draft.returnDate}
                      onChange={(event) => setDraftValue('returnDate', event.target.value)}
                    />
                  </Field>
                )}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Acompanhamentos automáticos</p>
                  <p className="mt-2 text-sm text-slate-700">
                    Produtos marcados para acompanhamento serão avaliados após o prazo configurado. Produtos manuais, como Relacionamento, permanecem para registro humano.
                  </p>
                </div>
              </section>
            )}

            {step === 5 && (
              <section className="space-y-4">
                <SectionTitle title="Revisão e conclusão" description="Confira os dados antes de encerrar a visita." />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Info label="Check-in" value={visit.checkin ? `Registrado às ${new Date(visit.checkin.serverAt).toLocaleString('pt-BR')}` : 'Pendente'} />
                  <Info label="Produtos foco" value={`${visit.productProgress.treated} de ${visit.productProgress.total} tratados`} />
                  <Info label="Resultado" value={commercialResults.find((item) => item.value === draft.commercialResult)?.label ?? draft.commercialResult} />
                  <Info label="Retorno" value={draft.needsReturn ? draft.returnDate || 'Data pendente' : 'Não necessário'} />
                </div>
                {!productsComplete && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    A conclusão está bloqueada: registre a tratativa ou a justificativa de não abordagem de todos os produtos foco.
                  </div>
                )}
                {!visit.checkin && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    A conclusão está bloqueada: o check-in é obrigatório.
                  </div>
                )}
                {terminal ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                    <CheckCircle2 className="h-6 w-6" />
                    <div>
                      <p className="font-bold">Tratativa encerrada</p>
                      <p className="text-sm">O histórico e a auditoria foram preservados.</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={saving || !productsComplete || !visit.checkin || (draft.needsReturn && !draft.returnDate)}
                      onClick={() => void complete(false)}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Concluir visita
                    </Button>
                    <Button
                      variant="outline"
                      disabled={saving || !productsComplete || !visit.checkin || (draft.needsReturn && !draft.returnDate)}
                      onClick={() => void complete(true)}
                    >
                      <Save className="mr-2 h-4 w-4" /> Salvar e ir para a próxima loja
                    </Button>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {!loading && visit && draft && (
        <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Anterior
          </Button>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            {saving || autosaveRunning.current ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
            {saving || autosaveRunning.current ? 'Salvando...' : 'Rascunho salvo'}
          </div>
          <Button variant="outline" disabled={step === 5} onClick={() => setStep((value) => Math.min(5, value + 1))}>
            Próxima <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
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
      className={cn(
        'rounded-2xl border p-4 text-left transition',
        selected
          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100'
          : 'border-slate-200 bg-white hover:border-slate-300'
      )}
    >
      <span className="block text-sm font-bold text-slate-900">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-slate-500">{description}</span>
    </button>
  );
}

function ProductCard({
  visit,
  product,
  saving,
  onSave,
}: {
  visit: VisitTreatment;
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
  const [addressed, setAddressed] = useState(product.treatmentStatus !== 'NAO_ABORDADO');
  const [result, setResult] = useState(product.result ?? 'APRESENTADO');
  const [notes, setNotes] = useState(product.notes ?? '');
  const [reason, setReason] = useState(product.notAddressedReason ?? '');
  const [followUp, setFollowUp] = useState(product.needsFollowUp);
  const complete = product.treatmentStatus !== 'PENDENTE';

  return (
    <article className={cn(
      'rounded-2xl border p-4',
      complete ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
    )}>
      <div className="flex items-center gap-3">
        <span className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl',
          complete ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
        )}>
          {complete ? <Check className="h-4 w-4" /> : <PackageCheck className="h-4 w-4" />}
        </span>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-slate-900">{product.name}</h4>
          <p className="text-xs text-slate-500">
            {complete ? 'Tratativa registrada' : 'Tratativa pendente'}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <Checkbox checked={addressed} onCheckedChange={(value) => setAddressed(value === true)} />
          Produto abordado
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {addressed ? (
          <>
            <Field label="Resultado">
              <select className="field" value={result} onChange={(event) => setResult(event.target.value)}>
                {productResults.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-semibold">
              <Checkbox checked={followUp} onCheckedChange={(value) => setFollowUp(value === true)} />
              Necessita acompanhamento
            </label>
          </>
        ) : (
          <div className="sm:col-span-2">
            <Field label="Justificativa obrigatória para não abordagem">
              <Textarea value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
        )}
        <div className="sm:col-span-2">
          <Field label="Observação">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
        </div>
      </div>
      <Button
        className="mt-3"
        size="sm"
        disabled={saving || (!addressed && !reason.trim())}
        onClick={() => void onSave(addressed
          ? { status: 'TRATADO', result, notes, needsFollowUp: followUp }
          : {
              status: 'NAO_ABORDADO',
              notes,
              notAddressedReason: reason,
              needsFollowUp: false,
            })}
      >
        Salvar produto
      </Button>
    </article>
  );
}

export default VisitTreatmentDrawer;
