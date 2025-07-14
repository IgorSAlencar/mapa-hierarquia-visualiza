import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HierarchyData {
  id: string;
  nome: string;
  tipo: string;
  municipios: string[];
  responsavel: string;
  nivel: number;
}

interface HierarchySelectorProps {
  hierarchies: HierarchyData[];
  selectedHierarchy: string | null;
  onSelectHierarchy: (id: string) => void;
}

const HierarchySelector: React.FC<HierarchySelectorProps> = ({
  hierarchies,
  selectedHierarchy,
  onSelectHierarchy
}) => {
  const getHierarchyColor = (nivel: number) => {
    const colors = [
      'hierarchy-1',
      'hierarchy-2', 
      'hierarchy-3',
      'hierarchy-4',
      'hierarchy-5'
    ];
    return colors[(nivel - 1) % colors.length];
  };

  const getHierarchyIcon = (tipo: string) => {
    switch (tipo.toLowerCase()) {
      case 'regional':
        return Building2;
      case 'filial':
        return MapPin;
      case 'representação':
        return Users;
      default:
        return Building2;
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center">
          <Building2 className="h-5 w-5 mr-2 text-map-primary" />
          Estrutura Comercial
        </h2>
        <p className="text-sm text-muted-foreground">
          Selecione uma hierarquia para visualizar os municípios atendidos no mapa
        </p>
      </div>

      <div className="grid gap-3">
        {hierarchies.map((hierarchy) => {
          const Icon = getHierarchyIcon(hierarchy.tipo);
          const isSelected = selectedHierarchy === hierarchy.id;
          const colorClass = getHierarchyColor(hierarchy.nivel);

          return (
            <Card
              key={hierarchy.id}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                isSelected && "ring-2 ring-map-primary shadow-lg"
              )}
              onClick={() => onSelectHierarchy(hierarchy.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      `bg-${colorClass}/10`
                    )}>
                      <Icon className={cn("h-4 w-4", `text-${colorClass}`)} />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">
                        {hierarchy.nome}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {hierarchy.responsavel}
                      </p>
                      
                      <div className="flex items-center mt-2 space-x-2">
                        <Badge 
                          variant="secondary" 
                          className="text-xs"
                        >
                          {hierarchy.tipo}
                        </Badge>
                        <Badge 
                          variant="outline" 
                          className="text-xs"
                        >
                          Nível {hierarchy.nivel}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 mr-1" />
                      {hierarchy.municipios.length}
                    </div>
                  </div>
                </div>
                
                {isSelected && hierarchy.municipios.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground mb-2">Municípios atendidos:</p>
                    <div className="flex flex-wrap gap-1">
                      {hierarchy.municipios.slice(0, 6).map((municipio) => (
                        <Badge 
                          key={municipio} 
                          variant="outline" 
                          className="text-xs"
                        >
                          {municipio}
                        </Badge>
                      ))}
                      {hierarchy.municipios.length > 6 && (
                        <Badge variant="outline" className="text-xs">
                          +{hierarchy.municipios.length - 6} mais
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default HierarchySelector;