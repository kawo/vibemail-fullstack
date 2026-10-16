import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { ComposeDrawer } from '@/app/components/compose/ComposeDrawer';
import { type ComposeOpening, type OpenRequest, resolveOpening } from '@/app/components/compose/opening';

export type { OpenRequest } from '@/app/components/compose/opening';

interface ComposeApi {
  open: (request?: OpenRequest) => void;
  isOpen: boolean;
}

const ComposeContext = createContext<ComposeApi>({ open: () => undefined, isOpen: false });

export function useCompose(): ComposeApi {
  return useContext(ComposeContext);
}

/**
 * Owns the compose drawer; any view can open it. Closing gives focus back to the control that
 * opened it. That control is noted when `open` is called, because the sidebar's Compose button
 * is disabled while the drawer is open and so loses focus before the drawer mounts.
 */
export function ComposeProvider({ children }: { children: ReactNode }) {
  // A new key per opening remounts the drawer, so each opening starts from a clean state.
  const [session, setSession] = useState<{ key: number; opening: ComposeOpening } | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  // After the drawer has gone (and the opener is enabled again), focus returns to it.
  useEffect(() => {
    if (session === null && opener.current) {
      const target = opener.current;
      opener.current = null;
      if (target.isConnected && !target.closest('[inert]')) {
        target.focus();
      }
    }
  }, [session]);

  const value: ComposeApi = {
    isOpen: session !== null,
    open: (request = {}) => {
      if (session === null) {
        opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        setSession({ key: Date.now(), opening: resolveOpening(request) });
      }
    },
  };
  return (
    <ComposeContext.Provider value={value}>
      {children}
      {session && <ComposeDrawer key={session.key} {...session.opening} onClose={() => setSession(null)} />}
    </ComposeContext.Provider>
  );
}
