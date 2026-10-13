import type { ReactNode } from 'react';

/** The sign-in card: raised glass, centred on the backdrop (DESIGN_SPEC.md shared rules). */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <div className="signin">
      <div className="glass-raised panel">
        <h1>VibeMail</h1>
        <p>Your Gmail, liberated into a mailbox you own.</p>
        {children}
      </div>
    </div>
  );
}
