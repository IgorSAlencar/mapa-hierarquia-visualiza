import React from 'react';
import { useTutorial } from './TutorialContext';

interface TutorialTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  tutorialId: string;
  restart?: boolean;
}

export const TutorialTrigger = React.forwardRef<HTMLButtonElement, TutorialTriggerProps>(
  ({ tutorialId, restart, onClick, ...props }, ref) => {
    const { startTutorial } = useTutorial();
    return (
      <button
        {...props}
        ref={ref}
        type="button"
        onClick={(event) => {
          onClick?.(event);
          if (!event.defaultPrevented) void startTutorial(tutorialId, { restart });
        }}
      />
    );
  },
);

TutorialTrigger.displayName = 'TutorialTrigger';

