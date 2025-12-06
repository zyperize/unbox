import { memo } from 'react';
import type { MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent } from 'react';
import type { FileEntry } from '../../types';

interface FileRowProps {
  file: FileEntry;
  isSelected: boolean;
  onSelect: (filePath: string, event: ReactMouseEvent<HTMLTableRowElement>) => void;
  onDoubleClick: (file: FileEntry) => void;
  onContextMenu: (file: FileEntry, event: ReactMouseEvent<HTMLTableRowElement>) => void;
  onDragStart: (file: FileEntry, event: ReactDragEvent<HTMLElement>) => void;
  onDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  onDropOnFolder: (path: string, event: ReactDragEvent<HTMLElement>) => void;
  formatSize: (size: number) => string;
}

export const FileRow = memo(function FileRow({
  file,
  isSelected,
  onSelect,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDropOnFolder,
  formatSize,
}: FileRowProps) {
  const isZip = file.name.toLowerCase().endsWith('.zip');

  const handleClick = (event: ReactMouseEvent<HTMLTableRowElement>) => {
    onSelect(file.path, event);
  };

  const handleDoubleClick = () => {
    onDoubleClick(file);
  };

  const handleContextMenu = (event: ReactMouseEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(file, event);
  };

  const handleDragStartInternal = (event: ReactDragEvent<HTMLElement>) => {
    onDragStart(file, event);
  };

  const handleDrop = file.is_directory
    ? (event: ReactDragEvent<HTMLElement>) => onDropOnFolder(file.path, event)
    : undefined;

  const handleDragOverInternal = file.is_directory ? onDragOver : undefined;

  return (
    <tr
      className={`file-row ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
      draggable
      onDragStart={handleDragStartInternal}
      onDragOver={handleDragOverInternal}
      onDrop={handleDrop}
    >
      <td className={`file-name ${isZip ? 'zip-file' : ''}`}>
        {file.is_directory ? (
          <svg className="folder-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
            <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z" />
          </svg>
        ) : isZip ? (
          <svg className="zip-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
            <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-48-80a8,8,0,0,1-8,8H136v8h8a8,8,0,0,1,0,16h-8v8a8,8,0,0,1-16,0v-8h-8a8,8,0,0,1,0-16h8v-8h-8a8,8,0,0,1,0-16h8v-8a8,8,0,0,1,16,0v8h8A8,8,0,0,1,152,136Z"/>
          </svg>
        ) : file.is_archive ? (
          <svg className="archive-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
            <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>
          </svg>
        ) : null}
        <span className={isZip ? 'zip-text' : ''}>{file.name}</span>
      </td>
      <td className={`file-size ${isZip ? 'zip-size' : ''}`}>
        {file.is_directory ? '—' : formatSize(file.size)}
      </td>
      <td className={`file-modified ${isZip ? 'zip-modified' : ''}`}>{file.modified}</td>
    </tr>
  );
});

FileRow.displayName = 'FileRow';
