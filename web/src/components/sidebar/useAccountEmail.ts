import { useEffect, useState } from 'react';
import { currentSession } from '../../auth/session';

/** The signed-in account's email, from the Supabase session (null until it is read, or when absent). */
export function useAccountEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void currentSession().then((session) => live && setEmail(session?.user.email ?? null));
    return () => {
      live = false;
    };
  }, []);
  return email;
}
