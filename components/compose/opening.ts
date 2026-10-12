import type { DraftDTO, MessageDTO } from '@/services/types';
import type { ComposeFields } from '@/lib/compose';
import { type DraftSnapshot, loadDraftSnapshot, loadUnsent } from '@/lib/draftStore';

/**
 * The compose drawer's three states (DESIGN_SPEC.md §3), as ComposeDrawer's `mode` prop:
 *
 *   mode="new"             a blank message; `unsent` refills what a failed send kept on the device
 *   mode="reply"           a reply to `reply`: To locked to its sender, "Re:" subject, quoted body
 *   mode="draft-restored"  an existing draft, kept by its `draftId` for the next save: the device's
 *                          last snapshot (`origin: 'device'`, "Draft restored"), or one opened from
 *                          Drafts (`origin: 'list'`, "Draft"). With `replyAfter`, a reply was asked
 *                          for while that draft existed, so the drawer first asks "Replace your
 *                          saved draft?"
 */
export type ComposeOpening =
  | { mode: 'new'; unsent?: ComposeFields | null }
  | { mode: 'reply'; reply: MessageDTO }
  | { mode: 'draft-restored'; draft: DraftSnapshot; origin: 'device'; replyAfter?: MessageDTO }
  | { mode: 'draft-restored'; draft: DraftDTO; origin: 'list' };

/** What a view asks for; the provider turns it into the drawer's `mode` (DESIGN_SPEC.md §3). */
export interface OpenRequest {
  /** Reply to this message. */
  reply?: MessageDTO;
  /** Edit this draft, opened from Drafts (CONTRACT.md §4.13). */
  draft?: DraftDTO;
}

/**
 * Chooses the drawer's mode for a request:
 *  - a draft from the list            → draft-restored (origin "list")
 *  - a reply, with a saved draft here → draft-restored (origin "device"), asking to replace it
 *  - a reply                          → reply
 *  - Compose, with a saved draft here → draft-restored (origin "device")
 *  - Compose                          → new, refilled with anything a failed send kept
 */
export function resolveOpening(request: OpenRequest): ComposeOpening {
  if (request.draft) {
    return { mode: 'draft-restored', draft: request.draft, origin: 'list' };
  }
  const snapshot = loadDraftSnapshot();
  if (request.reply) {
    return snapshot ? { mode: 'draft-restored', draft: snapshot, origin: 'device', replyAfter: request.reply } : { mode: 'reply', reply: request.reply };
  }
  if (snapshot) {
    return { mode: 'draft-restored', draft: snapshot, origin: 'device' };
  }
  return { mode: 'new', unsent: loadUnsent() };
}

