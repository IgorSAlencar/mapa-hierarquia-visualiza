import type { TutorialMapDemo, TutorialSection } from './tutorialTypes';

export const TUTORIAL_SECTION_EVENT = 'mapa-comercial:tutorial-section';
export const TUTORIAL_SESSION_EVENT = 'mapa-comercial:tutorial-session';
export const TUTORIAL_ACTION_EVENT = 'mapa-comercial:tutorial-action';
export const TUTORIAL_MAP_DEMO_EVENT = 'mapa-comercial:tutorial-map-demo';
export const TUTORIAL_NAV_EVENT = 'mapa-comercial:tutorial-nav';
/** Painel de roteiro mudou de tela por ação do usuário (origem→destino→prioridade). */
export const TUTORIAL_PANEL_SCREEN_EVENT = 'mapa-comercial:tutorial-panel-screen';

export interface TutorialSectionEventDetail {
  section: TutorialSection;
  panelStep?: number;
}

export interface TutorialSessionEventDetail {
  state: 'started' | 'finished';
}

export interface TutorialActionEventDetail {
  action: string;
}

export interface TutorialPanelScreenEventDetail {
  section: TutorialSection;
  panelStep: number;
}

export interface TutorialMapDemoEventDetail {
  mode: TutorialMapDemo;
}

export interface TutorialNavEventDetail {
  action: 'next' | 'previous';
}

type TutorialNavHandler = (action: TutorialNavEventDetail['action']) => void;

let tutorialNavHandler: TutorialNavHandler | null = null;

/** Registro direto — evita depender só de CustomEvent sob o overlay do Driver. */
export function setTutorialNavHandler(handler: TutorialNavHandler | null) {
  tutorialNavHandler = handler;
}

export function requestTutorialSection(section: TutorialSection, panelStep?: number) {
  window.dispatchEvent(new CustomEvent<TutorialSectionEventDetail>(
    TUTORIAL_SECTION_EVENT,
    { detail: { section, panelStep } },
  ));
}

export function announceTutorialSession(state: TutorialSessionEventDetail['state']) {
  window.dispatchEvent(new CustomEvent<TutorialSessionEventDetail>(
    TUTORIAL_SESSION_EVENT,
    { detail: { state } },
  ));
}

export function reportTutorialAction(action: string) {
  window.dispatchEvent(new CustomEvent<TutorialActionEventDetail>(
    TUTORIAL_ACTION_EVENT,
    { detail: { action } },
  ));
}

/** Emite quando o usuário avança/volta telas do planejador (não quando o tutorial força a tela). */
export function announceTutorialPanelScreen(
  section: TutorialSection,
  panelStep: number,
) {
  window.dispatchEvent(new CustomEvent<TutorialPanelScreenEventDetail>(
    TUTORIAL_PANEL_SCREEN_EVENT,
    { detail: { section, panelStep } },
  ));
}

export function requestTutorialMapDemo(mode: TutorialMapDemo) {
  window.dispatchEvent(new CustomEvent<TutorialMapDemoEventDetail>(
    TUTORIAL_MAP_DEMO_EVENT,
    { detail: { mode } },
  ));
}

export function requestTutorialNav(action: TutorialNavEventDetail['action']) {
  if (tutorialNavHandler) {
    tutorialNavHandler(action);
    return;
  }
  window.dispatchEvent(new CustomEvent<TutorialNavEventDetail>(
    TUTORIAL_NAV_EVENT,
    { detail: { action } },
  ));
}
