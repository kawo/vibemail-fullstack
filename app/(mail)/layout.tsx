import type { ReactNode } from 'react';
import { MailShell } from '@/app/components/MailShell';

/** Every mail screen sits behind the auth guard, in one shell that persists across them. */
export default function MailLayout({ children }: { children: ReactNode }) {
  return <MailShell>{children}</MailShell>;
}
