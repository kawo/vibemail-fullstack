import { useCallback, useMemo } from 'react';
import type { MessageDTO } from '@/app/services/types';
import { useInboxUi } from '@/state/inboxUi';

/**
 * The selection as one list sees it (DESIGN_SPEC.md §1 Selection): its order for Shift ranges,
 * the selected messages it lists, and select all / none over what it lists.
 */
export function useListSelection(listed: readonly MessageDTO[]) {
  const { selected, setSelected, clearSelection } = useInboxUi();
  const order = useMemo(() => listed.map((m) => m.gmailId), [listed]);
  const selectedListed = useMemo(() => listed.filter((m) => selected.has(m.gmailId)), [listed, selected]);
  const selectAll = useCallback((all: boolean) => (all ? setSelected(order) : clearSelection()), [order, setSelected, clearSelection]);
  return { order, selectedListed, selecting: selectedListed.length > 0, selectAll, clearSelection };
}
