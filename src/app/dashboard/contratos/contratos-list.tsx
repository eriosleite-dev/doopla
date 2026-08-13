'use client';

import { CONTRACT_STATUS_FILTERS, contractStatus, type BookingWithOtherParty } from '../data';
import { ListFilter } from '../list-filter';
import { ContractRow } from './contract-row';

export function ContratosList({ bookings }: { bookings: BookingWithOtherParty[] }) {
  return (
    <ListFilter
      items={bookings}
      getKey={(b) => b.id}
      searchPlaceholder="Buscar por nome ou trabalho..."
      getSearchText={(b) => `${b.otherPartyName} ${b.description ?? ''}`}
      statusFilters={CONTRACT_STATUS_FILTERS}
      getStatus={(b) => contractStatus(b)}
      renderItem={(b) => <ContractRow booking={b} />}
      emptyMessage="Nenhum contrato encontrado com esses filtros."
      itemLabel={{ singular: 'contrato encontrado', plural: 'contratos encontrados' }}
    />
  );
}
