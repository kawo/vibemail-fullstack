import { useCompose } from '@/app/components/compose/ComposeContext';
import { Glyph } from '@/app/components/ui';

/**
 * The fixed bottom-right Compose button (DESIGN_SPEC.md §1), phones only. Its fixed wrapper pads
 * the bottom by 24px plus the safe area (glass.css flag 3). Hidden while the drawer is open.
 */
export function ComposeButton() {
  const compose = useCompose();
  if (compose.isOpen) {
    return null;
  }
  return (
    <div className="compose-fab">
      <button type="button" className="primary-btn fab" onClick={() => compose.open()}>
        <Glyph name="compose" /> Compose
      </button>
    </div>
  );
}
