import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { requestTutorialNav } from './tutorialEvents';

type HudAnchorName = 'identity' | 'context' | 'operation' | 'results';

interface HudCallout {
  anchor: HudAnchorName;
  number: string;
  label: string;
}

interface PositionedCallout extends HudCallout {
  anchorX: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  align: 'left' | 'right';
  labelWidth: number;
}

interface HudLayout {
  callouts: PositionedCallout[];
  actions: { left: number; top: number };
}

const CALLOUTS: HudCallout[] = [
  {
    anchor: 'identity',
    number: '01',
    label: 'Nome, Chave da Loja e Agência Vinculada',
  },
  {
    anchor: 'context',
    number: '02',
    label: 'Tipo de Posto, Segmento, Gerente Comercial',
  },
  {
    anchor: 'operation',
    number: '03',
    label: 'Tablet, CheckList e Situação de Bloqueio',
  },
  {
    anchor: 'results',
    number: '04',
    label: 'Cielo, Proposta de Valor e Última Transação',
  },
];

function measureHudLayout(): HudLayout | null {
  const card = document.querySelector('[data-tutorial="map-store-hover"]');
  if (!(card instanceof HTMLElement)) return null;

  const cardRect = card.getBoundingClientRect();
  const mapFrame = card.closest('.mapboxgl-map');
  const mapRect = mapFrame instanceof HTMLElement
    ? mapFrame.getBoundingClientRect()
    : new DOMRect(0, 0, window.innerWidth, window.innerHeight);
  const frame = {
    left: Math.max(14, mapRect.left + 16),
    right: Math.min(window.innerWidth - 14, mapRect.right - 16),
    top: Math.max(14, mapRect.top + 16),
    bottom: Math.min(window.innerHeight - 14, mapRect.bottom - 16),
  };
  const frameWidth = Math.max(1, frame.right - frame.left);
  const sideLabelWidth = Math.min(205, Math.max(150, frameWidth * 0.24));
  const leftRoom = cardRect.left - frame.left;
  const rightRoom = frame.right - cardRect.right;
  const sideGap = 24;
  const canUseLeft = leftRoom >= sideLabelWidth + sideGap;
  const canUseRight = rightRoom >= sideLabelWidth + sideGap;
  const useSideLayout = canUseLeft || canUseRight;
  const compactLabelWidth = Math.min(165, Math.max(120, (frameWidth - 54) / 2));

  const clampY = (value: number) => Math.min(frame.bottom - 24, Math.max(frame.top + 24, value));

  const callouts = CALLOUTS.flatMap((callout, index) => {
    const anchor = card.querySelector(
      `[data-tutorial-hud-anchor="${callout.anchor}"]`,
    );
    if (!(anchor instanceof HTMLElement)) return [];
    const anchorRect = anchor.getBoundingClientRect();
    const anchorY = anchorRect.top + anchorRect.height / 2;
    // Ponto na borda lateral voltada ao label — não no centro do bloco
    // (anchors full-width faziam a linha sair do meio do card).
    const sideAnchorX = (fromLeft: boolean) => (
      fromLeft ? anchorRect.left + 4 : anchorRect.right - 4
    );

    if (!useSideLayout) {
      const placeAtLeft = index % 2 === 0;
      const placeAbove = index < 2;
      return [{
        ...callout,
        anchorX: sideAnchorX(placeAtLeft),
        anchorY,
        labelX: placeAtLeft ? frame.left : frame.right,
        labelY: placeAbove
          ? clampY(Math.min(cardRect.top - 34, frame.top + 30 + index * 27))
          : clampY(Math.max(cardRect.bottom + 34, frame.bottom - 58 + (index - 2) * 27)),
        align: placeAtLeft ? 'left' : 'right',
        labelWidth: compactLabelWidth,
      } satisfies PositionedCallout];
    }

    const preferLeft = index % 2 === 0;
    const placeLeft = preferLeft ? canUseLeft : !canUseRight;
    const labelX = placeLeft
      ? Math.max(frame.left + sideLabelWidth, cardRect.left - sideGap)
      : Math.min(frame.right - sideLabelWidth, cardRect.right + sideGap);
    return [{
      ...callout,
      anchorX: sideAnchorX(placeLeft),
      anchorY,
      labelX,
      labelY: clampY(anchorY + (index < 2 ? -22 : 22)),
      align: placeLeft ? 'right' : 'left',
      labelWidth: sideLabelWidth,
    } satisfies PositionedCallout];
  });

  if (callouts.length === 0) return null;

  // Botão ancorado sob o card do tutorial, não no canto da viewport.
  // No layout compacto, labels 03/04 ficam abaixo — empurra o botão além deles.
  const actionGap = useSideLayout ? 14 : 72;
  const actionHeight = 36;
  const preferredTop = cardRect.bottom + actionGap;
  const actionsTop = preferredTop + actionHeight <= frame.bottom
    ? preferredTop
    : Math.max(frame.top, cardRect.top - actionGap - actionHeight);
  const actionsLeft = Math.min(
    frame.right - 12,
    Math.max(frame.left + 12, cardRect.left + cardRect.width / 2),
  );

  return {
    callouts,
    actions: { left: actionsLeft, top: actionsTop },
  };
}

interface StoreTutorialHudProps {
  active: boolean;
}

export const StoreTutorialHud: React.FC<StoreTutorialHudProps> = ({ active }) => {
  const [layout, setLayout] = useState<HudLayout | null>(null);
  const root = useMemo(() => (typeof document === 'undefined' ? null : document.body), []);

  useEffect(() => {
    if (!active) {
      setLayout(null);
      return;
    }

    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setLayout(measureHudLayout()));
    };
    const observer = new ResizeObserver(update);
    const card = document.querySelector('[data-tutorial="map-store-hover"]');
    if (card instanceof HTMLElement) observer.observe(card);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    update();

    const settleTimer = window.setInterval(update, 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(settleTimer);
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [active]);

  if (!active || !root || !layout) return null;
  const { callouts: positions, actions } = layout;

  return createPortal(
    <div className="tutorial-store-hud" aria-live="polite">
      <span className="sr-only">
        Pré-visualização da loja: identidade, contexto comercial, situação operacional e resultados.
      </span>
      <svg className="tutorial-store-hud-lines" aria-hidden="true">
        {positions.map((callout) => {
          const labelLeft = callout.align === 'left'
            ? callout.labelX
            : callout.labelX - callout.labelWidth;
          const labelRight = labelLeft + callout.labelWidth;
          const lineEndX = callout.anchorX < labelLeft
            ? labelLeft - 9
            : callout.anchorX > labelRight
              ? labelRight + 9
              : Math.min(labelRight - 12, Math.max(labelLeft + 12, callout.anchorX));
          return (
            <g key={callout.anchor}>
              <line
                x1={callout.anchorX}
                y1={callout.anchorY}
                x2={lineEndX}
                y2={callout.labelY}
              />
              <circle cx={callout.anchorX} cy={callout.anchorY} r="3" />
              <circle cx={lineEndX} cy={callout.labelY} r="2" />
            </g>
          );
        })}
      </svg>
      {positions.map((callout) => (
        <div
          key={callout.anchor}
          className={`tutorial-store-hud-label tutorial-store-hud-label--${callout.align}`}
          style={{
            left: callout.labelX,
            top: callout.labelY,
            '--tutorial-hud-label-width': `${callout.labelWidth}px`,
          } as React.CSSProperties}
        >
          <span>{callout.number}</span>
          {callout.label}
        </div>
      ))}
      <div
        className="tutorial-store-hud-actions"
        style={{ left: actions.left, top: actions.top }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="tutorial-store-hud-prev"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            requestTutorialNav('previous');
          }}
        >
          Voltar
        </button>
        <button
          type="button"
          className="tutorial-store-hud-next"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            requestTutorialNav('next');
          }}
        >
          Próximo
        </button>
      </div>
    </div>,
    root,
  );
};
