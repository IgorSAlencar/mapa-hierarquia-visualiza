import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  Clock3,
  ExternalLink,
  Loader2,
  MapPinned,
  Navigation,
  Route,
  Target,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  executeNotificationAction,
  fetchNotifications,
  fetchUnreadCount,
  formatNotificationMessage,
  markAllNotificationsRead,
  markNotificationRead,
  notificationDestinationUrl,
  type AppNotification,
} from '@/lib/notificationsApi';

const actionLabel: Record<string, string> = {
  VER_ROTEIRO: 'Ver roteiro',
  VER_VISITA: 'Ver visita',
  REGISTRAR_VISITA: 'Registrar visita',
  CONFIRMAR_CIENCIA: 'Confirmar ciência',
  REGISTRAR_ACOMPANHAMENTO: 'Registrar acompanhamento',
  REAGENDAR: 'Reagendar',
  REAGENDAR_CONTATO: 'Reagendar contato',
  MARCAR_SEM_CONTINUIDADE: 'Sem continuidade',
  ADIAR_LEMBRETE: 'Adiar lembrete',
};

const PRIMARY_ACTIONS = new Set([
  'VER_ROTEIRO',
  'VER_VISITA',
  'REGISTRAR_VISITA',
  'CONFIRMAR_CIENCIA',
]);

const priorityMeta: Record<
  AppNotification['priority'],
  { bar: string; iconWrap: string }
> = {
  CRITICA: {
    bar: 'bg-rose-500',
    iconWrap: 'border border-rose-200 bg-rose-50 text-rose-600',
  },
  ALTA: {
    bar: 'bg-amber-400',
    iconWrap: 'border border-amber-200 bg-amber-50 text-amber-700',
  },
  NORMAL: {
    bar: 'bg-blue-500',
    iconWrap: 'border border-blue-200 bg-blue-50 text-blue-600',
  },
  BAIXA: {
    bar: 'bg-slate-300',
    iconWrap: 'border border-slate-200 bg-slate-50 text-slate-500',
  },
};

function typeIcon(type: string) {
  const code = type.toUpperCase();
  if (code.includes('ROTEIRO')) return Route;
  if (code.includes('VISITA') || code.includes('PARADA')) return MapPinned;
  if (code.includes('MAPA')) return Navigation;
  if (code.includes('CRIT') || code.includes('ATRASO') || code.includes('ESCAL')) return AlertTriangle;
  return Target;
}

function typeLabel(type: string) {
  const code = type.toUpperCase();
  if (code.includes('ROTEIRO')) return 'Roteiro';
  if (code.includes('VISITA')) return 'Visita';
  if (code.includes('LEMBRETE')) return 'Lembrete';
  if (code.includes('ACOMPANH')) return 'Acompanhamento';
  return 'Missão';
}

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (withList = open) => {
    try {
      const [count, page] = await Promise.all([
        fetchUnreadCount(),
        withList ? fetchNotifications({ limit: 8 }) : Promise.resolve(null),
      ]);
      setUnread(count);
      if (page) setItems(page.items);
    } catch {
      // O sino não interrompe a jornada principal se o serviço estiver indisponível.
    }
  }, [open]);

  useEffect(() => {
    void refresh(false);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(open);
    }, 5_000);
    const invalidate = () => void refresh(open);
    const refreshOnFocus = () => void refresh(open);
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(open);
    };
    window.addEventListener('mapa-notifications-invalidated', invalidate);
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('mapa-notifications-invalidated', invalidate);
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [open, refresh]);

  useEffect(() => {
    if (open) void refresh(true);
  }, [open, refresh]);

  const replace = (notification: AppNotification) => {
    setItems((current) => current.map((item) =>
      item.id === notification.id ? notification : item
    ));
    void refresh(false);
  };

  const openDestination = async (notification: AppNotification, action: string) => {
    setLoading(true);
    try {
      const result = await executeNotificationAction(notification, action);
      replace(result.notification);
      setOpen(false);
      navigate(notificationDestinationUrl(notification, action));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Não foi possível abrir a notificação.');
    } finally {
      setLoading(false);
    }
  };

  const action = async (notification: AppNotification, actionCode: string) => {
    if (['VER_ROTEIRO', 'VER_VISITA', 'REGISTRAR_VISITA'].includes(actionCode)) {
      await openDestination(notification, actionCode);
      return;
    }
    if (actionCode === 'CONFIRMAR_CIENCIA') {
      setLoading(true);
      try {
        replace((await executeNotificationAction(notification, actionCode)).notification);
        toast.success('Ciência confirmada.');
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : 'Falha ao confirmar ciência.');
      } finally {
        setLoading(false);
      }
      return;
    }
    setOpen(false);
    navigate(notificationDestinationUrl(notification));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`${unread} notificações não lidas`}
        >
          <Bell className={cn('h-4 w-4', unread > 0 && 'fill-amber-400 text-amber-600')} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-orange-500 px-1 text-[9px] font-bold text-white shadow-sm shadow-rose-200">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(94vw,400px)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-0 shadow-xl shadow-slate-900/10 backdrop-blur-md"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-900">Missões da jornada</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {unread === 0
                  ? 'Nenhuma pendência em aberto'
                  : `${unread} ${unread === 1 ? 'alerta aguardando' : 'alertas aguardando'} ação`}
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading || unread === 0}
            onClick={() => {
              setLoading(true);
              void markAllNotificationsRead()
                .then(() => refresh(true))
                .finally(() => setLoading(false));
            }}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Ler todas
          </button>
        </header>

        <div className="max-h-[480px] space-y-2 overflow-y-auto bg-white p-3">
          {loading && items.length === 0 && (
            <div className="flex items-center justify-center py-10 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin text-blue-600" /> Carregando missões...
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Target className="h-5 w-5" />
              </span>
              <p className="text-sm font-semibold text-slate-700">Campo livre por agora</p>
              <p className="mt-1 text-[11px] text-slate-500">
                Quando houver roteiros, visitas ou lembretes, eles aparecem aqui.
              </p>
            </div>
          )}
          {items.map((notification) => {
            const meta = priorityMeta[notification.priority];
            const Icon = typeIcon(notification.type);
            const actions = notification.actions.slice(0, 3);
            const primary = actions.find((code) => PRIMARY_ACTIONS.has(code)) ?? actions[0];
            const secondary = actions.filter((code) => code !== primary);

            return (
              <article
                key={notification.id}
                className={cn(
                  'group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3 transition duration-150',
                  'hover:border-blue-200 hover:shadow-sm hover:shadow-blue-900/5',
                  !notification.readAt && 'border-blue-200/70 bg-gradient-to-br from-white to-blue-50/40'
                )}
              >
                <span className={cn('absolute inset-y-0 left-0 w-1', meta.bar)} />
                <div className="flex gap-2.5 pl-1.5">
                  <span className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                    meta.iconWrap
                  )}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-600">
                          {typeLabel(notification.type)}
                        </span>
                        <p className="mt-1.5 text-xs font-semibold leading-snug text-slate-900">
                          {notification.title}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                          {formatNotificationMessage(notification.message)}
                        </p>
                        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
                          <Clock3 className="h-3 w-3 shrink-0" />
                          {new Date(notification.lastDeliveredAt).toLocaleString('pt-BR')}
                          {notification.deliveryCount > 1
                            ? ` · ${notification.deliveryCount}ª entrega`
                            : ''}
                        </p>
                      </div>
                      {!notification.readAt && (
                        <button
                          type="button"
                          onClick={() => void markNotificationRead(notification).then(replace)}
                          className="shrink-0 rounded-lg px-1.5 py-1 text-[10px] font-semibold text-blue-700 transition hover:bg-blue-50"
                        >
                          Lida
                        </button>
                      )}
                    </div>

                    {actions.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {primary && (
                          <button
                            type="button"
                            disabled={loading}
                            onClick={() => void action(notification, primary)}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                          >
                            {actionLabel[primary] ?? primary}
                          </button>
                        )}
                        {secondary.map((actionCode) => (
                          <button
                            type="button"
                            key={actionCode}
                            disabled={loading}
                            onClick={() => void action(notification, actionCode)}
                            className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 transition hover:border-blue-200 hover:bg-blue-50/60 hover:text-blue-800 disabled:opacity-50"
                          >
                            {actionLabel[actionCode] ?? actionCode}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate('/notificacoes');
          }}
          className="flex w-full items-center justify-center gap-2 border-t border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-50/70"
        >
          Abrir central de missões
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
