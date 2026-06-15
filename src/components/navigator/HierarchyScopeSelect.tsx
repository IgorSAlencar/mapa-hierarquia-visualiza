import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CommercialStructureItem } from '@/lib/commercialStructureApi';

export const HIERARCHY_ALL = 'all';

export function HierarchyScopeSelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  options: CommercialStructureItem[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full bg-white text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={HIERARCHY_ALL} className="text-xs">
          {placeholder}: todos
        </SelectItem>
        {options.map((item) => (
          <SelectItem key={item.chave} value={String(item.chave)} className="text-xs">
            {item.chave} - {item.descricao}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
