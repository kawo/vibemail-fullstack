import { type ReactNode, createContext, useContext, useState } from 'react';
import type { MessageDTO } from '../api/types';
import { ComposeDrawer } from './ComposeDrawer';

export interface OpenRequest {
  /** Present for reply mode (DESIGN_SPEC.md §3). */
  reply?: MessageDTO;
}

interface ComposeApi {
  open: (request?: OpenRequest) => void;
  isOpen: boolean;
}

const ComposeContext = createContext<ComposeApi>({ open: () => undefined, isOpen: false });

export function useCompose(): ComposeApi {
  return useContext(ComposeContext);
}

/** Owns the compose drawer; any view can open it, in default or reply mode. */
export function ComposeProvider({ children }: { children: ReactNode }) {
  // A new key per opening remounts the drawer, so each opening starts from a clean state.
  const [session, setSession] = useState<{ key: number; request: OpenRequest } | null>(null);
  const value: ComposeApi = {
    isOpen: session !== null,
    open: (request = {}) => {
      if (session === null) {
        setSession({ key: Date.now(), request });
      }
    },
  };
  return (
    <ComposeContext.Provider value={value}>
      {children}
      {session && <ComposeDrawer key={session.key} request={session.request} onClose={() => setSession(null)} />}
    </ComposeContext.Provider>
  );
}
