import DOMPurify from 'dompurify';
import { useMemo, useRef, useState } from 'react';

/**
 * Renders `bodyHtml` sanitised, in a sandboxed frame with no scripts. A Content-Security-Policy
 * blocks remote images until the user allows them (DESIGN_SPEC.md §2).
 */
export function HtmlBody({ html }: { html: string }) {
  const [allowImages, setAllowImages] = useState(false);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(120);

  const clean = useMemo(() => DOMPurify.sanitize(html, { WHOLE_DOCUMENT: false, FORBID_TAGS: ['style'] }), [html]);
  const hasRemoteImages = useMemo(() => /<img[^>]+src=["']?https?:/i.test(clean), [clean]);
  const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src data: cid:${allowImages ? ' https: http:' : ''}; font-src data:`;
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>body{margin:12px;font:14px/22px system-ui,sans-serif;color:#111;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style></head><body>${clean}</body></html>`;

  // Measured on the frame's own load event, which can fire before any effect could subscribe.
  const measure = () => {
    const body = frame.current?.contentDocument?.body;
    if (body) {
      setHeight(Math.min(4000, body.scrollHeight + 24));
    }
  };

  return (
    <>
      {hasRemoteImages && !allowImages && (
        <div className="notice">
          Remote images are hidden.
          <button type="button" className="text-btn" onClick={() => setAllowImages(true)}>
            Show images
          </button>
        </div>
      )}
      <iframe
        ref={frame}
        title="Message body"
        // allow-same-origin only lets the parent measure the height; without allow-scripts nothing runs.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        srcDoc={doc}
        onLoad={measure}
        style={{ height }}
      />
    </>
  );
}
