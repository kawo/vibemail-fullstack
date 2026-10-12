import { type ReactNode, createContext, useContext, useState } from 'react';
import { ComposeDrawer } from '@/components/compose/ComposeDrawer';
import { type ComposeOpening, type OpenRequest, resolveOpening } from '@/components/compose/opening';

export type { OpenRequest } from '@/components/compose/opening';

interface ComposeApi {
  open: (request?: OpenRequest) => void;
  isOpen: boolean;
}

const ComposeContext = createContext<ComposeApi>({ open: () => undefined, isOpen: false });

export function useCompose(): ComposeApi {
  return useContext(ComposeContext);
}

/** Owns the compose drawer; any view can open it. */
export function ComposeProvider({ children }: { children: ReactNode }) {
  // A new key per opening remounts the drawer, so each opening starts from a clean state.
  const [session, setSession] = useState<{ key: number; opening: ComposeOpening } | null>(null);
  const value: ComposeApi = {
    isOpen: session !== null,
    open: (request = {}) => {
      if (session === null) {
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
