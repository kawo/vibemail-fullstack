import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DraftDTO } from '@/app/services/types';
import { message } from '@/app/lib/__tests__/fixtures';
import { resolveOpening } from '../opening';

const draft: DraftDTO = { draftId: 'd1', gmailId: 'g1', threadId: 't1', to: [], subject: 'Hi', body: 'x', updatedAt: '2026-10-12T05:00:00Z' };

/** A device with (or without) a saved draft snapshot in localStorage. */
function device(snapshot: DraftDTO | null) {
  const store = new Map<string, string>(snapshot ? [['vibemail.glass.draft', JSON.stringify(snapshot)]] : []);
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: () => undefined, removeItem: () => undefined } });
}

afterEach(() => vi.unstubAllGlobals());

describe('ComposeDrawer mode (DESIGN_SPEC.md §3)', () => {
  it('Compose opens a new message', () => {
    device(null);
    expect(resolveOpening({})).toMatchObject({ mode: 'new' });
  });

  it('Reply opens reply mode', () => {
    device(null);
    const reply = message({ gmailId: 'r' });
    expect(resolveOpening({ reply })).toEqual({ mode: 'reply', reply });
  });

  it('a draft from Drafts opens draft-restored, origin list', () => {
    device(null);
    expect(resolveOpening({ draft })).toEqual({ mode: 'draft-restored', draft, origin: 'list' });
  });

  it('Compose opens a new message even when the saved draft is a reply', () => {
    device({ ...draft, threadId: 'offsite', subject: 'Re: Offsite', requestedThreadId: 'offsite' } as DraftDTO);
    expect(resolveOpening({})).toMatchObject({ mode: 'new' });
  });

  it('a saved draft on the device is restored, and a reply first asks to replace it', () => {
    device(draft);
    expect(resolveOpening({})).toMatchObject({ mode: 'draft-restored', origin: 'device', draft: { draftId: 'd1' } });
    const reply = message({ gmailId: 'r' });
    expect(resolveOpening({ reply })).toMatchObject({ mode: 'draft-restored', origin: 'device', replyAfter: reply });
  });
});
