import { Icon } from '../icons';

/**
 * The selection checkbox (DESIGN_SPEC.md §1 Selection): a 14px box on a row's leading edge, or in
 * the list header to select every listed message. `mixed` shows a dash when some are selected.
 */
export function SelectBox({
  state,
  label,
  onToggle,
  className,
}: {
  state: 'none' | 'some' | 'all';
  label: string;
  onToggle: (range: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
      aria-label={label}
      title={label}
      className={`select-box${state !== 'none' ? ' on' : ''}${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(e.shiftKey);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <span className="box" aria-hidden="true">
        {state === 'all' && <Icon name="check" />}
        {state === 'some' && <Icon name="check-mixed" />}
      </span>
    </button>
  );
}
