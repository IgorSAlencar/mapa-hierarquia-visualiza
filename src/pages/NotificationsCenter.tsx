import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  executeNotificationAction,
  fetchNotifications,
  formatNotificationMessage,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDestinationUrl,
  snoozeNotification,
  type AppNotification,
} from '@/lib/notificationsApi';

const labels: Record<string, string> = {
  VER_ROTEIRO: 'Ver roteiro',
  VER_VISITA: 'Ver visita',
  REGISTRAR_VISITA: 'Registrar visita',
  CONFIRMAR_CIENCIA: 'Confirmar ciência',
  REGISTRAR_ACOMPANHAMENTO: 'Registrar acompanhamento',
  REAGENDAR: 'Reagendar visita',
  REAGENDAR_CONTATO: 'Reagendar contato',
  MARCAR_SEM_CONTINUIDADE: 'Marcar sem continuidade',
  ADIAR_LEMBRETE: 'Adiar lembrete',
  SOLICITAR_ACOMPANHAMENTO: 'Solicitar acompanhamento',
};

type DialogAction = {
  notification: AppNotification;
  action: 'REGISTRAR_ACOMPANHAMENTO' | 'REAGENDAR_CONTATO' | 'MARCAR_SEM_CONTINUIDADE';
} | null;

function localDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const NotificationsCenter: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'TODAS' | 'NOVA' | 'LIDA'>('TODAS');
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [notes, setNotes] = useState('');
  const [nextAt, setNextAt] = useState(
    localDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000))
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await fetchNotifications({
        limit: 100,
        status: filter === 'TODAS' ? undefined : filter,
      });
      setItems(page.items);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Falha ao carregar notificações.');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const replace = (notification: AppNotification) => {
    setItems((current) => current.map((item) =>
      item.id === notification.id ? notification : item
    ));
  };

  const execute = async (notification: AppNotification, action: string) => {
    try {
      if (['VER_ROTEIRO', 'VER_VISITA', 'REGISTRAR_VISITA', 'REAGENDAR'].includes(action)) {
        if (action !== 'REAGENDAR') {
          replace((await executeNotificationAction(notification, action)).notification);
        } else if (!notification.readAt) {
          replace(await markNotificationRead(notification));
        }
        navigate(notificationDestinationUrl(notification, action));
        return;
      }
      if (action === 'ADIAR_LEMBRETE') {
        const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        replace(await snoozeNotification(notification, until));
        toast.success('Lembrete adiado por 24 horas.');
        return;
      }
      if (['REGISTRAR_ACOMPANHAMENTO', 'REAGENDAR_CONTATO', 'MARCAR_SEM_CONTINUIDADE'].includes(action)) {
        setNotes('');
        setNextAt(localDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)));
        setDialogAction({
          notification,
          action: action as NonNullable<DialogAction>['action'],
        });
        return;
      }
      replace((await executeNotificationAction(notification, action)).notification);
      toast.success('Ação registrada.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível executar a ação.');
    }
  };

  const confirmDialogAction = async () => {
    if (!dialogAction) return;
    if (!notes.trim()) {
      toast.error('Informe uma observação.');
      return;
    }
    try {
      const payload = dialogAction.action === 'REAGENDAR_CONTATO'
        ? { notes, nextAt: new Date(nextAt).toISOString() }
        : { notes };
      replace((await executeNotificationAction(
        dialogAction.notification,
        dialogAction.action,
        payload
      )).notification);
      setDialogAction(null);
      toast.success('Acompanhamento atualizado.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Falha ao atualizar acompanhamento.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
            <Bell className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-950">Central de notificações</h1>
            <p className="text-xs text-slate-500">Leitura não encerra a pendência; a ação comercial é que resolve.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Atualizar
          </Button>
          <Button
            size="sm"
            onClick={() => void markAllNotificationsRead().then(() => load())}
          >
            <CheckCheck className="mr-2 h-4 w-4" /> Marcar todas como lidas
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-6">
        <div className="mb-4 flex gap-2">
          {(['TODAS', 'NOVA', 'LIDA'] as const).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-full border px-4 py-1.5 text-xs font-bold',
                filter === value
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600'
              )}
            >
              {value === 'TODAS' ? 'Todas' : value === 'NOVA' ? 'Não lidas' : 'Lidas'}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-20 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando...
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-20 text-center text-sm text-slate-500">
            Nenhuma notificação nesta visualização.
          </div>
        )}
        <div className="space-y-3">
          {items.map((notification) => (
            <article
              key={notification.id}
              className={cn(
                'rounded-2xl border bg-white p-5 shadow-sm',
                notification.priority === 'CRITICA' && 'border-rose-300',
                notification.priority === 'ALTA' && 'border-amber-300'
              )}
            >
              <div className="flex items-start gap-3">
                <span className={cn(
                  'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
                  notification.readAt ? 'bg-slate-300' : 'bg-blue-600'
                )} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-slate-950">{notification.title}</h2>
                    {notification.deliveryCount > 1 && (
                      <span className="text-[10px] text-slate-400">{notification.deliveryCount}ª entrega</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">
                    {formatNotificationMessage(notification.message)}
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock3 className="h-3 w-3" />
                    {new Date(notification.lastDeliveredAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                {!notification.readAt && (
                  <Button variant="ghost" size="sm" onClick={() => void markNotificationRead(notification).then(replace)}>
                    Marcar como lida
                  </Button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 pl-5">
                {notification.actions.map((action) => (
                  <Button
                    key={action}
                    size="sm"
                    variant={action.startsWith('VER_') ? 'outline' : 'default'}
                    onClick={() => void execute(notification, action)}
                  >
                    {labels[action] ?? action}
                    {action.startsWith('VER_') && <ExternalLink className="ml-2 h-3.5 w-3.5" />}
                  </Button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </main>

      <Dialog open={Boolean(dialogAction)} onOpenChange={(open) => !open && setDialogAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogAction ? labels[dialogAction.action] : 'Acompanhamento'}</DialogTitle>
            <DialogDescription>
              Este registro será incluído no histórico imutável da visita.
            </DialogDescription>
          </DialogHeader>
          {dialogAction?.action === 'REAGENDAR_CONTATO' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold">Nova data e horário</span>
              <input className="field" type="datetime-local" value={nextAt} onChange={(event) => setNextAt(event.target.value)} />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold">Observação obrigatória</span>
            <Textarea rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAction(null)}>Cancelar</Button>
            <Button onClick={() => void confirmDialogAction()}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotificationsCenter;
