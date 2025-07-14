import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface MapComponentProps {
  selectedHierarchy: string | null;
  municipios: string[];
}

const MapComponent: React.FC<MapComponentProps> = ({ selectedHierarchy, municipios }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string>('');
  const [isTokenSet, setIsTokenSet] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const initializeMap = async () => {
    console.log('🚀 Iniciando inicialização do mapa...');
    console.log('📦 Container disponível:', mapContainer.current ? 'Sim' : 'Não');
    
    if (!mapContainer.current) {
      console.error('❌ Container não disponível para inicializar mapa');
      return;
    }

    try {
      // Configurar token antes de qualquer operação
      const token = 'pk.eyJ1IjoiaWdyYWxlbmNhciIsImEiOiJjbWFpN3VhbDIwZWh2MnJxNDEycG1haHZpIn0.IPFXEakhJ0tprRmq4JEn_w';
      console.log('🔑 Configurando token do MapBox...');
      mapboxgl.accessToken = token;
      
      console.log('🗺️ Criando instância do mapa...');
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [-47.9292, -15.7801],
        zoom: 4.5
      });

      console.log('⚙️ Adicionando controles de navegação...');
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      map.current.on('load', () => {
        console.log('✅ Mapa carregado com sucesso!');
        toast({
          title: "Mapa carregado!",
          description: "MapBox inicializado com sucesso.",
        });

        if (selectedHierarchy && municipios.length > 0) {
          console.log('📍 Adicionando marcadores...');
          addMunicipalityMarkers();
        }
      });

      map.current.on('error', (e) => {
        console.error('❌ Erro no MapBox:', e);
        toast({
          title: "Erro no mapa",
          description: "Erro ao carregar o mapa: " + (e.error?.message || 'Erro desconhecido'),
          variant: "destructive"
        });
      });

    } catch (error) {
      console.error('❌ Erro ao inicializar mapa:', error);
      toast({
        title: "Erro de inicialização",
        description: "Falha ao inicializar o MapBox.",
        variant: "destructive"
      });
    }
  };

  const addMunicipalityMarkers = () => {
    if (!map.current) return;

    // Coordenadas de exemplo para alguns municípios brasileiros
    const municipalityCoords: { [key: string]: [number, number] } = {
      'São Paulo': [-46.6333, -23.5505],
      'Rio de Janeiro': [-43.1729, -22.9068],
      'Belo Horizonte': [-43.9378, -19.9208],
      'Salvador': [-38.5014, -12.9714],
      'Fortaleza': [-38.5267, -3.7319],
      'Brasília': [-47.9292, -15.7801],
      'Curitiba': [-49.2647, -25.4284],
      'Recife': [-34.8755, -8.0476],
      'Porto Alegre': [-51.2177, -30.0346],
      'Manaus': [-60.0261, -3.1190]
    };

    municipios.forEach((municipio, index) => {
      const coords = municipalityCoords[municipio] || [-47.9292 + (index * 2), -15.7801 + (index * 1.5)];
      
      // Criar marcador personalizado
      const markerElement = document.createElement('div');
      markerElement.className = 'custom-marker';
      markerElement.style.cssText = `
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: hsl(var(--hierarchy-${(parseInt(selectedHierarchy || '1') % 5) + 1}));
        border: 2px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: transform 0.2s;
      `;
      
      markerElement.addEventListener('mouseenter', () => {
        markerElement.style.transform = 'scale(1.5)';
      });
      
      markerElement.addEventListener('mouseleave', () => {
        markerElement.style.transform = 'scale(1)';
      });

      new mapboxgl.Marker(markerElement)
        .setLngLat(coords)
        .setPopup(
          new mapboxgl.Popup({ offset: 25 })
            .setHTML(`
              <div class="p-2">
                <h3 class="font-medium text-sm">${municipio}</h3>
                <p class="text-xs text-muted-foreground">Hierarquia: ${selectedHierarchy}</p>
              </div>
            `)
        )
        .addTo(map.current!);
    });

    // Ajustar o zoom para mostrar todos os marcadores
    if (municipios.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      municipios.forEach((municipio, index) => {
        const coords = municipalityCoords[municipio] || [-47.9292 + (index * 2), -15.7801 + (index * 1.5)];
        bounds.extend(coords);
      });
      map.current?.fitBounds(bounds, { padding: 50 });
    }
  };

  const handleTokenSubmit = async () => {
    console.log('🔘 Botão clicado - iniciando processo...');
    
    if (!mapboxToken.trim()) {
      console.log('⚠️ Token vazio detectado');
      toast({
        title: "Token requerido",
        description: "Por favor, insira seu token público do MapBox.",
        variant: "destructive"
      });
      return;
    }
    
    console.log('🔄 Validando token e preparando mapa...');
    setIsLoading(true);
    setIsTokenSet(true);
    setIsLoading(false);
  };

  useEffect(() => {
    if (isTokenSet && map.current) {
      // Limpar marcadores existentes
      const markers = document.querySelectorAll('.custom-marker');
      markers.forEach(marker => marker.remove());
      
      if (selectedHierarchy && municipios.length > 0) {
        addMunicipalityMarkers();
      }
    }
  }, [selectedHierarchy, municipios, isTokenSet]);

  // Inicializar mapa após container estar disponível
  useEffect(() => {
    if (isTokenSet && mapContainer.current && !map.current) {
      initializeMap();
    }
  }, [isTokenSet]);

  useEffect(() => {
    return () => {
      map.current?.remove();
    };
  }, []);

  if (!isTokenSet) {
    return (
      <Card className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md space-y-4">
          <MapPin className="h-12 w-12 mx-auto text-map-primary" />
          <h3 className="text-lg font-semibold">Configure o MapBox</h3>
          <p className="text-sm text-muted-foreground">
            Insira seu token público do MapBox para visualizar o mapa.
            Obtenha em: <a href="https://mapbox.com" target="_blank" rel="noopener noreferrer" className="text-map-primary hover:underline">mapbox.com</a>
          </p>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="pk.eyJ1IjoieW91ci11c2VybmFtZSI..."
              value={mapboxToken}
              onChange={(e) => setMapboxToken(e.target.value)}
              className="w-full"
            />
            <Button 
              onClick={handleTokenSubmit} 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {isLoading ? 'Carregando...' : 'Carregar Mapa'}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="relative h-full rounded-lg overflow-hidden">
      <div ref={mapContainer} className="absolute inset-0" />
      {selectedHierarchy && (
        <div className="absolute top-4 left-4 bg-map-surface/95 backdrop-blur-sm rounded-lg p-3 shadow-lg">
          <div className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full" 
              style={{ backgroundColor: `hsl(var(--hierarchy-${(parseInt(selectedHierarchy) % 5) + 1}))` }}
            />
            <span className="text-sm font-medium">Hierarquia {selectedHierarchy}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {municipios.length} município(s) atendido(s)
          </p>
        </div>
      )}
    </div>
  );
};

export default MapComponent;