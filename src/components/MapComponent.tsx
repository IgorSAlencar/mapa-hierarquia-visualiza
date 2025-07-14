import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useToast } from '@/hooks/use-toast';
import { MAPBOX_CONFIG } from '@/lib/mapbox-config';

interface MapComponentProps {
  selectedHierarchy: string | null;
  municipios: string[];
}

const MapComponent: React.FC<MapComponentProps> = ({ selectedHierarchy, municipios }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
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
      console.log('🔑 Configurando token do MapBox...');
      mapboxgl.accessToken = MAPBOX_CONFIG.accessToken;
      
      console.log('🗺️ Criando instância do mapa...');
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: MAPBOX_CONFIG.defaultStyle,
        center: MAPBOX_CONFIG.center,
        zoom: MAPBOX_CONFIG.zoom.initial,
        minZoom: MAPBOX_CONFIG.zoom.min,
        maxZoom: MAPBOX_CONFIG.zoom.max,
        maxBounds: MAPBOX_CONFIG.bounds.brazil
      });

      console.log('⚙️ Adicionando controles de navegação...');
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      map.current.on('load', () => {
        console.log('✅ Mapa carregado com sucesso!');
        toast({
          title: "Mapa carregado!",
          description: "MapBox inicializado com sucesso.",
        });

        // Sempre adicionar o Brasil por padrão
        addMunicipalityPolygons();
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

    // Remover camadas existentes
    const removeExistingLayers = () => {
      try {
        if (map.current?.getLayer('municipios-fill')) {
          map.current.removeLayer('municipios-fill');
        }
        if (map.current?.getLayer('municipios-line')) {
          map.current.removeLayer('municipios-line');
        }
        if (map.current?.getLayer('municipios-hover')) {
          map.current.removeLayer('municipios-hover');
        }
        if (map.current?.getSource('municipios')) {
          map.current.removeSource('municipios');
        }
      } catch (error) {
        console.log('Camadas não existiam, continuando...');
      }
    };

    removeExistingLayers();

    // Usar dados reais do Brasil via tileset do MapBox
    try {
      // Adicionar fonte de dados dos estados brasileiros
      map.current.addSource('municipios', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1'
      });

      // Cores da hierarquia
      const hierarchyColors = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'
      ];
      
      const colorIndex = parseInt(selectedHierarchy || '1') % hierarchyColors.length;
      const selectedColor = hierarchyColors[colorIndex];

      // Mapear municípios para códigos de UF
      const municipioToUF: { [key: string]: string } = {
        'São Paulo': 'SP',
        'Rio de Janeiro': 'RJ',
        'Belo Horizonte': 'MG',
        'Salvador': 'BA',
        'Porto Alegre': 'RS',
        'Fortaleza': 'CE',
        'Brasília': 'DF',
        'Curitiba': 'PR',
        'Recife': 'PE',
        'Manaus': 'AM'
      };

      const activeCodes = municipios.map(m => municipioToUF[m]).filter(Boolean);

      // Filtro: mostrar Brasil inteiro se não há municípios específicos, senão apenas UFs selecionadas
      const filter = activeCodes.length > 0 
        ? [
            'all',
            ['==', ['get', 'iso_3166_1'], 'BR'],
            ['in', ['get', 'iso_3166_2'], ['literal', activeCodes]]
          ]
        : ['==', ['get', 'iso_3166_1'], 'BR'];

      // Adicionar camada de preenchimento com filtro
      map.current.addLayer({
        id: 'municipios-fill',
        type: 'fill',
        source: 'municipios',
        'source-layer': 'country_boundaries',
        filter: filter,
        paint: {
          'fill-color': selectedColor,
          'fill-opacity': activeCodes.length > 0 ? 0.6 : 0.3
        }
      });

      // Adicionar camada de contorno
      map.current.addLayer({
        id: 'municipios-line',
        type: 'line',
        source: 'municipios',
        'source-layer': 'country_boundaries',
        filter: filter,
        paint: {
          'line-color': selectedColor,
          'line-width': activeCodes.length > 0 ? 2 : 1,
          'line-opacity': 1
        }
      });

      // Adicionar camada de hover apenas se há UFs específicas
      if (activeCodes.length > 0) {
        map.current.addLayer({
          id: 'municipios-hover',
          type: 'fill',
          source: 'municipios',
          'source-layer': 'country_boundaries',
          filter: ['==', ['get', 'iso_3166_2'], ''],
          paint: {
            'fill-color': selectedColor,
            'fill-opacity': 0.8
          }
        });

        // Adicionar interações de hover
        map.current.on('mousemove', 'municipios-fill', (e) => {
          if (e.features && e.features.length > 0) {
            map.current!.getCanvas().style.cursor = 'pointer';
            
            const feature = e.features[0];
            const hoveredUF = feature.properties?.iso_3166_2;
            
            if (hoveredUF) {
              map.current!.setFilter('municipios-hover', ['==', ['get', 'iso_3166_2'], hoveredUF]);
            }
          }
        });

        map.current.on('mouseleave', 'municipios-fill', () => {
          map.current!.getCanvas().style.cursor = '';
          map.current!.setFilter('municipios-hover', ['==', ['get', 'iso_3166_2'], '']);
        });
      }

      console.log('✅ Choropleth adicionado com sucesso!');
    } catch (error) {
      console.error('❌ Erro ao adicionar choropleth:', error);
    }
  };


  useEffect(() => {
    if (map.current && map.current.isStyleLoaded()) {
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
        
        if (selectedHierarchy) {
          addMunicipalityPolygons();
        }
      };

      updatePolygons();
    }
  }, [selectedHierarchy, municipios]);

  // Inicializar mapa após container estar disponível
  useEffect(() => {
    if (mapContainer.current && !map.current) {
      initializeMap();
    }
  }, []);

  useEffect(() => {
    return () => {
      map.current?.remove();
    };
  }, []);

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
            <span className="text-sm font-medium">
              {municipios.length > 0 ? `Hierarquia ${selectedHierarchy}` : 'Brasil'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {municipios.length > 0 ? `${municipios.length} município(s) atendido(s)` : 'País destacado'}
          </p>
        </div>
      )}
    </div>
  );
};

export default MapComponent;