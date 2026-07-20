import { Navigate, useLocation } from 'react-router-dom';
import { Map } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 shadow-2xl">
          <Map className="h-5 w-5 animate-pulse text-sky-400" />
          <span className="text-sm font-medium">Preparando seu território...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
