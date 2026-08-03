import { BookOpen, CheckCircle2, Clock3, Compass, Play, RotateCcw, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useTutorial } from './TutorialContext';
import type {
  TutorialDefinition,
  TutorialDisplayStatus,
  TutorialProgress,
} from './tutorialTypes';

const statusMeta: Record<TutorialDisplayStatus, { label: string; className: string }> = {
  new: { label: 'Novo', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  not_started: { label: 'Não iniciado', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  in_progress: { label: 'Em andamento', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  completed: { label: 'Concluído', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  skipped: { label: 'Pulado', className: 'border-slate-200 bg-slate-50 text-slate-600' },
  updated: { label: 'Atualizado', className: 'border-violet-200 bg-violet-50 text-violet-700' },
};

function displayStatus(tutorial: TutorialDefinition, saved?: TutorialProgress): TutorialDisplayStatus {
  if (!saved) return tutorial.isNew ? 'new' : 'not_started';
  if (saved.version < tutorial.version) return 'updated';
  return saved.status;
}

function actionLabel(status: TutorialDisplayStatus) {
  if (status === 'in_progress') return 'Continuar';
  if (status === 'completed') return 'Revisar';
  if (status === 'updated') return 'Ver atualização';
  return 'Iniciar';
}

function TutorialCard({
  tutorial,
  saved,
  onStart,
}: {
  tutorial: TutorialDefinition;
  saved?: TutorialProgress;
  onStart: () => void;
}) {
  const status = displayStatus(tutorial, saved);
  const meta = statusMeta[status];
  const completed = status === 'completed';
  const inProgress = status === 'in_progress';
  const progressPercent = inProgress
    ? Math.round(((Math.min(saved?.currentStep ?? 0, tutorial.steps.length - 1) + 1) / tutorial.steps.length) * 100)
    : completed ? 100 : 0;

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-900/[0.04] transition hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <span className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
          tutorial.type === 'journey' ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700',
        )}>
          {completed ? <CheckCircle2 className="h-5 w-5" /> : tutorial.type === 'journey' ? <Compass className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">{tutorial.title}</h3>
            <Badge variant="outline" className={cn('rounded-full text-[9px] font-bold', meta.className)}>
              {meta.label}
            </Badge>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">{tutorial.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-medium text-slate-500">
            <span>{tutorial.steps.length} etapas</span>
            {tutorial.estimatedMinutes && (
              <span className="inline-flex items-center gap-1">
                <Clock3 className="h-3 w-3" /> {tutorial.estimatedMinutes} min
              </span>
            )}
            <span>{tutorial.category}</span>
          </div>
          {(inProgress || completed) && (
            <div className="mt-3" aria-label={`Progresso: ${progressPercent}%`}>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn('h-full rounded-full', completed ? 'bg-emerald-500' : 'bg-amber-500')}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onStart}
            className="mt-3 h-8 rounded-xl bg-blue-600 px-3 text-[11px] font-semibold hover:bg-blue-700"
          >
            {completed ? <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> : <Play className="mr-1.5 h-3.5 w-3.5" />}
            {actionLabel(status)}
          </Button>
        </div>
      </div>
    </article>
  );
}

export function TutorialCenter() {
  const { tutorials, progress, centerOpen, closeCenter, openCenter, startTutorial } = useTutorial();
  const journeys = tutorials.filter((tutorial) => tutorial.type === 'journey');
  const otherTutorials = tutorials.filter((tutorial) => tutorial.type !== 'journey');

  return (
    <Sheet open={centerOpen} onOpenChange={(open) => open ? openCenter() : closeCenter()}>
      <SheetContent
        side="right"
        className="z-[1500] flex w-[min(96vw,480px)] flex-col gap-0 overflow-hidden border-slate-200 bg-slate-50 p-0 sm:max-w-[480px]"
      >
        <SheetHeader className="border-b border-slate-200 bg-white px-5 pb-4 pt-5 text-left">
          <div className="flex items-center gap-3 pr-8">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 text-white shadow-lg shadow-blue-200">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <SheetTitle className="text-lg text-slate-950">Central de Tutoriais</SheetTitle>
              <SheetDescription className="mt-1 text-xs leading-relaxed text-slate-500">
                Aprenda no seu ritmo e retome de onde parou.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
          <section aria-labelledby="main-journeys-title">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h2 id="main-journeys-title" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">
                Jornadas principais
              </h2>
            </div>
            <div className="space-y-3">
              {journeys.map((tutorial) => (
                <TutorialCard
                  key={tutorial.id}
                  tutorial={tutorial}
                  saved={progress[tutorial.id]}
                  onStart={() => void startTutorial(tutorial.id, {
                    restart: progress[tutorial.id]?.status === 'completed',
                  })}
                />
              ))}
            </div>
          </section>

          <section className="mt-6" aria-labelledby="other-tutorials-title">
            <div className="mb-3 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-slate-500" />
              <h2 id="other-tutorials-title" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700">
                Guias e ferramentas
              </h2>
            </div>
            <div className="space-y-3">
              {otherTutorials.map((tutorial) => (
                <TutorialCard
                  key={tutorial.id}
                  tutorial={tutorial}
                  saved={progress[tutorial.id]}
                  onStart={() => void startTutorial(tutorial.id, {
                    restart: progress[tutorial.id]?.status === 'completed',
                  })}
                />
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
