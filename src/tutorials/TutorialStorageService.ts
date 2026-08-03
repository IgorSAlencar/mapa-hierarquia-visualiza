import type { TutorialProgress } from './tutorialTypes';

const STORAGE_KEY = 'mapa-comercial:tutorial-progress';
const STORAGE_SCHEMA_VERSION = 1;

interface StoredTutorialState {
  schemaVersion: number;
  tutorials: Record<string, TutorialProgress>;
}

const memoryState: StoredTutorialState = {
  schemaVersion: STORAGE_SCHEMA_VERSION,
  tutorials: {},
};

function isProgress(value: unknown): value is TutorialProgress {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<TutorialProgress>;
  return typeof item.tutorialId === 'string'
    && Number.isInteger(item.version)
    && Number.isInteger(item.currentStep)
    && ['not_started', 'in_progress', 'completed', 'skipped'].includes(String(item.status))
    && typeof item.updatedAt === 'string';
}

function availableStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = `${STORAGE_KEY}:probe`;
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return window.localStorage;
  } catch {
    return null;
  }
}

function readState(): StoredTutorialState {
  const storage = availableStorage();
  if (!storage) return memoryState;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return memoryState;
    const parsed = JSON.parse(raw) as Partial<StoredTutorialState>;
    const tutorials = Object.fromEntries(
      Object.entries(parsed.tutorials ?? {}).filter(([, value]) => isProgress(value)),
    );
    memoryState.tutorials = tutorials;
    return { schemaVersion: STORAGE_SCHEMA_VERSION, tutorials };
  } catch {
    return memoryState;
  }
}

function writeState(state: StoredTutorialState) {
  memoryState.tutorials = { ...state.tutorials };
  const storage = availableStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // O estado em memória mantém o progresso durante a sessão.
  }
}

function updateProgress(tutorialId: string, update: (current?: TutorialProgress) => TutorialProgress) {
  const state = readState();
  const progress = update(state.tutorials[tutorialId]);
  writeState({
    schemaVersion: STORAGE_SCHEMA_VERSION,
    tutorials: { ...state.tutorials, [tutorialId]: progress },
  });
  return progress;
}

export const TutorialStorageService = {
  key: STORAGE_KEY,

  getTutorialProgress(tutorialId: string): TutorialProgress | undefined {
    return readState().tutorials[tutorialId];
  },

  getAllTutorialProgress(): Record<string, TutorialProgress> {
    return { ...readState().tutorials };
  },

  startTutorial(tutorialId: string, version: number, currentStep = 0, expectedRoute?: string) {
    return updateProgress(tutorialId, (current) => ({
      tutorialId,
      version,
      status: 'in_progress',
      currentStep,
      startedAt: current?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expectedRoute,
    }));
  },

  saveTutorialStep(tutorialId: string, step: number, version?: number, expectedRoute?: string) {
    return updateProgress(tutorialId, (current) => ({
      tutorialId,
      version: version ?? current?.version ?? 1,
      status: 'in_progress',
      currentStep: Math.max(0, step),
      startedAt: current?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expectedRoute,
    }));
  },

  completeTutorial(tutorialId: string, version: number, lastStep: number) {
    return updateProgress(tutorialId, (current) => ({
      tutorialId,
      version,
      status: 'completed',
      currentStep: Math.max(0, lastStep),
      startedAt: current?.startedAt,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
  },

  skipTutorial(tutorialId: string, version: number, currentStep: number) {
    return updateProgress(tutorialId, (current) => ({
      tutorialId,
      version,
      status: 'skipped',
      currentStep: Math.max(0, currentStep),
      startedAt: current?.startedAt,
      updatedAt: new Date().toISOString(),
    }));
  },

  restartTutorial(tutorialId: string, version: number) {
    return this.startTutorial(tutorialId, version, 0);
  },

  hasCompletedTutorial(tutorialId: string, version: number) {
    const progress = this.getTutorialProgress(tutorialId);
    return progress?.status === 'completed' && progress.version >= version;
  },
};

