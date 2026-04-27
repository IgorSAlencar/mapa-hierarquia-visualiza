export interface AgencyPopupInfo {
  nome: string;
  sub: string;
  kind: string;
  codAg: string;
  enderecoFormatado: string;
}

export function readAgencyPopupInfoFromProperties(
  properties: GeoJSON.GeoJsonProperties | Record<string, unknown> | null | undefined
): AgencyPopupInfo {
  const p = properties ?? {};
  return {
    nome: String((p as Record<string, unknown>).nome ?? ''),
    sub: String((p as Record<string, unknown>).subtitulo ?? 'Agência'),
    kind: String((p as Record<string, unknown>).kind ?? ''),
    codAg: String((p as Record<string, unknown>).cod_ag ?? '').trim(),
    enderecoFormatado: String((p as Record<string, unknown>).endereco_formatado ?? '').trim(),
  };
}

export function buildAgencyPopupHtml(info: AgencyPopupInfo): string {
  const { nome, sub, kind, codAg, enderecoFormatado } = info;
  const isAgency = kind === 'agencia';

  const details =
    isAgency && (codAg || enderecoFormatado)
      ? `<div class="mt-2 border-t border-gray-200 pt-2 text-xs leading-snug text-gray-700">
          ${enderecoFormatado ? `<div class="mt-1"><strong>Endereço:</strong> ${escapeHtml(enderecoFormatado)}</div>` : ''}
        </div>`
      : '';

  return `<div class="text-sm"><strong>${isAgency && codAg ? `${escapeHtml(codAg)} - ` : ''}${escapeHtml(nome)}</strong><br/><span class="text-gray-600">${escapeHtml(sub)}</span>${details}</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
