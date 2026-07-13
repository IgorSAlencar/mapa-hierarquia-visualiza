import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { prefetchDefaultMapboxStyles } from '@/lib/mapboxRuntime'
import './index.css'

// Pré-aquece workers Mapbox + cacheia estilos enquanto o React monta.
prefetchDefaultMapboxStyles()

createRoot(document.getElementById("root")!).render(<App />);
