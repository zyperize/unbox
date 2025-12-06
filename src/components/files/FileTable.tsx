import { forwardRef, memo, useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent } from 'react';
import type { FileEntry, SortColumn, SortDirection } from '../../types';
import { FileRow } from './FileRow';

interface FileTableProps {
  files: FileEntry[];
  selectedFiles: Set<string>;
  sortColumn: SortColumn | null;
  sortDirection: SortDirection;
  zoomLevel: number;
  onSelect: (filePath: string, event: ReactMouseEvent<HTMLTableRowElement>) => void;
  onDoubleClick: (file: FileEntry) => void;
  onContextMenu: (file: FileEntry, event: ReactMouseEvent<HTMLTableRowElement>) => void;
  onSort: (column: SortColumn) => void;
  onDragStart: (file: FileEntry, event: ReactDragEvent<HTMLElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDropOnFolder: (path: string, event: ReactDragEvent<HTMLElement>) => void;
  formatSize: (size: number) => string;
  onEmptyContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

const FileTableBase = forwardRef<HTMLDivElement, FileTableProps>(function FileTableBase(
  {
    files,
    selectedFiles,
    sortColumn,
    sortDirection,
    zoomLevel,
    onSelect,
    onDoubleClick,
    onContextMenu,
    onSort,
    onDragStart,
    onDragOver,
    onDropOnFolder,
    formatSize,
    onEmptyContextMenu,
  },
  ref
) {
  const handleContainerContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onEmptyContextMenu) return;
    const target = event.target as HTMLElement;
    if (target.closest('tr')) {
      return;
    }
    event.preventDefault();
    onEmptyContextMenu(event);
  };

  const rows = useMemo(
    () =>
      files.map((file) => (
        <FileRow
          key={file.path}
          file={file}
          isSelected={selectedFiles.has(file.path)}
          onSelect={onSelect}
          onDoubleClick={onDoubleClick}
          onContextMenu={onContextMenu}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDropOnFolder={onDropOnFolder}
          formatSize={formatSize}
        />
      )),
    [files, selectedFiles, onSelect, onDoubleClick, onContextMenu, onDragStart, onDragOver, onDropOnFolder, formatSize]
  );

  const renderSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return null;

    return (
      <svg className="sort-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256">
        {sortDirection === 'asc' ? (
          <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z" />
        ) : (
          <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z" />
        )}
      </svg>
    );
  };

  return (
    <div className="table-container" ref={ref} onContextMenu={handleContainerContextMenu}>
      <div className="table-wrapper">
        <table
          className="file-table"
          style={{
            fontSize: `${zoomLevel * 16}px`,
          }}
        >
          <thead>
            <tr>
              <th className="th-name">Name</th>
              <th className="th-size th-sortable" onClick={() => onSort('size')}>
                <div className="th-content">
                  Size
                  {renderSortIcon('size')}
                </div>
              </th>
              <th className="th-modified th-sortable" onClick={() => onSort('modified')}>
                <div className="th-content">
                  Last Modified
                  {renderSortIcon('modified')}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    </div>
  );
});

export const FileTable = memo(FileTableBase);
