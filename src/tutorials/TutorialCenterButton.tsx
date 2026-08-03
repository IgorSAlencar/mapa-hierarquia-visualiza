import { BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTutorial } from './TutorialContext';

export function TutorialCenterButton() {
  const { openCenter } = useTutorial();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={openCenter}
          data-tutorial="header-tutorial-center"
          aria-label="Abrir Central de Tutoriais"
          className="text-slate-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Central de Tutoriais</TooltipContent>
    </Tooltip>
  );
}

