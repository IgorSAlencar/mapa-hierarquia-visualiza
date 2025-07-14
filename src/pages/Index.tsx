import React, { useState } from 'react';
import MapComponent from '@/components/MapComponent';
import HierarchySelector from '@/components/HierarchySelector';
import { hierarchyData } from '@/data/hierarchyData';
import { Map, Building2 } from 'lucide-react';

const Index = () => {
  const [selectedHierarchy, setSelectedHierarchy] = useState<string | null>(null);

  const getSelectedMunicipios = (): string[] => {
    if (!selectedHierarchy) return [];
    const hierarchy = hierarchyData.find(h => h.id === selectedHierarchy);
    return hierarchy?.municipios || [];
  };

  const handleSelectHierarchy = (id: string) => {
    setSelectedHierarchy(selectedHierarchy === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-map-surface/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-map-primary/10 rounded-lg">
              <Map className="h-6 w-6 text-map-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Mapa Comercial</h1>
              <p className="text-sm text-muted-foreground">
                Visualização da estrutura de atendimento por hierarquias
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-120px)]">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-4 overflow-y-auto">
            <HierarchySelector
              hierarchies={hierarchyData}
              selectedHierarchy={selectedHierarchy}
              onSelectHierarchy={handleSelectHierarchy}
            />
          </div>

          {/* Map */}
          <div className="lg:col-span-3">
            <MapComponent
              selectedHierarchy={selectedHierarchy}
              municipios={getSelectedMunicipios()}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
