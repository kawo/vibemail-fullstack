import { initials } from '../../lib/thread';

/** The sender's initials in a circle. Decorative: the name is always written beside it. */
export function Avatar({ fromAddress, size = 'md', self = false }: { fromAddress: string; size?: 'sm' | 'md'; self?: boolean }) {
  return (
    <span className={`avatar ${size}${self ? ' self' : ''}`} aria-hidden="true">
      {initials(fromAddress)}
    </span>
  );
}
