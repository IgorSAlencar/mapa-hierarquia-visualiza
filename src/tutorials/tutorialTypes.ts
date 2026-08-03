export type TutorialType = 'onboarding' | 'journey' | 'feature';

export type TutorialPlacement = 'top' | 'bottom' | 'left' | 'right' | 'over';

export type TutorialSection = 'visitas' | 'planejar' | 'distancia' | 'heatmap';

export type TutorialMapDemo =
  | 'clear'
  | 'prepare-agencies'
  | 'agency-focus'
  | 'prepare-stores'
  | 'store-focus'
  | 'store-hover-ready'
  | 'store-hover'
  | 'store-selected';

export interface TutorialStep {
  id: string;
  title: string;
  description: string;
  target?: string;
  placement?: TutorialPlacement;
  align?: 'start' | 'center' | 'end';
  route?: string;
  openSection?: TutorialSection;
  panelStep?: number;
  allowInteraction?: boolean;
  requiresAction?: string;
  presentation?: 'popover' | 'hud';
  autoAdvanceMs?: number;
  mapDemo?: TutorialMapDemo;
  waitForTargetMs?: number;
  assistantPose?: 'idle' | 'pointing' | 'thinking' | 'alert';
}

export interface TutorialDefinition {
  id: string;
  type: TutorialType;
  title: string;
  description: string;
  route?: string;
  category: string;
  version: number;
  recommendedOrder?: number;
  estimatedMinutes?: number;
  forceReplayOnVersionChange?: boolean;
  isNew?: boolean;
  enabled?: boolean;
  steps: TutorialStep[];
}

export type TutorialProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped';

export interface TutorialProgress {
  tutorialId: string;
  version: number;
  status: TutorialProgressStatus;
  currentStep: number;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  expectedRoute?: string;
}

export type TutorialDisplayStatus =
  | 'new'
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'updated';
