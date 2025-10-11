import { memo } from 'react';
import type {
  RecentZipFile,
  SortDirection,
} from '../../types';
import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react';

interface SidebarProps {
  expandedFolders: Set<string>;
  onToggleFolder: (folderId: string) => void;
  pinnedFolders: [string, string][];
  onQuickAccessSelect: (path: string) => void;
  onQuickAccessDrop: (path: string, event: ReactDragEvent<HTMLElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  archives: RecentZipFile[];
  archiveSortBy: 'date' | 'size';
  archiveSortDirection: SortDirection;
  onArchiveSortToggle: (sortBy: 'date' | 'size') => void;
  onArchiveSelect: (zip: RecentZipFile) => void;
  onArchiveContextMenu: (zip: RecentZipFile, event: ReactMouseEvent<HTMLElement>) => void;
  formatSize: (size: number) => string;
  getFolderIcon: (name: string) => ReactNode;
}

export const Sidebar = memo(function Sidebar({
  expandedFolders,
  onToggleFolder,
  pinnedFolders,
  onQuickAccessSelect,
  onQuickAccessDrop,
  onDragOver,
  archives,
  archiveSortBy,
  archiveSortDirection,
  onArchiveSortToggle,
  onArchiveSelect,
  onArchiveContextMenu,
  formatSize,
  getFolderIcon,
}: SidebarProps) {
  const isQuickAccessExpanded = expandedFolders.has('quick-access');
  const isRecentArchivesExpanded = expandedFolders.has('recent-archives');

  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <button
          className="sidebar-folder-header"
          onClick={() => onToggleFolder('quick-access')}
        >
          <svg
            className="folder-chevron"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            fill="currentColor"
            viewBox="0 0 256 256"
            style={{ transform: isQuickAccessExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
          </svg>
          Quick Access
        </button>
        {isQuickAccessExpanded && (
          <div className="sidebar-items">
            {pinnedFolders.map(([name, path]) => (
              <button
                key={path}
                className="sidebar-item quick-access-item"
                onClick={() => onQuickAccessSelect(path)}
                onDragOver={onDragOver}
                onDrop={(event) => onQuickAccessDrop(path, event)}
              >
                {getFolderIcon(name)}
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      {archives.length > 0 && (
        <div className="sidebar-section">
          <button
            className="sidebar-folder-header"
            onClick={() => onToggleFolder('recent-archives')}
          >
            <svg
              className="folder-chevron"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              viewBox="0 0 256 256"
              style={{ transform: isRecentArchivesExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
            </svg>
            Recent Archives ({archives.length})
          </button>
          {isRecentArchivesExpanded && (
            <>
              <div className="archive-sort-controls">
                <button
                  className={`archive-sort-btn ${archiveSortBy === 'date' ? 'active' : ''}`}
                  onClick={() => onArchiveSortToggle('date')}
                  title={`Sort by date modified (${archiveSortBy === 'date' ? (archiveSortDirection === 'asc' ? 'oldest first' : 'newest first') : 'click to sort'})`}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Date</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    fill="currentColor"
                    viewBox="0 0 256 256"
                    style={{ opacity: archiveSortBy === 'date' ? 1 : 0.3 }}
                  >
                    {(archiveSortBy === 'date' && archiveSortDirection === 'asc') || archiveSortBy !== 'date' ? (
                      <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z" />
                    ) : (
                      <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z" />
                    )}
                  </svg>
                </button>
                <button
                  className={`archive-sort-btn ${archiveSortBy === 'size' ? 'active' : ''}`}
                  onClick={() => onArchiveSortToggle('size')}
                  title={`Sort by size (${archiveSortBy === 'size' ? (archiveSortDirection === 'asc' ? 'smallest first' : 'largest first') : 'click to sort'})`}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Size</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    fill="currentColor"
                    viewBox="0 0 256 256"
                    style={{ opacity: archiveSortBy === 'size' ? 1 : 0.3 }}
                  >
                    {(archiveSortBy === 'size' && archiveSortDirection === 'asc') || archiveSortBy !== 'size' ? (
                      <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z" />
                    ) : (
                      <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z" />
                    )}
                  </svg>
                </button>
              </div>
              <div className="sidebar-items archive-scrollable" key={`${archiveSortBy}-${archiveSortDirection}`}>
                {archives.map((zip) => (
                  <button
                    key={zip.path}
                    className="sidebar-item"
                    onClick={() => onArchiveSelect(zip)}
                    onContextMenu={(event) => onArchiveContextMenu(zip, event)}
                    title={zip.path}
                  >
                    <div className="archive-item-content">
                      <svg className="icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-48-80a8,8,0,0,1-8,8H136v8h8a8,8,0,0,1,0,16h-8v8a8,8,0,0,1-16,0v-8h-8a8,8,0,0,1,0-16h8v-8h-8a8,8,0,0,1,0-16h8v-8a8,8,0,0,1,16,0v8h8A8,8,0,0,1,152,136Z" />
                      </svg>
                      <div className="archive-item-info">
                        <span className="sidebar-item-text">{zip.name}</span>
                        <div className="archive-item-meta">
                          <span className="archive-size">{formatSize(zip.size)}</span>
                          <span className="archive-date">{zip.modified}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
});
