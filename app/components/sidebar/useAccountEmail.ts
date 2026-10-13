import { useEffect, useState } from 'react';
import { currentSession } from '@/app/lib/auth/session';

/** The signed-in account's email, from the session (null until it is read, or when absent). */
export function useAccountEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void currentSession().then((session) => live && setEmail(session?.email ?? null));
    return () => {
      live = false;
    };
  }, []);
  return email;
}
