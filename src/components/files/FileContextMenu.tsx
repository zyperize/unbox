import { forwardRef, memo } from 'react';
import type { ReactNode } from 'react';

export interface ContextMenuEntry {
  type?: 'item' | 'divider';
  label?: string;
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
}

interface FileContextMenuProps {
  position: { x: number; y: number };
  items: ContextMenuEntry[];
}

export const FileContextMenu = memo(
  forwardRef<HTMLDivElement, FileContextMenuProps>(function FileContextMenuBase(
    { position, items },
    ref
  ) {
    if (!items.length) {
      return null;
    }

    return (
      <div ref={ref} className="context-menu" style={{ left: position.x, top: position.y }} role="menu">
        {items.map((item, index) => {
          if (item.type === 'divider') {
            return <div key={`divider-${index}`} className="context-menu-divider" role="separator" />;
          }

          const handleClick = () => {
            if (item.disabled) return;
            item.onClick?.();
          };

          return (
            <div
              key={`${item.label}-${index}`}
              className={`context-menu-item${item.disabled ? ' disabled' : ''}`}
              onClick={handleClick}
              role="menuitem"
              aria-disabled={item.disabled}
            >
              {item.icon && <span className="context-menu-icon">{item.icon}</span>}
              <span className="context-menu-label">{item.label}</span>
              {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
            </div>
          );
        })}
      </div>
    );
  })
);
