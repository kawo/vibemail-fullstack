import { useRef, useState } from 'react';
import { api } from '@/app/services';
import type { MessageDTO } from '@/app/services/types';
import { formatSize } from '@/app/lib/format';
import { asApiError, store } from '@/state/store';
import { Glyph } from '@/app/components/ui';

/** Codes the app handles everywhere (sign-in, reconnect panel); no toast of their own. */
const HANDLED_ELSEWHERE = new Set(['UNAUTHENTICATED', 'GMAIL_NOT_CONNECTED', 'GMAIL_TOKEN_REVOKED']);

/**
 * An expanded card's attachments (DESIGN_SPEC.md §2): one download button each. A tap asks the
 * engine for a signed Storage URL (CONTRACT.md §4.15) and sends the browser there, which saves the
 * file under its name without leaving the app. A tap while that runs is ignored.
 */
export function AttachmentList({ message }: { message: MessageDTO }) {
  const inFlight = useRef(new Set<string>());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  const settle = (partId: string, running: boolean) => {
    if (running) {
      inFlight.current.add(partId);
    } else {
      inFlight.current.delete(partId);
    }
    setBusy(new Set(inFlight.current));
  };

  const download = async (attachment: MessageDTO['attachments'][number]) => {
    if (inFlight.current.has(attachment.partId)) {
      return;
    }
    settle(attachment.partId, true);
    try {
      const { url } = await api.downloadAttachment(message.gmailId, attachment.partId);
      window.location.assign(url);
    } catch (error) {
      const code = asApiError(error).code;
      if (code === 'FILE_TOO_LARGE') {
        store.toast(`${attachment.filename} is too large to download here. Use View in Gmail.`);
      } else if (!HANDLED_ELSEWHERE.has(code)) {
        store.toast(`Couldn’t download ${attachment.filename}`);
      }
    } finally {
      settle(attachment.partId, false);
    }
  };

  if (message.attachments.length === 0) {
    return null;
  }
  return (
    <div className="attachments" aria-label="Attachments">
      {message.attachments.map((a) => {
        const running = busy.has(a.partId);
        return (
          <button
            key={a.partId}
            type="button"
            className="attachment"
            aria-label={`Download ${a.filename}`}
            title={`Download ${a.filename}`}
            aria-busy={running ? true : undefined}
            onClick={() => void download(a)}
          >
            {running ? <span className="spinner sep" aria-hidden="true" /> : <Glyph name="clip" className="sep" />} <b>{a.filename}</b>{' '}
            <span className="sep">·</span> {a.mimeType} <span className="sep">·</span> {formatSize(a.size)}
          </button>
        );
      })}
    </div>
  );
}
