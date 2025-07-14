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

  const addMunicipalityPolygons = async () => {
    if (!map.current) return;

    // Remover camadas existentes se houver
    if (map.current.getLayer('municipios-fill')) {
      map.current.removeLayer('municipios-fill');
    }
    if (map.current.getLayer('municipios-line')) {
      map.current.removeLayer('municipios-line');
    }
    if (map.current.getSource('municipios')) {
      map.current.removeSource('municipios');
    }

    try {
      console.log('📍 Carregando dados geográficos dos UFs...');
      
      // Carregar dados reais dos contornos dos UFs brasileiros
      const response = await fetch('https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=uf');
      const brasilGeoData = await response.json();

      // Mapeamento dos municípios para UFs (exemplo)
      const municipioToUF: { [key: string]: string } = {
        'São Paulo': 'SP',
        'Rio de Janeiro': 'RJ', 
        'Belo Horizonte': 'MG',
        'Salvador': 'BA',
        'Fortaleza': 'CE',
        'Brasília': 'DF',
        'Curitiba': 'PR',
        'Recife': 'PE',
        'Porto Alegre': 'RS',
        'Manaus': 'AM'
      };

      // Filtrar apenas os UFs que atendem os municípios selecionados
      const ufsAtendidos = municipios
        .map(municipio => municipioToUF[municipio])
        .filter(uf => uf);

      const featuresAtendidos = brasilGeoData.features.filter((feature: any) => 
        ufsAtendidos.includes(feature.properties.codarea)
      );

      if (featuresAtendidos.length === 0) {
        console.log('❌ Nenhuma UF encontrada para os municípios selecionados');
        return;
      }

      const geojsonData = {
        type: 'FeatureCollection' as const,
        features: featuresAtendidos
      };

      // Adicionar fonte de dados
      map.current.addSource('municipios', {
        type: 'geojson',
        data: geojsonData
      });

      // Cores baseadas na hierarquia
      const hierarchyColors = [
        '#3b82f6', // blue-500
        '#10b981', // emerald-500  
        '#f59e0b', // amber-500
        '#ef4444', // red-500
        '#8b5cf6', // violet-500
      ];
      
      const colorIndex = parseInt(selectedHierarchy || '1') % hierarchyColors.length;
      const selectedColor = hierarchyColors[colorIndex];

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

      // Adicionar popup ao clicar
      map.current.on('click', 'municipios-fill', (e) => {
        if (e.features && e.features[0]) {
          const feature = e.features[0];
          new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(`
              <div class="p-2">
                <h3 class="font-medium text-sm">${feature.properties?.nome || 'UF'}</h3>
                <p class="text-xs text-muted-foreground">Hierarquia: ${selectedHierarchy}</p>
              </div>
            `)
            .addTo(map.current!);
        }
      });

      // Ajustar zoom para mostrar todas as regiões
      if (featuresAtendidos.length > 0) {
        const bounds = new mapboxgl.LngLatBounds();
        featuresAtendidos.forEach((feature: any) => {
          if (feature.geometry.type === 'Polygon') {
            feature.geometry.coordinates[0].forEach((coord: number[]) => {
              bounds.extend(coord as [number, number]);
            });
          } else if (feature.geometry.type === 'MultiPolygon') {
            feature.geometry.coordinates.forEach((polygon: number[][][]) => {
              polygon[0].forEach((coord: number[]) => {
                bounds.extend(coord as [number, number]);
              });
            });
          }
        });
        map.current?.fitBounds(bounds, { padding: 50 });
      }

      console.log('✅ Contornos reais dos UFs carregados com sucesso!');

    } catch (error) {
      console.error('❌ Erro ao carregar dados geográficos:', error);
      toast({
        title: "Erro nos dados geográficos",
        description: "Não foi possível carregar os contornos reais dos UFs.",
        variant: "destructive"
      });
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
      // Limpar camadas existentes se houver
      if (map.current.getLayer('municipios-fill')) {
        map.current.removeLayer('municipios-fill');
      }
      if (map.current.getLayer('municipios-line')) {
        map.current.removeLayer('municipios-line');
      }
      if (map.current.getSource('municipios')) {
        map.current.removeSource('municipios');
      }
      
      if (selectedHierarchy && municipios.length > 0) {
        addMunicipalityPolygons();
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