// Core data types
export interface FileEntry {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  modified: string;
  file_type: string;
  is_archive: boolean;
}

export interface DirectoryContents {
  current_path: string;
  files: FileEntry[];
}

export interface RecentZipFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  modified_timestamp: number;
}

export interface TabData {
  id: string;
  path: string;
  name: string;
  files: FileEntry[];
  selectedFiles: Set<string>;
}

export interface ContextMenu {
  x: number;
  y: number;
  file: FileEntry;
}

// Settings types
export type Theme = 'light' | 'dark' | 'auto';
export type IconSize = 'small' | 'medium' | 'large';
export type SortColumn = 'name' | 'size' | 'modified';
export type SortDirection = 'asc' | 'desc';
export type ViewMode = 'list' | 'grid' | 'details';

export interface AppearanceSettings {
  theme: Theme;
  fontSize: number;
  iconSize: IconSize;
  compactMode: boolean;
  zoomLevel: number;
}

export interface BehaviorSettings {
  doubleClickSpeed: number;
  confirmDelete: boolean;
  showHiddenFiles: boolean;
  defaultSort: SortColumn;
  defaultSortDirection: SortDirection;
  defaultView: ViewMode;
  autoRefresh: boolean;
}

export interface PerformanceSettings {
  maxRecentArchives: number;
  searchDepth: number;
  enableVirtualScrolling: boolean;
  cacheSize: number;
}

export interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
}

export interface Settings {
  appearance: AppearanceSettings;
  behavior: BehaviorSettings;
  performance: PerformanceSettings;
  shortcuts: Record<string, KeyboardShortcut>;
}

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  appearance: {
    theme: 'light',
    fontSize: 16,
    iconSize: 'medium',
    compactMode: false,
    zoomLevel: 1.5,
  },
  behavior: {
    doubleClickSpeed: 300,
    confirmDelete: true,
    showHiddenFiles: false,
    defaultSort: 'name',
    defaultSortDirection: 'asc',
    defaultView: 'list',
    autoRefresh: false,
  },
  performance: {
    maxRecentArchives: 20,
    searchDepth: 5,
    enableVirtualScrolling: false,
    cacheSize: 100,
  },
  shortcuts: {
    newFolder: { key: 'n', ctrl: true, description: 'New Folder' },
    newTab: { key: 't', ctrl: true, description: 'New Tab' },
    closeTab: { key: 'w', ctrl: true, description: 'Close Tab' },
    copy: { key: 'c', ctrl: true, description: 'Copy' },
    cut: { key: 'x', ctrl: true, description: 'Cut' },
    paste: { key: 'v', ctrl: true, description: 'Paste' },
    delete: { key: 'Delete', description: 'Delete' },
    rename: { key: 'F2', description: 'Rename' },
    refresh: { key: 'F5', description: 'Refresh' },
    selectAll: { key: 'a', ctrl: true, description: 'Select All' },
    search: { key: 'f', ctrl: true, description: 'Search' },
    goToPath: { key: 'g', ctrl: true, description: 'Go to Path' },
    preview: { key: ' ', description: 'Quick Preview' },
  },
};

// Clipboard types
export interface ClipboardData {
  files: string[];
  operation: 'copy' | 'cut';
}

// Operation history types
export type FileOperation =
  | { type: 'copy'; source: string[]; dest: string }
  | { type: 'move'; source: string[]; dest: string }
  | { type: 'delete'; paths: string[] }
  | { type: 'rename'; oldPath: string; newPath: string }
  | { type: 'create'; path: string; isDirectory: boolean };

export interface OperationHistoryItem {
  id: string;
  operation: FileOperation;
  timestamp: number;
  canUndo: boolean;
}
