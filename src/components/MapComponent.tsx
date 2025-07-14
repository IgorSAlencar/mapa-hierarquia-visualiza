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
        style: 'mapbox://styles/mapbox/light-v11',
        center: [-54.0, -14.0], // Centro do Brasil
        zoom: 4,
        minZoom: 3,
        maxZoom: 8,
        maxBounds: [[-75, -35], [-30, 10]] // Limita visualização ao Brasil
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
          console.log('📍 Adicionando polígonos...');
          addMunicipalityPolygons();
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

  const addMunicipalityPolygons = () => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Aguardar o mapa estar completamente carregado
    const removeExistingLayers = () => {
      try {
        if (map.current?.getLayer('municipios-fill')) {
          map.current.removeLayer('municipios-fill');
        }
        if (map.current?.getLayer('municipios-line')) {
          map.current.removeLayer('municipios-line');
        }
        if (map.current?.getSource('municipios')) {
          map.current.removeSource('municipios');
        }
      } catch (error) {
        console.log('Camadas não existiam, continuando...');
      }
    };

    removeExistingLayers();

    // Dados simplificados dos UFs brasileiros
    const ufPolygons: { [key: string]: any } = {
      'São Paulo': {
        type: 'Feature',
        properties: { name: 'São Paulo', code: 'SP' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-50.5, -19.5], [-44.0, -19.5], [-44.0, -25.5], [-50.5, -25.5], [-50.5, -19.5]
          ]]
        }
      },
      'Rio de Janeiro': {
        type: 'Feature',
        properties: { name: 'Rio de Janeiro', code: 'RJ' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-45.0, -20.5], [-40.5, -20.5], [-40.5, -23.5], [-45.0, -23.5], [-45.0, -20.5]
          ]]
        }
      },
      'Belo Horizonte': {
        type: 'Feature',
        properties: { name: 'Minas Gerais', code: 'MG' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-51.0, -14.0], [-39.5, -14.0], [-39.5, -22.5], [-51.0, -22.5], [-51.0, -14.0]
          ]]
        }
      },
      'Salvador': {
        type: 'Feature',
        properties: { name: 'Bahia', code: 'BA' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-47.5, -8.5], [-37.0, -8.5], [-37.0, -18.5], [-47.5, -18.5], [-47.5, -8.5]
          ]]
        }
      },
      'Porto Alegre': {
        type: 'Feature',
        properties: { name: 'Rio Grande do Sul', code: 'RS' },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-57.5, -27.0], [-49.5, -27.0], [-49.5, -33.5], [-57.5, -33.5], [-57.5, -27.0]
          ]]
        }
      }
    };

    // Criar GeoJSON com os municípios atendidos
    const features = municipios
      .filter(municipio => ufPolygons[municipio])
      .map(municipio => ufPolygons[municipio]);

    if (features.length === 0) return;

    const geojsonData = {
      type: 'FeatureCollection' as const,
      features: features
    };

    // Cores baseadas na hierarquia
    const hierarchyColors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'
    ];
    
    const colorIndex = parseInt(selectedHierarchy || '1') % hierarchyColors.length;
    const selectedColor = hierarchyColors[colorIndex];

    try {
      // Adicionar fonte de dados
      map.current.addSource('municipios', {
        type: 'geojson',
        data: geojsonData
      });

      // Adicionar camada de preenchimento
      map.current.addLayer({
        id: 'municipios-fill',
        type: 'fill',
        source: 'municipios',
        paint: {
          'fill-color': selectedColor,
          'fill-opacity': 0.3
        }
      });

      // Adicionar camada de contorno
      map.current.addLayer({
        id: 'municipios-line',
        type: 'line',
        source: 'municipios',
        paint: {
          'line-color': selectedColor,
          'line-width': 2,
          'line-opacity': 0.8
        }
      });

      console.log('✅ Polígonos adicionados com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao adicionar camadas:', error);
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
    if (isTokenSet && map.current && map.current.isStyleLoaded()) {
      // Aguardar carregamento completo antes de manipular camadas
      const updatePolygons = () => {
        try {
          if (map.current?.getLayer('municipios-fill')) {
            map.current.removeLayer('municipios-fill');
          }
          if (map.current?.getLayer('municipios-line')) {
            map.current.removeLayer('municipios-line');
          }
          if (map.current?.getSource('municipios')) {
            map.current.removeSource('municipios');
          }
        } catch (error) {
          console.log('Camadas não existiam, continuando...');
        }
        
        if (selectedHierarchy && municipios.length > 0) {
          addMunicipalityPolygons();
        }
      };

      updatePolygons();
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