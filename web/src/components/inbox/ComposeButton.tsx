import { useCompose } from '../../compose/ComposeContext';
import { Glyph } from '../ui';

/** The fixed bottom-right Compose button (DESIGN_SPEC.md §1). Hidden while the drawer is open. */
export function ComposeButton() {
  const compose = useCompose();
  if (compose.isOpen) {
    return null;
  }
  return (
    <button type="button" className="primary-btn fab" onClick={() => compose.open()}>
      <Glyph name="compose" /> Compose
    </button>
  );
}
