import type { MessageStatus } from '../types';

/**
 * CONTRACT.md §3.4: `status` is derived from `label_ids` at write time; the first matching rule
 * wins. The migration's `message_status()` trigger applies the same rule in the database, so a
 * row's `status` is correct even if a writer forgets it. Clients never set it.
 */
export function deriveStatus(labels: readonly string[]): MessageStatus {
  if (labels.includes('TRASH')) {
    return 'trash';
  }
  if (labels.includes('SPAM')) {
    return 'spam';
  }
  if (labels.includes('INBOX')) {
    return 'inbox';
  }
  if (labels.includes('SENT')) {
    return 'sent';
  }
  return 'archived';
}
