import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  Eye,
  EyeOff,
  Flag,
  Gamepad2,
  Loader2,
  LockKeyhole,
  Map,
  MapPin,
  Route,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

function decodeUrlValue(value: string | null) {
  if (value == null) return '';
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
}

function readLinkedCredentials() {
  const params = new URLSearchParams(window.location.search);
  const queryUser = params.get('user');
  const queryPassword = params.get('senha');
  if (queryUser != null || queryPassword != null) {
    return {
      funcional: queryUser ?? '',
      password: queryPassword ?? '',
      automatic: Boolean(queryUser && queryPassword),
    };
  }

  const legacy = window.location.pathname.match(/^\/login=([^&]*)(?:&senha=(.*))?$/i);
  if (!legacy) return { funcional: '', password: '', automatic: false };
  const funcional = decodeUrlValue(legacy[1] ?? '');
  const password = decodeUrlValue(legacy[2] ?? '');
  return { funcional, password, automatic: Boolean(funcional && password) };
}

export default function Login() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const linkedCredentialsRef = useRef(readLinkedCredentials());
  const automaticStartedRef = useRef(false);
  const [funcional, setFuncional] = useState(linkedCredentialsRef.current.funcional);
  const [password, setPassword] = useState(linkedCredentialsRef.current.password);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [navigate, user]);

  const submit = async (nextFuncional: string, nextPassword: string) => {
    if (!nextFuncional.trim() || !nextPassword) {
      setError('Informe o funcional e a senha.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(nextFuncional, nextPassword);
      navigate('/', { replace: true });
    } catch (requestError) {
      setPassword('');
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível entrar.');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const linked = linkedCredentialsRef.current;
    if (!linked.automatic || automaticStartedRef.current) return;
    automaticStartedRef.current = true;
    window.history.replaceState(null, '', '/login');
    void submit(linked.funcional, linked.password);
    // A submissão automática deve acontecer somente na primeira montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative flex min-h-screen overflow-hidden bg-[#f5fbff] text-slate-800">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(125,211,252,.42),transparent_28%),radial-gradient(circle_at_88%_16%,rgba(196,181,253,.34),transparent_24%),radial-gradient(circle_at_78%_88%,rgba(110,231,183,.28),transparent_28%),linear-gradient(135deg,#f8fcff_0%,#f4f8ff_48%,#f7fffb_100%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45 [background-image:radial-gradient(rgba(14,116,144,.18)_1px,transparent_1px)] [background-size:24px_24px]"
      />
      <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-1/2 h-64 w-64 rounded-full bg-sky-200/40 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-16 h-72 w-72 rounded-full bg-violet-200/40 blur-3xl" />

      <section className="relative z-10 m-auto grid w-full max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[1.12fr_.88fr] lg:items-center lg:gap-14 lg:py-12">
        <div className="order-2 hidden space-y-7 lg:order-1 lg:block">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-[.14em] text-sky-700 shadow-sm backdrop-blur">
            <Gamepad2 className="h-4 w-4" /> Jornada comercial
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          </div>

          <div className="space-y-4">
            <h1 className="max-w-2xl text-5xl font-black leading-[1.03] tracking-[-.04em] text-slate-900 xl:text-6xl">
              Explore seu território.
              <span className="mt-1 block bg-gradient-to-r from-sky-600 via-indigo-500 to-emerald-500 bg-clip-text text-transparent">
                Conquiste oportunidades.
              </span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-slate-600">
              Sua jornada começa com um mapa feito para você: equipes, agências, lojas e rotas conectadas à sua missão comercial.
            </p>
          </div>

          <div className="max-w-xl rounded-[28px] border border-white/90 bg-white/70 p-5 shadow-xl shadow-sky-900/5 backdrop-blur-xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-300 to-orange-400 text-white shadow-lg shadow-orange-200">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.13em] text-amber-600">Sua missão</p>
                  <p className="font-bold text-slate-800">Transformar visão em movimento</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">Pronto</span>
            </div>

            <div className="relative grid grid-cols-3 gap-3">
              <div aria-hidden="true" className="absolute left-[16%] right-[16%] top-5 h-0.5 bg-gradient-to-r from-sky-300 via-indigo-300 to-emerald-300" />
              {[
                { icon: UserRound, title: 'Entrar', caption: 'Identifique-se', color: 'bg-sky-500' },
                { icon: Compass, title: 'Explorar', caption: 'Leia o território', color: 'bg-indigo-500' },
                { icon: Flag, title: 'Avançar', caption: 'Crie sua rota', color: 'bg-emerald-500' },
              ].map(({ icon: Icon, title, caption, color }) => (
                <div key={title} className="relative z-10 text-center">
                  <div className={`mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full border-4 border-white text-white shadow-md ${color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">{title}</p>
                  <p className="text-[11px] text-slate-500">{caption}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex max-w-xl flex-wrap gap-2.5 text-xs font-semibold text-slate-600">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-100 bg-white/75 px-3 py-2"><MapPin className="h-3.5 w-3.5 text-sky-500" /> Território personalizado</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white/75 px-3 py-2"><Map className="h-3.5 w-3.5 text-indigo-500" /> Mapa inteligente</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-white/75 px-3 py-2"><Route className="h-3.5 w-3.5 text-emerald-500" /> Rotas e oportunidades</span>
          </div>
        </div>

        <div className="order-1 rounded-[32px] border border-white bg-white/90 p-2 shadow-[0_28px_80px_-28px_rgba(30,64,175,.28)] backdrop-blur-xl lg:order-2">
          <div className="rounded-[26px] border border-sky-100/80 bg-gradient-to-b from-white to-sky-50/45 p-6 sm:p-8">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white shadow-lg shadow-sky-200">
                  <Map className="h-7 w-7" />
                  <Sparkles className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-amber-300 p-1 text-amber-800 ring-2 ring-white" />
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-extrabold uppercase tracking-[.15em] text-sky-600">Mapa Comercial</p>
                  <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Comece sua jornada</h2>
                  <p className="text-sm text-slate-500">Entre para abrir seu território.</p>
                </div>
              </div>
              <span className="hidden rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-600 sm:block">
                Fase 1
              </span>
            </div>

            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                void submit(funcional, password);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="funcional" className="text-sm font-bold text-slate-700">Seu funcional</Label>
                <div className="relative">
                  <UserRound className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500" />
                  <Input
                    id="funcional"
                    value={funcional}
                    onChange={(event) => setFuncional(event.target.value)}
                    autoComplete="username"
                    inputMode="text"
                    disabled={submitting}
                    placeholder="Ex.: 9123456 ou i123456"
                    className="h-12 rounded-xl border-slate-200 bg-white pl-10 text-slate-800 shadow-sm placeholder:text-slate-400 focus-visible:border-sky-400 focus-visible:ring-sky-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-bold text-slate-700">Sua senha</Label>
                <div className="relative">
                  <LockKeyhole className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    disabled={submitting}
                    placeholder="Senha corporativa"
                    className="h-12 rounded-xl border-slate-200 bg-white pl-10 pr-11 text-slate-800 shadow-sm placeholder:text-slate-400 focus-visible:border-indigo-400 focus-visible:ring-indigo-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    disabled={submitting}
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    aria-pressed={showPassword}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-2.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-700">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={submitting}
                className="group h-12 w-full rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 font-bold text-white shadow-lg shadow-blue-200 transition-all hover:-translate-y-0.5 hover:from-sky-400 hover:to-indigo-400 hover:shadow-xl disabled:translate-y-0"
              >
                {submitting ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Abrindo seu mapa...</>
                ) : (
                  <><Compass className="mr-2 h-4 w-4 transition-transform group-hover:rotate-12" /> Iniciar jornada</>
                )}
              </Button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-emerald-50/80 px-3 py-2.5 text-center text-[11px] font-medium leading-relaxed text-emerald-700">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              Seu mapa respeita automaticamente seu território de atuação.
            </div>

            <div className="mt-4 flex items-center justify-center gap-1.5 border-t border-slate-100 pt-4 text-center text-[11px] text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>
                Desenvolvido por{' '}
                <strong className="font-bold text-slate-600">Igor da Silva Alencar</strong>
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
