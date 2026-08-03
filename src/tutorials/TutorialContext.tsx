import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type DriveStep, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { TutorialCenter } from './TutorialCenter';
import { TutorialStorageService } from './TutorialStorageService';
import {
  TUTORIAL_ACTION_EVENT,
  TUTORIAL_NAV_EVENT,
  TUTORIAL_PANEL_SCREEN_EVENT,
  announceTutorialSession,
  requestTutorialMapDemo,
  requestTutorialSection,
  setTutorialNavHandler,
  type TutorialActionEventDetail,
  type TutorialNavEventDetail,
  type TutorialPanelScreenEventDetail,
} from './tutorialEvents';
import { getTutorial, onboardingTutorial, tutorialRegistry } from './tutorialRegistry';
import type { TutorialDefinition, TutorialProgress } from './tutorialTypes';
import './tutorial.css';

interface TutorialContextValue {
  tutorials: TutorialDefinition[];
  progress: Record<string, TutorialProgress>;
  activeTutorial: TutorialDefinition | null;
  activeStep: number;
  centerOpen: boolean;
  openCenter: () => void;
  closeCenter: () => void;
  startTutorial: (tutorialId: string, options?: { restart?: boolean }) => Promise<void>;
  stopTutorial: () => void;
  skipTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextValue | null>(null);

const delay = (milliseconds: number) => new Promise((resolve) => {
  window.setTimeout(resolve, milliseconds);
});

const TUTORIAL_REPOSITIONING_CLASS = 'mapa-tutorial--repositioning';

/** Mapeia a tela do planejador → índice da etapa do tutorial ativo. */
function resolveStepIndexForPanelScreen(
  definition: TutorialDefinition,
  panelStep: number,
  currentIndex: number,
): number | null {
  const matches = definition.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step }) => (
      step.openSection === 'planejar'
      && step.panelStep === panelStep
    ));
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0].index;

  // Mesma tela (ex.: prioridade + gerar em panelStep 4):
  // - se ainda estamos no fluxo anterior, aponta para a primeira (prioridade);
  // - se já passamos dela, mantém/avança para a etapa atual compatível.
  const first = matches[0];
  if (currentIndex < first.index) return first.index;
  const atOrAfter = matches.find((item) => item.index >= currentIndex);
  return atOrAfter?.index ?? matches[matches.length - 1].index;
}

function setTutorialRepositioning(active: boolean) {
  document.documentElement.classList.toggle(TUTORIAL_REPOSITIONING_CLASS, active);
}

async function findTarget(selector: string | undefined, timeoutMs = 900) {
  if (!selector) return undefined;
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const element = document.querySelector(selector);
    if (element instanceof HTMLElement && element.getClientRects().length > 0) return element;
    await delay(50);
  }
  if (import.meta.env.DEV) {
    console.warn(`[tutorial] Alvo indisponível; usando etapa centralizada: ${selector}`);
  }
  return undefined;
}

/** Alvo da etapa, com fallback para o painel do roteiro (evita dummy sem clique). */
function resolveTutorialElement(selector: string | undefined): Element | null {
  if (!selector) return null;
  const primary = document.querySelector(selector);
  if (primary instanceof HTMLElement && primary.getClientRects().length > 0) return primary;
  if (selector.includes('routes-') && !selector.includes('routes-planner')) {
    const planner = document.querySelector('[data-tutorial="routes-planner"]');
    if (planner instanceof HTMLElement && planner.getClientRects().length > 0) return planner;
  }
  return primary;
}

function createDriveSteps(
  definition: TutorialDefinition,
): DriveStep[] {
  return definition.steps.map((step) => {
    const driveStep: DriveStep = {
      ...(step.target ? {
      // Driver.js usa seu alvo central quando a função retorna nulo. O cast
      // mantém a tipagem da biblioteca sem perder esse fallback nativo.
      element: () => resolveTutorialElement(step.target!) as Element,
      } : {}),
      // Jornadas são práticas por padrão: o usuário manipula o controle real.
      // Onboarding e guias rápidos permanecem somente explicativos, salvo opt-in.
      disableActiveInteraction: !(step.allowInteraction ?? (definition.type === 'journey')),
    };
    if (step.presentation === 'hud') return driveStep;
    driveStep.popover = {
      title: step.title,
      description: step.requiresAction
        ? `${step.description} Faça essa ação na tela para continuar.`
        : step.description,
      side: step.placement ?? 'bottom',
      align: step.align ?? 'start',
      showButtons: step.requiresAction
        ? ['previous', 'close']
        : ['previous', 'next', 'close'],
    };
    return driveStep;
  });
}

export const TutorialProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [centerOpen, setCenterOpen] = useState(false);
  const [activeTutorial, setActiveTutorial] = useState<TutorialDefinition | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(() => TutorialStorageService.getAllTutorialProgress());
  const driverRef = useRef<Driver | null>(null);
  const activeDefinitionRef = useRef<TutorialDefinition | null>(null);
  const activeStepRef = useRef(0);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const exitReasonRef = useRef<'pause' | 'skip' | 'complete'>('pause');
  const startingRef = useRef(false);
  const autoStartAttemptedRef = useRef(false);
  const showStepRef = useRef<(index: number) => Promise<void>>(async () => undefined);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const stopRef = useRef<() => void>(() => undefined);
  const skipRef = useRef<() => void>(() => undefined);

  const refreshProgress = useCallback(() => {
    setProgress(TutorialStorageService.getAllTutorialProgress());
  }, []);

  const prepareStep = useCallback(async (definition: TutorialDefinition, index: number) => {
    const step = definition.steps[index];
    if (!step) return;
    const expectedRoute = step.route ?? definition.route;
    if (expectedRoute && window.location.pathname !== expectedRoute) {
      TutorialStorageService.saveTutorialStep(definition.id, index, definition.version, expectedRoute);
      navigate(expectedRoute);
      await delay(250);
    }
    if (step.openSection) {
      requestTutorialSection(step.openSection, step.panelStep);
      // Tempo mínimo para o React montar/trocar a tela do planejador.
      await delay(160);
    }
    document.querySelector('.driver-popover')?.classList.toggle(
      'mapa-tutorial-popover--transitioning-to-hud',
      step.presentation === 'hud',
    );
    requestTutorialMapDemo(step.mapDemo ?? 'clear');
    if (step.mapDemo === 'store-hover' || step.mapDemo === 'store-selected') {
      await findTarget(step.target, step.waitForTargetMs ?? 3000);
      return;
    }
    // Etapas interativas: espera curta pelo alvo; se falhar, o element()
    // cai no painel routes-planner em vez do dummy central.
    if (step.requiresAction || step.allowInteraction) {
      const found = await findTarget(step.target, step.waitForTargetMs ?? 900);
      if (!found && step.target && step.openSection === 'planejar') {
        await findTarget('[data-tutorial="routes-planner"]', 600);
      }
      return;
    }
    void findTarget(step.target, step.waitForTargetMs);
  }, [navigate]);

  const stopTutorial = useCallback(() => {
    exitReasonRef.current = 'pause';
    if (autoAdvanceTimerRef.current != null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    setTutorialRepositioning(false);
    driverRef.current?.destroy();
  }, []);

  const skipTutorial = useCallback(() => {
    const definition = activeDefinitionRef.current;
    const instance = driverRef.current;
    if (!definition || !instance) return;
    const index = instance.getActiveIndex() ?? 0;
    TutorialStorageService.skipTutorial(definition.id, definition.version, index);
    refreshProgress();
    exitReasonRef.current = 'skip';
    setTutorialRepositioning(false);
    instance.destroy();
  }, [refreshProgress]);

  stopRef.current = stopTutorial;
  skipRef.current = skipTutorial;

  const startTutorial = useCallback(async (
    tutorialId: string,
    options?: { restart?: boolean },
  ) => {
    if (startingRef.current) return;
    const definition = getTutorial(tutorialId);
    if (!definition) return;
    startingRef.current = true;
    driverRef.current?.destroy();
    setCenterOpen(false);
    activeDefinitionRef.current = definition;
    setActiveTutorial(definition);
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    exitReasonRef.current = 'pause';

    const saved = TutorialStorageService.getTutorialProgress(definition.id);
    const canContinue = !options?.restart
      && saved?.status === 'in_progress'
      && saved.version === definition.version;
    const startIndex = canContinue
      ? Math.min(saved.currentStep, definition.steps.length - 1)
      : 0;
    TutorialStorageService.startTutorial(
      definition.id,
      definition.version,
      startIndex,
      definition.steps[startIndex]?.route ?? definition.route,
    );
    refreshProgress();
    announceTutorialSession('started');

    try {
      await prepareStep(definition, startIndex);
      const instance = driver({
        steps: createDriveSteps(definition),
        animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        smoothScroll: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        overlayColor: '#020617',
        overlayOpacity: 0.72,
        allowClose: true,
        overlayClickBehavior: 'close',
        allowKeyboardControl: true,
        stagePadding: 8,
        stageRadius: 14,
        popoverOffset: 14,
        popoverClass: 'mapa-tutorial-popover',
        showButtons: ['previous', 'next', 'close'],
        showProgress: true,
        progressText: 'Etapa {{current}} de {{total}}',
        prevBtnText: 'Voltar',
        nextBtnText: 'Próximo',
        doneBtnText: 'Concluir',
        onPopoverRender: (popover, { state }) => {
          const renderedStep = definition.steps[state.activeIndex ?? 0];
          if (renderedStep?.presentation === 'hud') {
            popover.wrapper.classList.add('mapa-tutorial-popover--hud');
            popover.wrapper.setAttribute('aria-hidden', 'true');
            return;
          }
          popover.wrapper.classList.remove('mapa-tutorial-popover--hud');
          popover.wrapper.removeAttribute('aria-hidden');
          popover.wrapper.setAttribute('role', 'dialog');
          popover.wrapper.setAttribute('aria-modal', 'true');
          popover.wrapper.setAttribute('aria-label', 'Tutorial guiado');
          popover.closeButton.setAttribute('aria-label', 'Fechar e continuar depois');
          if (!popover.footer.querySelector('[data-tutorial-skip]')) {
            const skipButton = document.createElement('button');
            skipButton.type = 'button';
            skipButton.dataset.tutorialSkip = 'true';
            skipButton.className = 'mapa-tutorial-skip';
            skipButton.textContent = 'Pular tutorial';
            skipButton.setAttribute('aria-label', 'Pular este tutorial');
            skipButton.addEventListener('click', () => skipRef.current());
            popover.footer.prepend(skipButton);
          }
        },
        onHighlighted: (_element, _step, { state, driver: activeDriver }) => {
          const index = state.activeIndex ?? 0;
          if (autoAdvanceTimerRef.current != null) {
            window.clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
          }
          activeStepRef.current = index;
          setActiveStep(index);
          TutorialStorageService.saveTutorialStep(
            definition.id,
            index,
            definition.version,
            definition.steps[index]?.route ?? definition.route,
          );
          refreshProgress();
          const highlightedStep = definition.steps[index];
          // Painel de origem/destino cresce ao abrir buscas; redesenha o recorte.
          if (highlightedStep?.allowInteraction && _element instanceof HTMLElement) {
            window.requestAnimationFrame(() => {
              try {
                activeDriver.refresh();
              } catch {
                /* tutorial pode ter encerrado */
              }
            });
          }
          const autoAdvanceMs = highlightedStep?.autoAdvanceMs;
          if (autoAdvanceMs && index < definition.steps.length - 1) {
            autoAdvanceTimerRef.current = window.setTimeout(() => {
              autoAdvanceTimerRef.current = null;
              void showStepRef.current(index + 1);
            }, autoAdvanceMs);
          }
        },
        onNextClick: (_element, _step, { state }) => {
          const index = state.activeIndex ?? 0;
          if (definition.steps[index]?.requiresAction) return;
          if (index >= definition.steps.length - 1) {
            TutorialStorageService.completeTutorial(definition.id, definition.version, index);
            refreshProgress();
            exitReasonRef.current = 'complete';
            driverRef.current?.destroy();
            return;
          }
          void showStepRef.current(index + 1);
        },
        onPrevClick: (_element, _step, { state }) => {
          void showStepRef.current(Math.max(0, (state.activeIndex ?? 0) - 1));
        },
        onCloseClick: () => stopRef.current(),
        onDestroyed: () => {
          if (autoAdvanceTimerRef.current != null) {
            window.clearTimeout(autoAdvanceTimerRef.current);
            autoAdvanceTimerRef.current = null;
          }
          setTutorialRepositioning(false);
          driverRef.current = null;
          activeDefinitionRef.current = null;
          setActiveTutorial(null);
          requestTutorialMapDemo('clear');
          announceTutorialSession('finished');
          refreshProgress();
          window.setTimeout(() => returnFocusRef.current?.focus(), 0);
          startingRef.current = false;
        },
      });
      driverRef.current = instance;
      showStepRef.current = async (index: number) => {
        if (!driverRef.current || activeDefinitionRef.current?.id !== definition.id) return;
        // Action + troca de tela do painel podem disparar o mesmo avanço juntos.
        if (index === activeStepRef.current) return;
        const previousIndex = activeStepRef.current;
        activeStepRef.current = index;
        setActiveStep(index);
        if (autoAdvanceTimerRef.current != null) {
          window.clearTimeout(autoAdvanceTimerRef.current);
          autoAdvanceTimerRef.current = null;
        }

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const current = driverRef.current;
        const nextStep = definition.steps[index];
        const previousStep = definition.steps[previousIndex];
        // Véu esconde o card. Em etapas interativas do planejador o usuário
        // precisa clicar na hora — não mascara a troca.
        const plannerInteractiveSwap = Boolean(
          nextStep?.allowInteraction
          && nextStep.openSection === 'planejar'
          && previousStep?.openSection === 'planejar',
        );
        const shouldMaskOrphanHole = nextStep?.mapDemo !== 'store-hover' && !plannerInteractiveSwap;

        if (shouldMaskOrphanHole) {
          setTutorialRepositioning(true);
          current.setConfig({
            ...current.getConfig(),
            animate: false,
          });
        }

        try {
          await prepareStep(definition, index);
          const active = driverRef.current;
          if (!active || activeDefinitionRef.current?.id !== definition.id) return;
          active.moveTo(index);
          if (shouldMaskOrphanHole) {
            // Espera o Driver pintar o novo recorte antes de tirar o véu sólido.
            await new Promise<void>((resolve) => {
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => resolve());
              });
            });
          }
        } finally {
          setTutorialRepositioning(false);
          const active = driverRef.current;
          if (active) {
            active.setConfig({
              ...active.getConfig(),
              animate: !prefersReducedMotion,
            });
          }
        }
      };
      instance.drive(startIndex);
      startingRef.current = false;
    } catch (error) {
      startingRef.current = false;
      activeDefinitionRef.current = null;
      setActiveTutorial(null);
      announceTutorialSession('finished');
      if (import.meta.env.DEV) console.error('[tutorial] Não foi possível iniciar o tutorial.', error);
    }
  }, [prepareStep, refreshProgress]);

  useEffect(() => {
    if (location.pathname !== '/' || autoStartAttemptedRef.current) return;
    const saved = TutorialStorageService.getTutorialProgress(onboardingTutorial.id);
    const shouldReplay = Boolean(
      saved
      && onboardingTutorial.forceReplayOnVersionChange
      && saved.version < onboardingTutorial.version,
    );
    if (saved && !shouldReplay) return;
    const timer = window.setTimeout(() => {
      if (!document.querySelector('[data-tutorial="app-identity"]')) return;
      autoStartAttemptedRef.current = true;
      void startTutorial(onboardingTutorial.id);
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [location.pathname, startTutorial]);

  useEffect(() => {
    const onTutorialAction = (event: Event) => {
      const definition = activeDefinitionRef.current;
      const instance = driverRef.current;
      if (!definition || !instance) return;
      // Preferir activeStepRef: getActiveIndex atrasa durante prepareStep/moveTo
      // e podia casar a ação com a etapa errada.
      const index = activeStepRef.current ?? instance.getActiveIndex() ?? 0;
      const expectedAction = definition.steps[index]?.requiresAction;
      const { action } = (event as CustomEvent<TutorialActionEventDetail>).detail;
      if (!expectedAction || action !== expectedAction) return;
      if (index >= definition.steps.length - 1) {
        TutorialStorageService.completeTutorial(definition.id, definition.version, index);
        refreshProgress();
        exitReasonRef.current = 'complete';
        instance.destroy();
        return;
      }
      void showStepRef.current(index + 1);
    };
    window.addEventListener(TUTORIAL_ACTION_EVENT, onTutorialAction);
    return () => window.removeEventListener(TUTORIAL_ACTION_EVENT, onTutorialAction);
  }, [refreshProgress]);

  // Voltar no painel sincroniza o tutorial. Avanço só via reportTutorialAction
  // (seleção de origem/destino) — sync forward forçava prioridade cedo demais.
  useEffect(() => {
    const onPanelScreen = (event: Event) => {
      const definition = activeDefinitionRef.current;
      const instance = driverRef.current;
      if (!definition || !instance) return;
      const { section, panelStep } = (event as CustomEvent<TutorialPanelScreenEventDetail>).detail;
      if (section !== 'planejar') return;

      const currentIndex = activeStepRef.current ?? instance.getActiveIndex() ?? 0;
      const currentStep = definition.steps[currentIndex];
      if (!currentStep?.openSection || currentStep.openSection !== 'planejar') return;
      if (currentStep.panelStep == null) return;

      const targetIndex = resolveStepIndexForPanelScreen(definition, panelStep, currentIndex);
      if (targetIndex == null || targetIndex === currentIndex) return;
      if (targetIndex > currentIndex) return;
      void showStepRef.current(targetIndex);
    };
    window.addEventListener(TUTORIAL_PANEL_SCREEN_EVENT, onPanelScreen);
    return () => window.removeEventListener(TUTORIAL_PANEL_SCREEN_EVENT, onPanelScreen);
  }, []);

  useEffect(() => {
    const advanceFromHud = (action: TutorialNavEventDetail['action']) => {
      const definition = activeDefinitionRef.current;
      const instance = driverRef.current;
      if (!definition || !instance) return;
      const index = activeStepRef.current ?? instance.getActiveIndex() ?? 0;
      if (action === 'previous') {
        void showStepRef.current(Math.max(0, index - 1));
        return;
      }
      if (index >= definition.steps.length - 1) {
        TutorialStorageService.completeTutorial(definition.id, definition.version, index);
        refreshProgress();
        exitReasonRef.current = 'complete';
        instance.destroy();
        return;
      }
      void showStepRef.current(index + 1);
    };

    setTutorialNavHandler(advanceFromHud);
    const onTutorialNav = (event: Event) => {
      advanceFromHud((event as CustomEvent<TutorialNavEventDetail>).detail.action);
    };
    window.addEventListener(TUTORIAL_NAV_EVENT, onTutorialNav);
    return () => {
      setTutorialNavHandler(null);
      window.removeEventListener(TUTORIAL_NAV_EVENT, onTutorialNav);
    };
  }, [refreshProgress]);

  useEffect(() => () => driverRef.current?.destroy(), []);

  const value = useMemo<TutorialContextValue>(() => ({
    tutorials: tutorialRegistry,
    progress,
    activeTutorial,
    activeStep,
    centerOpen,
    openCenter: () => setCenterOpen(true),
    closeCenter: () => setCenterOpen(false),
    startTutorial,
    stopTutorial,
    skipTutorial,
  }), [activeStep, activeTutorial, centerOpen, progress, skipTutorial, startTutorial, stopTutorial]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      <TutorialCenter />
    </TutorialContext.Provider>
  );
};

// Provider e hook permanecem juntos para preservar uma API pública simples.
// eslint-disable-next-line react-refresh/only-export-components
export function useTutorial() {
  const context = useContext(TutorialContext);
  if (!context) throw new Error('useTutorial deve ser usado dentro de TutorialProvider.');
  return context;
}
