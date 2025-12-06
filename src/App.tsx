import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import type { MouseEvent as ReactMouseEvent, DragEvent as ReactDragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import { useSettings } from "./contexts/SettingsContext";
import { SettingsDialog } from "./components/dialogs/SettingsDialog";
import { FileTable } from "./components/files/FileTable";
import { TitleBar } from "./components/layout/TitleBar";
import { Sidebar } from "./components/layout/Sidebar";
import type { FileEntry, DirectoryContents, RecentZipFile, TabData, ContextMenu, ClipboardData, SortColumn, SortDirection } from "./types";

const appWindow = getCurrentWindow();
const EMPTY_SELECTION = new Set<string>();

function App() {
  const { settings, updateAppearance } = useSettings();
  const [pinnedFolders, setPinnedFolders] = useState<[string, string][]>([]);
  const [recentZips, setRecentZips] = useState<RecentZipFile[]>([]);
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [extractPath, setExtractPath] = useState("");
  const [extractingFile, setExtractingFile] = useState<FileEntry | null>(null);
  const [showExtractOptions, setShowExtractOptions] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["quick-access", "recent-archives"]));
  const [draggedFile, setDraggedFile] = useState<FileEntry | null>(null);
  const [draggedFromTab, setDraggedFromTab] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [isMaximized, setIsMaximized] = useState(false);
  const [archiveSortBy, setArchiveSortBy] = useState<'date' | 'size'>('date');
  const [archiveSortDirection, setArchiveSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogMessage, setConfirmDialogMessage] = useState("");
  const [confirmDialogCallback, setConfirmDialogCallback] = useState<(() => void) | null>(null);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertDialogMessage, setAlertDialogMessage] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateArchiveDialog, setShowCreateArchiveDialog] = useState(false);
  const [archiveName, setArchiveName] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameFileName, setRenameFileName] = useState("");
  const [renamingFile, setRenamingFile] = useState<FileEntry | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Sync dark mode with settings theme
  const isDarkMode = settings.appearance.theme === 'dark' ||
    (settings.appearance.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  const zoomLevel = settings.appearance.zoomLevel;

  const handleSelectAll = useCallback(() => {
    if (!activeTabId) return;

    setTabs(prevTabs =>
      prevTabs.map(tab => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        const allPaths = new Set(tab.files.map(file => file.path));
        const selectionUnchanged =
          allPaths.size === tab.selectedFiles.size &&
          Array.from(allPaths).every(path => tab.selectedFiles.has(path));

        if (selectionUnchanged) {
          return tab;
        }

        const lastPath = tab.files.length > 0 ? tab.files[tab.files.length - 1].path : null;

        return {
          ...tab,
          selectedFiles: allPaths,
          lastSelectedFile: lastPath
        };
      })
    );
  }, [activeTabId]);

  const handleClearSelection = useCallback(() => {
    if (!activeTabId) return;

    setTabs(prevTabs =>
      prevTabs.map(tab => {
        if (tab.id !== activeTabId || tab.selectedFiles.size === 0) {
          return tab;
        }

        return {
          ...tab,
          selectedFiles: new Set(),
          lastSelectedFile: null
        };
      })
    );
  }, [activeTabId]);

  // Initialize default sort from settings on first mount
  useEffect(() => {
    if (sortColumn === null) {
      setSortColumn(settings.behavior.defaultSort);
      setSortDirection(settings.behavior.defaultSortDirection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initializeApp();
    checkContextMenu();

    // Check initial maximized state
    appWindow.isMaximized().then(setIsMaximized);

    // Listen for window resize to update maximized state
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    // Ctrl + Scroll zoom functionality - adjusts font and spacing (table only)
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey && tableRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const newZoom = Math.max(1.05, Math.min(2.25, zoomLevel + delta));
        updateAppearance({ zoomLevel: newZoom });
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [zoomLevel, updateAppearance]);

  useEffect(() => {
    // Mouse button navigation (button 3 = back, button 4 = forward)
    const handleMouseButton = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const previousPath = navigationHistory[newIndex];
          setHistoryIndex(newIndex);
          loadDirectory(previousPath, activeTabId, false);
        }
      } else if (e.button === 4) {
        e.preventDefault();
        if (historyIndex < navigationHistory.length - 1) {
          const newIndex = historyIndex + 1;
          const nextPath = navigationHistory[newIndex];
          setHistoryIndex(newIndex);
          loadDirectory(nextPath, activeTabId, false);
        }
      }
    };

    document.addEventListener('mouseup', handleMouseButton);
    return () => document.removeEventListener('mouseup', handleMouseButton);
  }, [historyIndex, navigationHistory, activeTabId]);

  useEffect(() => {
    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      )) {
        return;
      }

      if ((event.key === 'a' || event.key === 'A') && event.ctrlKey) {
        event.preventDefault();
        handleSelectAll();
      } else if ((event.key === 'c' || event.key === 'C') && event.ctrlKey) {
        event.preventDefault();
        handleCopy();
      } else if ((event.key === 'x' || event.key === 'X') && event.ctrlKey) {
        event.preventDefault();
        handleCut();
      } else if ((event.key === 'v' || event.key === 'V') && event.ctrlKey) {
        event.preventDefault();
        handlePaste();
      } else if (event.key === 'Delete') {
        event.preventDefault();
        handleDelete();
      } else if (event.key === 'F2') {
        event.preventDefault();
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.selectedFiles.size === 1) {
          const selectedPath = Array.from(activeTab.selectedFiles)[0];
          const selectedFile = activeTab.files.find(f => f.path === selectedPath);
          if (selectedFile) {
            openRenameDialog(selectedFile);
          }
        }
      } else if (event.key === 'Escape') {
        handleClearSelection();
      }
    };

    window.addEventListener('keydown', handleKeyboardShortcuts);
    return () => window.removeEventListener('keydown', handleKeyboardShortcuts);
  }, [handleSelectAll, handleClearSelection, tabs, activeTabId]);

  useEffect(() => {
    // Backspace key navigation to go back
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if backspace is pressed and not in an input/textarea
      if (e.key === 'Backspace' &&
          !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          const previousPath = navigationHistory[newIndex];
          setHistoryIndex(newIndex);
          loadDirectory(previousPath, activeTabId, false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, navigationHistory, activeTabId]);

  // Live search with debouncing and minimum query length
  useEffect(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    // If search query is empty, reload the directory
    if (!searchQuery.trim()) {
      loadDirectory(activeTab.path, activeTabId, false);
      return;
    }

    // Only search if query is at least 2 characters
    if (searchQuery.trim().length < 2) {
      return;
    }

    // Debounce the search - wait 500ms after user stops typing
    const timeoutId = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await invoke<FileEntry[]>("search_files", {
          directory: activeTab.path,
          query: searchQuery
        });

        setTabs(tabs.map(tab =>
          tab.id === activeTabId ? { ...tab, files: results } : tab
        ));
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery, activeTabId]);

  function showAlert(message: string) {
    setAlertDialogMessage(message);
    setShowAlertDialog(true);
  }

  function showConfirm(message: string, callback: () => void) {
    setConfirmDialogMessage(message);
    setConfirmDialogCallback(() => callback);
    setShowConfirmDialog(true);
  }

  function handleConfirmYes() {
    if (confirmDialogCallback) {
      confirmDialogCallback();
    }
    setShowConfirmDialog(false);
    setConfirmDialogCallback(null);
  }

  function handleConfirmNo() {
    setShowConfirmDialog(false);
    setConfirmDialogCallback(null);
  }

  async function checkContextMenu() {
    // Try to register context menu on first run (requires admin)
    try {
      const exePath = await invoke<string>("get_app_path");
      await invoke("register_context_menu", { appPath: exePath });
      console.log("Context menu registered");
    } catch (error) {
      console.log("Context menu registration failed (may need admin rights):", error);
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function initializeApp() {
    try {
      const homeDir = await invoke<string>("get_home_directory");
      const commonDirs = await invoke<[string, string][]>("get_common_directories");
      const recent = await invoke<RecentZipFile[]>("get_recent_zip_files");

      setPinnedFolders(commonDirs);
      setRecentZips(recent);

      const newTabId = crypto.randomUUID();
      const contents = await invoke<DirectoryContents>("get_directory_contents", { path: homeDir });

      const newTab: TabData = {
        id: newTabId,
        path: homeDir,
        name: "Home",
        files: contents.files,
        selectedFiles: new Set(),
        lastSelectedFile: null
      };
      setTabs([newTab]);
      setActiveTabId(newTabId);
      setExtractPath(homeDir);

      // Initialize navigation history with home directory
      setNavigationHistory([homeDir]);
      setHistoryIndex(0);
    } catch (error) {
      console.error("Failed to initialize:", error);
    }
  }

  const loadDirectory = useCallback(async (path: string, tabId?: string, addToHistory: boolean = true) => {
    try {
      const contents = await invoke<DirectoryContents>("get_directory_contents", { path });

      // Apply hidden files filter (basic: dotfiles) if disabled in settings
      let files = contents.files;
      if (!settings.behavior.showHiddenFiles) {
        files = files.filter(f => !f.name.startsWith('.'));
      }

      // Apply default sort if user hasn't sorted yet
      const effectiveSortCol = sortColumn ?? settings.behavior.defaultSort;
      const effectiveSortDir = sortColumn ? sortDirection : settings.behavior.defaultSortDirection;
      files = [...files].sort((a, b) => {
        // Keep directories on top
        if (a.is_directory && !b.is_directory) return -1;
        if (!a.is_directory && b.is_directory) return 1;

        let cmp = 0;
        if (effectiveSortCol === 'name') cmp = a.name.localeCompare(b.name);
        else if (effectiveSortCol === 'size') cmp = a.size - b.size;
        else if (effectiveSortCol === 'modified') cmp = a.modified.localeCompare(b.modified);
        return effectiveSortDir === 'asc' ? cmp : -cmp;
      });
      const targetTabId = tabId || activeTabId;

      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === targetTabId
            ? {
                ...tab,
                path: contents.current_path,
                name: path.split(/[/\\]/).pop() || "Home",
                files,
                selectedFiles: new Set(),
                lastSelectedFile: null
              }
            : tab
        )
      );

      if (targetTabId === activeTabId) {
        setExtractPath(path);

        // Add to navigation history
        if (addToHistory) {
          const newHistory = navigationHistory.slice(0, historyIndex + 1);
          newHistory.push(path);
          setNavigationHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
        }
      }
      setSearchQuery("");
    } catch (error) {
      console.error("Failed to load directory:", error);
    }
  }, [activeTabId, navigationHistory, historyIndex, settings.behavior.defaultSort, settings.behavior.defaultSortDirection, settings.behavior.showHiddenFiles, sortColumn, sortDirection]);

  function goBack() {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const previousPath = navigationHistory[newIndex];
      setHistoryIndex(newIndex);
      loadDirectory(previousPath, activeTabId, false);
    }
  }

  function goForward() {
    if (historyIndex < navigationHistory.length - 1) {
      const newIndex = historyIndex + 1;
      const nextPath = navigationHistory[newIndex];
      setHistoryIndex(newIndex);
      loadDirectory(nextPath, activeTabId, false);
    }
  }


  const handleFileDoubleClick = useCallback((file: FileEntry) => {
    if (file.is_directory) {
      loadDirectory(file.path);
    }
  }, [loadDirectory]);

  const handleFileRightClick = useCallback((file: FileEntry, event: ReactMouseEvent<HTMLTableRowElement>) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      file,
      target: 'file',
    });
  }, []);

  const handleFileSelect = useCallback((filePath: string, event: ReactMouseEvent<HTMLTableRowElement>) => {
    const isToggle = event.ctrlKey || event.metaKey;
    const isRange = event.shiftKey;

    setTabs(prevTabs => {
      let updated = false;

      const nextTabs = prevTabs.map(tab => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        updated = true;
        const files = tab.files;
        let newSelected = new Set(tab.selectedFiles);
        let nextAnchor = tab.lastSelectedFile;
        let selectionChanged = false;

        if (isRange && files.length > 0) {
          const existingSelection = tab.lastSelectedFile
            ?? (tab.selectedFiles.size > 0 ? Array.from(tab.selectedFiles)[0] : null);
          const anchorPath = existingSelection ?? filePath;

          const startIndex = files.findIndex(f => f.path === anchorPath);
          const endIndex = files.findIndex(f => f.path === filePath);

          if (startIndex !== -1 && endIndex !== -1) {
            const start = Math.min(startIndex, endIndex);
            const end = Math.max(startIndex, endIndex);
            newSelected = new Set();
            for (let i = start; i <= end; i++) {
              newSelected.add(files[i].path);
            }
            nextAnchor = anchorPath;
            selectionChanged = true;
          } else {
            if (!newSelected.has(filePath) || newSelected.size !== 1) {
              newSelected = new Set([filePath]);
              selectionChanged = true;
            }
            nextAnchor = filePath;
          }
        } else if (isToggle) {
          if (newSelected.has(filePath)) {
            newSelected.delete(filePath);
            selectionChanged = true;
            if (nextAnchor === filePath) {
              nextAnchor = null;
            }
          } else {
            newSelected.add(filePath);
            selectionChanged = true;
            nextAnchor = filePath;
          }
        } else {
          if (newSelected.size !== 1 || !newSelected.has(filePath)) {
            newSelected = new Set([filePath]);
            selectionChanged = true;
          }
          nextAnchor = filePath;
        }

        const anchorChanged = nextAnchor !== tab.lastSelectedFile;

        return selectionChanged || anchorChanged
          ? { ...tab, selectedFiles: newSelected, lastSelectedFile: nextAnchor ?? null }
          : tab;
      });

      return updated ? nextTabs : prevTabs;
    });
  }, [activeTabId]);

  async function handleCopy() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.selectedFiles.size === 0) return;

    setClipboard({
      files: Array.from(activeTab.selectedFiles),
      operation: 'copy'
    });
  }

  async function handleCut() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.selectedFiles.size === 0) return;

    setClipboard({
      files: Array.from(activeTab.selectedFiles),
      operation: 'cut'
    });
  }

  async function handlePaste() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || !clipboard) return;

    try {
      for (const filePath of clipboard.files) {
        const fileName = filePath.split(/[/\\]/).pop() || '';
        const destPath = `${activeTab.path}\\${fileName}`;

        if (clipboard.operation === 'copy') {
          await invoke("copy_file", { sourcePath: filePath, destPath });
        } else {
          await invoke("move_file", { sourcePath: filePath, destPath });
        }
      }

      if (clipboard.operation === 'cut') {
        setClipboard(null);
      }

      loadDirectory(activeTab.path);
    } catch (error) {
      showAlert(`Failed to paste: ${error}`);
    }
  }

  async function handleDelete() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.selectedFiles.size === 0) return;

    const performDelete = async () => {
      try {
        for (const filePath of activeTab.selectedFiles) {
          await invoke("delete_file", { filePath });
        }
        loadDirectory(activeTab.path);
      } catch (error) {
        showAlert(`Failed to delete: ${error}`);
      }
    };

    if (settings.behavior.confirmDelete) {
      showConfirm(`Delete ${activeTab.selectedFiles.size} file(s)?`, performDelete);
    } else {
      performDelete();
    }
  }

  const handleSort = useCallback((column: SortColumn) => {
    const newDirection: SortDirection =
      sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';

    setSortColumn(column);
    setSortDirection(newDirection);

    setTabs((prevTabs) =>
      prevTabs.map((tab) => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        const sortedFiles = [...tab.files].sort((a, b) => {
          if (a.is_directory && !b.is_directory) return -1;
          if (!a.is_directory && b.is_directory) return 1;

          let comparison = 0;

          if (column === 'name') {
            comparison = a.name.localeCompare(b.name);
          } else if (column === 'size') {
            comparison = a.size - b.size;
          } else {
            comparison = a.modified.localeCompare(b.modified);
          }

          return newDirection === 'asc' ? comparison : -comparison;
        });

        return { ...tab, files: sortedFiles };
      })
    );
  }, [activeTabId, sortColumn, sortDirection]);

  async function createNewTab() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    const newPath = activeTab?.path || await invoke<string>("get_home_directory");
    const contents = await invoke<DirectoryContents>("get_directory_contents", { path: newPath });

    const newTabId = crypto.randomUUID();
    const newTab: TabData = {
      id: newTabId,
      path: newPath,
      name: newPath.split(/[/\\]/).pop() || "Home",
      files: contents.files,
      selectedFiles: new Set(),
      lastSelectedFile: null
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTabId);

    // Reset navigation history for the new tab
    setNavigationHistory([newPath]);
    setHistoryIndex(0);
  }

  function switchTab(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      setExtractPath(tab.path);
    }
  }

  function closeTab(tabId: string, event: ReactMouseEvent) {
    event.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== tabId);
    if (newTabs.length === 0) {
      initializeApp();
      return;
    }
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[0].id);
      setExtractPath(newTabs[0].path);
    }
  }

  function openExtractDialog(file: FileEntry) {
    setExtractingFile(file);
    setShowExtractOptions(true);
    setContextMenu(null);
  }

  async function handleExtractHere() {
    if (!extractingFile) return;

    try {
      // Extract to the same directory as the archive
      const archiveDir = extractingFile.path.split(/[/\\]/).slice(0, -1).join('\\') || extractingFile.path.split(/[/\\]/).slice(0, -1).join('/');

      await invoke("extract_archive", {
        archivePath: extractingFile.path,
        destinationPath: archiveDir
      });
      showAlert("Archive extracted successfully!");
      setShowExtractOptions(false);
      setExtractingFile(null);

      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        loadDirectory(activeTab.path);
      }

      const recent = await invoke<RecentZipFile[]>("get_recent_zip_files");
      setRecentZips(recent);
    } catch (error) {
      showAlert(`Failed to extract: ${error}`);
    }
  }

  function openExtractToDialog() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && extractingFile) {
      setExtractPath(activeTab.path);
      setShowExtractOptions(false);
      setShowExtractDialog(true);
    }
  }

  async function handleExtract() {
    if (!extractingFile) return;

    try {
      await invoke("extract_archive", {
        archivePath: extractingFile.path,
        destinationPath: extractPath
      });
      showAlert("Archive extracted successfully!");
      setShowExtractDialog(false);
      setExtractingFile(null);

      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        loadDirectory(activeTab.path);
      }

      const recent = await invoke<RecentZipFile[]>("get_recent_zip_files");
      setRecentZips(recent);
    } catch (error) {
      showAlert(`Failed to extract: ${error}`);
    }
  }

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const updated = new Set(prev);
      if (updated.has(folderId)) {
        updated.delete(folderId);
      } else {
        updated.add(folderId);
      }
      return updated;
    });
  }, []);

  const handleDragStart = useCallback((file: FileEntry, tabId: string, event: ReactDragEvent<HTMLElement>) => {
    setDraggedFile(file);
    setDraggedFromTab(tabId);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleRowDragStart = useCallback(
    (file: FileEntry, event: ReactDragEvent<HTMLElement>) => {
      if (activeTabId) {
        handleDragStart(file, activeTabId, event);
      }
    },
    [handleDragStart, activeTabId]
  );

  const handleMinimize = useCallback(() => {
    void appWindow.minimize();
  }, []);

  const handleToggleMaximize = useCallback(async () => {
    await appWindow.toggleMaximize();
    const maximized = await appWindow.isMaximized();
    setIsMaximized(maximized);
  }, []);

  const handleClose = useCallback(() => {
    void appWindow.close();
  }, []);

  const handleQuickAccessClick = useCallback((path: string) => {
    void loadDirectory(path);
  }, [loadDirectory]);

  const handleArchiveSortToggle = useCallback((sortKey: 'date' | 'size') => {
    setArchiveSortBy(prevSort => {
      if (prevSort === sortKey) {
        setArchiveSortDirection(prevDir => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevSort;
      }
      setArchiveSortDirection('desc');
      return sortKey;
    });
  }, []);

  const handleArchiveClick = useCallback(async (zip: RecentZipFile) => {
    const separator = zip.path.includes('\\') ? '\\' : '/';
    const dir = zip.path.split(/[/\\]/).slice(0, -1).join(separator);

    await loadDirectory(dir);

    setTimeout(() => {
      setTabs(prevTabs =>
        prevTabs.map(tab =>
          tab.id === activeTabId
            ? { ...tab, selectedFiles: new Set([zip.path]), lastSelectedFile: zip.path }
            : tab
        )
      );

      setTimeout(() => {
        const selectedRow = document.querySelector('.file-row.selected');
        if (selectedRow) {
          selectedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }, 100);
  }, [loadDirectory, activeTabId]);

  const handleArchiveContextMenu = useCallback(async (zip: RecentZipFile, event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault();
    const separator = zip.path.includes('\\') ? '\\' : '/';
    const dir = zip.path.split(/[/\\]/).slice(0, -1).join(separator);

    await loadDirectory(dir);

    const fileEntry: FileEntry = {
      name: zip.name,
      path: zip.path,
      size: zip.size,
      is_directory: false,
      modified: zip.modified,
      file_type: zip.name.split('.').pop()?.toUpperCase() || '',
      is_archive: true
    };

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      file: fileEntry,
      target: 'file',
    });
  }, [loadDirectory]);


  async function handleDropOnTab(targetTabId: string, e: ReactDragEvent<HTMLElement>) {
    e.preventDefault();
    if (!draggedFile || !draggedFromTab) return;

    const targetTab = tabs.find(t => t.id === targetTabId);
    if (!targetTab) return;

    try {
      const fileName = draggedFile.name;
      const destPath = `${targetTab.path}${targetTab.path.endsWith('\\') ? '' : '\\'}${fileName}`;

      await invoke("move_file", { sourcePath: draggedFile.path, destPath });

      // Reload both tabs
      loadDirectory(targetTab.path, targetTabId, false);
      if (draggedFromTab && draggedFromTab !== targetTabId) {
        const sourceTab = tabs.find(t => t.id === draggedFromTab);
        if (sourceTab) {
          loadDirectory(sourceTab.path, draggedFromTab, false);
        }
      }
    } catch (error) {
      showAlert(`Failed to move file: ${error}`);
    }

    setDraggedFile(null);
    setDraggedFromTab(null);
  }

  async function handleDropOnFolder(targetPath: string, e: ReactDragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedFile) return;

    try {
      const fileName = draggedFile.name;
      const destPath = `${targetPath}${targetPath.endsWith('\\') ? '' : '\\'}${fileName}`;

      await invoke("move_file", { sourcePath: draggedFile.path, destPath });

      // Reload the current tab
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab) {
        loadDirectory(activeTab.path, activeTabId, false);
      }
    } catch (error) {
      showAlert(`Failed to move file: ${error}`);
    }

    setDraggedFile(null);
    setDraggedFromTab(null);
  }

  async function handleDropOnQuickAccess(targetPath: string, e: ReactDragEvent<HTMLElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (!draggedFile) return;

    try {
      const fileName = draggedFile.name;
      const destPath = `${targetPath}${targetPath.endsWith('\\') ? '' : '\\'}${fileName}`;

      await invoke("move_file", { sourcePath: draggedFile.path, destPath });

      // Reload the source tab
      if (draggedFromTab) {
        const sourceTab = tabs.find(t => t.id === draggedFromTab);
        if (sourceTab) {
          loadDirectory(sourceTab.path, draggedFromTab, false);
        }
      }

      showAlert(`Moved ${fileName} to ${targetPath}`);
    } catch (error) {
      showAlert(`Failed to move file: ${error}`);
    }

    setDraggedFile(null);
    setDraggedFromTab(null);
  }

  function formatSize(size: number): string {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;

    if (size >= GB) {
      return `${(size / GB).toFixed(2)} GB`;
    } else if (size >= MB) {
      return `${(size / MB).toFixed(2)} MB`;
    } else if (size >= KB) {
      return `${(size / KB).toFixed(2)} KB`;
    } else {
      return `${size} B`;
    }
  }

  const sortedArchives = useMemo(() => {
    if (recentZips.length === 0) return [];

    const sorted = [...recentZips].sort((a, b) => {
      let comparison = 0;

      if (archiveSortBy === 'date') {
        comparison = a.modified_timestamp - b.modified_timestamp;
      } else if (archiveSortBy === 'size') {
        comparison = a.size - b.size;
      }

      return archiveSortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [recentZips, archiveSortBy, archiveSortDirection]);

  async function handleCreateFolder() {
    if (!newFolderName.trim()) {
      showAlert("Please enter a folder name");
      return;
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    try {
      await invoke("create_folder", {
        parentPath: activeTab.path,
        folderName: newFolderName.trim()
      });

      setShowNewFolderDialog(false);
      setNewFolderName("");
      loadDirectory(activeTab.path);
    } catch (error) {
      showAlert(`Failed to create folder: ${error}`);
    }
  }

  async function handleCreateArchive() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.selectedFiles.size === 0) return;

    const selectedArray = Array.from(activeTab.selectedFiles);
    const sourcePath = selectedArray[0];

    // Default archive name based on selection
    const baseName = sourcePath.split(/[/\\]/).pop() || 'archive';
    const defaultName = `${baseName}.7z`;

    setArchiveName(defaultName);
    setShowCreateArchiveDialog(true);
  }

  async function confirmCreateArchive() {
    if (!archiveName.trim()) {
      showAlert("Please enter an archive name");
      return;
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.selectedFiles.size === 0) return;

    const selectedArray = Array.from(activeTab.selectedFiles);
    const sourcePath = selectedArray[0];
    const archivePath = `${activeTab.path}\\${archiveName.trim()}`;

    try {
      await invoke("create_archive", {
        sourcePath,
        archivePath
      });
      showAlert("Archive created successfully!");
      setShowCreateArchiveDialog(false);
      setArchiveName("");
      loadDirectory(activeTab.path);

      const recent = await invoke<RecentZipFile[]>("get_recent_zip_files");
      setRecentZips(recent);
    } catch (error) {
      showAlert(`Failed to create archive: ${error}`);
    }
  }

  function openRenameDialog(file: FileEntry) {
    setRenamingFile(file);
    setRenameFileName(file.name);
    setShowRenameDialog(true);
    setContextMenu(null);
  }

  async function handleRename() {
    if (!renameFileName.trim() || !renamingFile) {
      showAlert("Please enter a new name");
      return;
    }

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const oldPath = renamingFile.path;
    const parentPath = oldPath.split(/[/\\]/).slice(0, -1).join('\\') || oldPath.split(/[/\\]/).slice(0, -1).join('/');
    const newPath = `${parentPath}\\${renameFileName.trim()}`;

    if (oldPath === newPath) {
      setShowRenameDialog(false);
      setRenamingFile(null);
      return;
    }

    try {
      await invoke("move_file", { sourcePath: oldPath, destPath: newPath });
      setShowRenameDialog(false);
      setRenamingFile(null);
      setRenameFileName("");
      loadDirectory(activeTab.path);
    } catch (error) {
      showAlert(`Failed to rename: ${error}`);
    }
  }

  const activeTab = useMemo(
    () => tabs.find(t => t.id === activeTabId) ?? null,
    [tabs, activeTabId]
  );
  const activeFiles = useMemo(() => activeTab?.files ?? [], [activeTab]);
  const selectedFiles = useMemo(
    () => (activeTab ? activeTab.selectedFiles : EMPTY_SELECTION),
    [activeTab]
  );

  // Apply dark mode to body based on settings
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  return (
    <div
      className={`app-container ${isDarkMode ? 'dark-mode' : ''} ${settings.appearance.compactMode ? 'compact-mode' : ''} icon-size-${settings.appearance.iconSize}`}
      style={{ fontSize: `${settings.appearance.fontSize}px` }}
    >
      {/* Diagonal Resize Handle */}
      <div
        className="resize-handle"
        onMouseDown={async (e) => {
          e.preventDefault();
          await appWindow.startResizeDragging('bottom-right' as any);
        }}
      />

      {/* Custom Title Bar */}
      <TitleBar
        isMaximized={isMaximized}
        onMinimize={handleMinimize}
        onToggleMaximize={handleToggleMaximize}
        onClose={handleClose}
      />

      <div className="main-layout">
        {/* Sidebar with pinned folders */}
        <Sidebar
          expandedFolders={expandedFolders}
          onToggleFolder={toggleFolder}
          pinnedFolders={pinnedFolders}
          onQuickAccessSelect={handleQuickAccessClick}
          onQuickAccessDrop={handleDropOnQuickAccess}
          onDragOver={handleDragOver}
          archives={sortedArchives}
          archiveSortBy={archiveSortBy}
          archiveSortDirection={archiveSortDirection}
          onArchiveSortToggle={handleArchiveSortToggle}
          onArchiveSelect={handleArchiveClick}
          onArchiveContextMenu={handleArchiveContextMenu}
          formatSize={formatSize}
          getFolderIcon={getFolderIcon}
        />

        {/* Main content area */}
        <div className="main-content">
          {/* Header with title */}
          <div className="header">
            <h1 className="title">Unbox</h1>
          </div>

          {/* Tabs and Search Bar */}
          <div className="tabs-search-container">
            <div className="tabs-wrapper">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
                  onClick={() => switchTab(tab.id)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDropOnTab(tab.id, e)}
                >
                  <span>{tab.name}</span>
                  {tabs.length > 1 && (
                    <button
                      className="tab-close"
                      onClick={(e) => closeTab(tab.id, e)}
                    >
                      ├ù
                    </button>
                  )}
                </div>
              ))}
              <button className="tab-new" onClick={createNewTab}>
                +
              </button>
            </div>

            {/* Settings Button */}
            <button
              className="settings-toggle"
              onClick={() => setShowSettings(true)}
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm88-29.84q.06-2.16,0-4.32l14.92-18.64a8,8,0,0,0,1.48-7.06,107.21,107.21,0,0,0-10.88-26.25,8,8,0,0,0-6-3.93l-23.72-2.64q-1.48-1.56-3-3L186,40.54a8,8,0,0,0-3.94-6,107.71,107.71,0,0,0-26.25-10.87,8,8,0,0,0-7.06,1.49L130.16,40Q128,40,125.84,40L107.2,25.11a8,8,0,0,0-7.06-1.48A107.6,107.6,0,0,0,73.89,34.51a8,8,0,0,0-3.93,6L67.32,64.27q-1.56,1.49-3,3L40.54,70a8,8,0,0,0-6,3.94,107.71,107.71,0,0,0-10.87,26.25,8,8,0,0,0,1.49,7.06L40,125.84Q40,128,40,130.16L25.11,148.8a8,8,0,0,0-1.48,7.06,107.21,107.21,0,0,0,10.88,26.25,8,8,0,0,0,6,3.93l23.72,2.64q1.49,1.56,3,3L70,215.46a8,8,0,0,0,3.94,6,107.71,107.71,0,0,0,26.25,10.87,8,8,0,0,0,7.06-1.49L125.84,216q2.16.06,4.32,0l18.64,14.92a8,8,0,0,0,7.06,1.48,107.21,107.21,0,0,0,26.25-10.88,8,8,0,0,0,3.93-6l2.64-23.72q1.56-1.48,3-3L215.46,186a8,8,0,0,0,6-3.94,107.71,107.71,0,0,0,10.87-26.25,8,8,0,0,0-1.49-7.06Zm-16.1-6.5a73.93,73.93,0,0,1,0,8.68,8,8,0,0,0,1.74,5.48l14.19,17.73a91.57,91.57,0,0,1-6.23,15L187,173.11a8,8,0,0,0-5.1,2.64,74.11,74.11,0,0,1-6.14,6.14,8,8,0,0,0-2.64,5.1l-2.51,22.58a91.32,91.32,0,0,1-15,6.23l-17.74-14.19a8,8,0,0,0-5-1.75h-.48a73.93,73.93,0,0,1-8.68,0,8,8,0,0,0-5.48,1.74L100.45,215.8a91.57,91.57,0,0,1-15-6.23L82.89,187a8,8,0,0,0-2.64-5.1,74.11,74.11,0,0,1-6.14-6.14,8,8,0,0,0-5.1-2.64L46.43,170.6a91.32,91.32,0,0,1-6.23-15l14.19-17.74a8,8,0,0,0,1.74-5.48,73.93,73.93,0,0,1,0-8.68,8,8,0,0,0-1.74-5.48L40.2,100.45a91.57,91.57,0,0,1,6.23-15L69,82.89a8,8,0,0,0,5.1-2.64,74.11,74.11,0,0,1,6.14-6.14A8,8,0,0,0,82.89,69L85.4,46.43a91.32,91.32,0,0,1,15-6.23l17.74,14.19a8,8,0,0,0,5.48,1.74,73.93,73.93,0,0,1,8.68,0,8,8,0,0,0,5.48-1.74L155.55,40.2a91.57,91.57,0,0,1,15,6.23L173.11,69a8,8,0,0,0,2.64,5.1,74.11,74.11,0,0,1,6.14,6.14,8,8,0,0,0,5.1,2.64l22.58,2.51a91.32,91.32,0,0,1,6.23,15l-14.19,17.74A8,8,0,0,0,199.87,123.66Z"/>
              </svg>
            </button>

            {/* Dark Mode Toggle */}
            <button
              className="dark-mode-toggle"
              onClick={() => updateAppearance({ theme: isDarkMode ? 'light' : 'dark' })}
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"/>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56A104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z"/>
                </svg>
              )}
            </button>

            {/* Search bar */}
            <div className="search-bar-compact">
              <div className="search-input-container-compact">
                <svg className="search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M229.66,218.34l-50.07-50.06a88.11,88.11,0,1,0-11.31,11.31l50.06,50.07a8,8,0,0,0,11.32-11.32ZM40,112a72,72,0,1,1,72,72A72.08,72.08,0,0,1,40,112Z" />
                </svg>
                <input
                  type="text"
                  className="search-input-compact"
                  placeholder="Search files"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {isSearching && (
                  <div className="search-loading" style={{
                    position: 'absolute',
                    right: searchQuery ? '2rem' : '0.5rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '0.75rem',
                    color: '#666',
                    pointerEvents: 'none'
                  }}>
                    ...
                  </div>
                )}
                {searchQuery && (
                  <button className="search-clear-compact" onClick={() => {
                    setSearchQuery("");
                  }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                      <path d="M165.66,101.66,139.31,128l26.35,26.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32ZM232,128A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Current Path Display with Navigation Buttons */}
          {activeTab && (
            <div className="path-container">
              <button
                className="back-button"
                onClick={goBack}
                disabled={historyIndex <= 0}
                title="Go back (Mouse Button 4)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"/>
                </svg>
              </button>
              <button
                className="forward-button"
                onClick={goForward}
                disabled={historyIndex >= navigationHistory.length - 1}
                title="Go forward (Mouse Button 5)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M221.66,133.66l-72,72a8,8,0,0,1-11.32-11.32L196.69,136H40a8,8,0,0,1,0-16H196.69L138.34,61.66a8,8,0,0,1,11.32-11.32l72,72A8,8,0,0,1,221.66,133.66Z"/>
                </svg>
              </button>
              <div className="path-display">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z" />
                </svg>
                <span className="path-text">{activeTab.path}</span>
              </div>
            </div>
          )}

          {/* File table */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="section-title">My Files</h3>
            {zoomLevel !== 1.5 && (
              <button
                onClick={() => updateAppearance({ zoomLevel: 1.5 })}
                style={{
                  padding: '0.4rem 0.75rem',
                  background: 'transparent',
                  border: '3px solid #1c140d',
                  fontSize: '0.875rem',
                  fontWeight: 900,
                  cursor: 'pointer',
                  color: '#D97A2B',
                  opacity: 0.7,
                  transition: 'opacity 0.2s, transform 0.1s',
                  boxShadow: '2px 2px 0 0 #1c140d'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                  e.currentTarget.style.transform = 'translate(-1px, -1px)';
                  e.currentTarget.style.boxShadow = '3px 3px 0 0 #1c140d';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                  e.currentTarget.style.transform = 'translate(0, 0)';
                  e.currentTarget.style.boxShadow = '2px 2px 0 0 #1c140d';
                }}
              >
                {((zoomLevel / 1.5) * 100).toFixed(0)}%
              </button>
            )}
          </div>
          <FileTable
            ref={tableRef}
            files={activeFiles}
            selectedFiles={selectedFiles}
            sortColumn={sortColumn}
            sortDirection={sortDirection}
            zoomLevel={zoomLevel}
            onSelect={handleFileSelect}
            onDoubleClick={handleFileDoubleClick}
            onContextMenu={handleFileRightClick}
            onSort={handleSort}
            onDragStart={handleRowDragStart}
            onDragOver={handleDragOver}
            onDropOnFolder={handleDropOnFolder}
            formatSize={formatSize}
          />

          {/* Action buttons */}
          <div className="actions">
            <div className="action-buttons">
              <button className="action-btn" title="Copy (Ctrl+C)" onClick={handleCopy} disabled={!activeTab || activeTab.selectedFiles.size === 0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
                </svg>
              </button>
              <button className="action-btn" title="Cut (Ctrl+X)" onClick={handleCut} disabled={!activeTab || activeTab.selectedFiles.size === 0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M157.73,113.13A36,36,0,0,0,144,56a36,36,0,1,0-32,58.85L89.14,152H72a36,36,0,1,0,0,72h0a36,36,0,0,0,33.72-48.27L128,152.94l22.28,22.79A36,36,0,1,0,184,224h0a36,36,0,0,0,0-72H166.86Z" />
                </svg>
              </button>
              <button className="action-btn" title="Paste (Ctrl+V)" onClick={handlePaste} disabled={!clipboard}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M168,152a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,152Zm-8-40H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm56-64V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V48A16,16,0,0,1,56,32H92.26a47.92,47.92,0,0,1,71.48,0H200A16,16,0,0,1,216,48Z" />
                </svg>
              </button>
              <button className="action-btn" title="Delete (Del)" onClick={handleDelete} disabled={!activeTab || activeTab.selectedFiles.size === 0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16Z" />
                </svg>
              </button>
              <button className="action-btn" title="New Folder" onClick={() => setShowNewFolderDialog(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Zm-88,88a8,8,0,0,1,8,8v16h16a8,8,0,0,1,0,16H136v16a8,8,0,0,1-16,0V152H104a8,8,0,0,1,0-16h16V120A8,8,0,0,1,128,112Z" />
                </svg>
              </button>
              <button className="action-btn" title="Create Archive" onClick={handleCreateArchive} disabled={!activeTab || activeTab.selectedFiles.size === 0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-40-64a8,8,0,0,1-8,8H136v16a8,8,0,0,1-16,0V160H104a8,8,0,0,1,0-16h16V128a8,8,0,0,1,16,0v16h16A8,8,0,0,1,160,152Z"/>
                </svg>
              </button>
            </div>
            <button
              className={`extract-btn ${
                activeTab && activeTab.selectedFiles.size === 1 && (() => {
                  const selectedArray = Array.from(activeTab.selectedFiles);
                  const selectedFile = activeTab.files.find(f => f.path === selectedArray[0]);
                  if (selectedFile) return selectedFile.is_archive;
                  return selectedArray[0] ? /\.(7z|zip|rar|tar|gz|bz2|xz)$/i.test(selectedArray[0]) : false;
                })() ? 'active' : ''
              }`}
              onClick={() => {
              if (!activeTab) return;
              const selectedArray = Array.from(activeTab.selectedFiles);

              // Find the selected file - it might be in the current tab's files or we need to check if it's a valid archive path
              let selectedFile = activeTab.files.find(f => f.path === selectedArray[0]);

              // If not found in current files, check if the selected path is an archive file
              if (!selectedFile && selectedArray[0]) {
                const path = selectedArray[0];
                const isArchive = /\.(7z|zip|rar|tar|gz|bz2|xz)$/i.test(path);
                if (isArchive) {
                  // Create a temporary FileEntry for the selected archive
                  selectedFile = {
                    name: path.split(/[/\\]/).pop() || '',
                    path: path,
                    size: 0,
                    is_directory: false,
                    modified: '',
                    file_type: path.split('.').pop()?.toUpperCase() || '',
                    is_archive: true
                  };
                }
              }

              if (selectedFile?.is_archive) {
                openExtractDialog(selectedFile);
              }
            }} disabled={!activeTab || activeTab.selectedFiles.size !== 1 || (() => {
              if (!activeTab) return true;
              const selectedArray = Array.from(activeTab.selectedFiles);
              const selectedFile = activeTab.files.find(f => f.path === selectedArray[0]);
              if (selectedFile) return !selectedFile.is_archive;
              // Check if it's a valid archive path
              return selectedArray[0] ? !/\.(7z|zip|rar|tar|gz|bz2|xz)$/i.test(selectedArray[0]) : true;
            })()}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                <path d="M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64Z" />
              </svg>
              <span>Extract</span>
            </button>
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenu.target === 'file' && contextMenu.file && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {/* Open action for folders */}
          {contextMenu.file.is_directory && (
            <div className="context-menu-item" onClick={() => {
              loadDirectory(contextMenu.file!.path);
              setContextMenu(null);
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z" />
              </svg>
              Open
            </div>
          )}

          {/* Extract actions for archives */}
          {contextMenu.file.is_archive && (
            <>
              <div className="context-menu-item" onClick={() => openExtractDialog(contextMenu.file!)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64Z" />
                </svg>
                Extract Here
              </div>
              <div className="context-menu-item" onClick={() => {
                setExtractPath(activeTab?.path || "");
                openExtractDialog(contextMenu.file!);
              }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z" />
                </svg>
                Extract To...
              </div>
              <div className="context-menu-divider" />
            </>
          )}

          {/* Create archive action for non-archives */}
          {!contextMenu.file.is_archive && (
            <div className="context-menu-item" onClick={() => {
              setTabs(prevTabs =>
                prevTabs.map(tab =>
                  tab.id === activeTabId
                    ? { ...tab, selectedFiles: new Set([contextMenu.file!.path]), lastSelectedFile: contextMenu.file!.path }
                    : tab
                )
              );
              handleCreateArchive();
              setContextMenu(null);
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>
              </svg>
              Add to Archive...
            </div>
          )}

          {/* Copy */}
          <div className="context-menu-item" onClick={() => {
            setTabs(prevTabs =>
              prevTabs.map(tab =>
                tab.id === activeTabId
                  ? { ...tab, selectedFiles: new Set([contextMenu.file!.path]), lastSelectedFile: contextMenu.file!.path }
                  : tab
              )
            );
            setClipboard({ files: [contextMenu.file!.path], operation: 'copy' });
            setContextMenu(null);
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
            </svg>
            Copy
          </div>

          {/* Cut */}
          <div className="context-menu-item" onClick={() => {
            setTabs(prevTabs =>
              prevTabs.map(tab =>
                tab.id === activeTabId
                  ? { ...tab, selectedFiles: new Set([contextMenu.file!.path]), lastSelectedFile: contextMenu.file!.path }
                  : tab
              )
            );
            setClipboard({ files: [contextMenu.file!.path], operation: 'cut' });
            setContextMenu(null);
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M157.73,113.13A36,36,0,0,0,144,56a36,36,0,1,0-32,58.85L89.14,152H72a36,36,0,1,0,0,72h0a36,36,0,0,0,33.72-48.27L128,152.94l22.28,22.79A36,36,0,1,0,184,224h0a36,36,0,0,0,0-72H166.86ZM128,128a8,8,0,0,1-5.66-2.34l-8-8a8,8,0,0,1,0-11.32l24-24a8,8,0,0,1,11.32,11.32L128,115.31l-5.66-5.65a8,8,0,0,1,11.32-11.32l8,8a8,8,0,0,1,0,11.32l-8,8A8,8,0,0,1,128,128Z" />
            </svg>
            Cut
          </div>

          <div className="context-menu-divider" />

          {/* Rename */}
          <div className="context-menu-item" onClick={() => openRenameDialog(contextMenu.file!)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M227.32,73.37,182.63,28.69a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31l123.31-123.32A16,16,0,0,0,227.32,73.37ZM92.69,208H48V163.31l88-88L180.69,120Z"/>
            </svg>
            Rename
          </div>

          {/* Delete */}
          <div className="context-menu-item context-menu-item-danger" onClick={() => {
            const performDelete = async () => {
              try {
                await invoke("delete_file", { filePath: contextMenu.file!.path });
                const activeTab = tabs.find(t => t.id === activeTabId);
                if (activeTab) loadDirectory(activeTab.path);
              } catch (error) {
                showAlert(`Failed to delete: ${error}`);
              }
            };
            if (settings.behavior.confirmDelete) {
              showConfirm(`Delete "${contextMenu.file!.name}"?`, performDelete);
            } else {
              performDelete();
            }
            setContextMenu(null);
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16Z" />
            </svg>
            Delete
          </div>
        </div>
      )}

      {/* Extract Options Dialog */}
      {showExtractOptions && extractingFile && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h2 className="dialog-title">Extract Archive</h2>
            </div>
            <div className="dialog-body">
              <div className="dialog-field">
                <label className="dialog-label">Archive:</label>
                <div style={{ fontWeight: 600, marginBottom: '1rem' }}>{extractingFile.name}</div>
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-secondary"
                onClick={() => {
                  setShowExtractOptions(false);
                  setExtractingFile(null);
                }}
              >
                Cancel
              </button>
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={handleExtractHere}
              >
                Extract Here
              </button>
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={openExtractToDialog}
              >
                Extract To...
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extract To Dialog */}
      {showExtractDialog && extractingFile && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h2 className="dialog-title">Extract To</h2>
            </div>
            <div className="dialog-body">
              <div className="dialog-field">
                <label className="dialog-label">Archive:</label>
                <div style={{ fontWeight: 600, marginBottom: '1rem' }}>{extractingFile.name}</div>
              </div>
              <div className="dialog-field">
                <label className="dialog-label">Extract to:</label>
                <input
                  type="text"
                  className="dialog-input"
                  value={extractPath}
                  onChange={(e) => setExtractPath(e.target.value)}
                />
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-secondary"
                onClick={() => {
                  setShowExtractDialog(false);
                  setExtractingFile(null);
                }}
              >
                Cancel
              </button>
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={handleExtract}
              >
                Extract
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Dialog */}
      {showNewFolderDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h2 className="dialog-title">Create New Folder</h2>
            </div>
            <div className="dialog-body">
              <div className="dialog-field">
                <label className="dialog-label">Folder Name:</label>
                <input
                  type="text"
                  className="dialog-input"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                  placeholder="Enter folder name"
                  autoFocus
                />
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-secondary"
                onClick={() => {
                  setShowNewFolderDialog(false);
                  setNewFolderName("");
                }}
              >
                Cancel
              </button>
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={handleCreateFolder}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Archive Dialog */}
      {showCreateArchiveDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h2 className="dialog-title">Create Archive</h2>
            </div>
            <div className="dialog-body">
              <div className="dialog-field">
                <label className="dialog-label">Archive Name:</label>
                <input
                  type="text"
                  className="dialog-input"
                  value={archiveName}
                  onChange={(e) => setArchiveName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmCreateArchive()}
                  placeholder="archive.7z"
                  autoFocus
                />
              </div>
              <p style={{ fontSize: '0.875rem', color: '#6C5F4E', marginTop: '0.5rem' }}>
                Archive will be created in the current directory.
              </p>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-secondary"
                onClick={() => {
                  setShowCreateArchiveDialog(false);
                  setArchiveName("");
                }}
              >
                Cancel
              </button>
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={confirmCreateArchive}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {showRenameDialog && renamingFile && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h2 className="dialog-title">Rename</h2>
            </div>
            <div className="dialog-body">
              <div className="dialog-field">
                <label className="dialog-label">New Name:</label>
                <input
                  type="text"
                  className="dialog-input"
                  value={renameFileName}
                  onChange={(e) => setRenameFileName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                  autoFocus
                />
              </div>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-secondary"
                onClick={() => {
                  setShowRenameDialog(false);
                  setRenamingFile(null);
                  setRenameFileName("");
                }}
              >
                Cancel
              </button>
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={handleRename}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirmDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h2 className="dialog-title">Confirm</h2>
            </div>
            <div className="dialog-body">
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1c140d' }}>
                {confirmDialogMessage}
              </p>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-secondary"
                onClick={handleConfirmNo}
              >
                No
              </button>
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={handleConfirmYes}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Dialog */}
      {showAlertDialog && (
        <div className="dialog-overlay">
          <div className="dialog">
            <div className="dialog-header">
              <h2 className="dialog-title">Message</h2>
            </div>
            <div className="dialog-body">
              <p style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1c140d' }}>
                {alertDialogMessage}
              </p>
            </div>
            <div className="dialog-actions">
              <button
                className="dialog-btn dialog-btn-primary"
                onClick={() => setShowAlertDialog(false)}
                style={{ flex: 'none', minWidth: '150px' }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Dialog */}
      <SettingsDialog isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

function getFolderIcon(name: string) {
  const iconProps = { className: "icon", xmlns: "http://www.w3.org/2000/svg", width: "18", height: "18", fill: "currentColor", viewBox: "0 0 256 256" };

  switch (name.toLowerCase()) {
    case "home":
      return <svg {...iconProps}><path d="M218.83,103.77l-80-75.48a1.14,1.14,0,0,1-.11-.11,16,16,0,0,0-21.53,0l-.11.11L37.17,103.77A16,16,0,0,0,32,115.55V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V160h32v48a16,16,0,0,0,16,16h48a16,16,0,0,0,16-16V115.55A16,16,0,0,0,218.83,103.77Z"/></svg>;
    case "desktop":
      return <svg {...iconProps}><path d="M208,40H48A24,24,0,0,0,24,64V176a24,24,0,0,0,24,24h72v16H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16H136V200h72a24,24,0,0,0,24-24V64A24,24,0,0,0,208,40Z"/></svg>;
    case "documents":
      return <svg {...iconProps}><path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/></svg>;
    case "downloads":
      return <svg {...iconProps}><path d="M224,144v64a8,8,0,0,1-8,8H40a8,8,0,0,1-8-8V144a8,8,0,0,1,16,0v56H208V144a8,8,0,0,1,16,0Zm-101.66,5.66a8,8,0,0,0,11.32,0l40-40a8,8,0,0,0-11.32-11.32L136,124.69V24a8,8,0,0,0-16,0V124.69L93.66,98.34a8,8,0,0,0-11.32,11.32Z"/></svg>;
    case "pictures":
      return <svg {...iconProps}><path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM96,88a16,16,0,1,1-16,16A16,16,0,0,1,96,88Z"/></svg>;
    case "music":
      return <svg {...iconProps}><path d="M212.92,25.69a8,8,0,0,0-6.86-1.45l-128,32A8,8,0,0,0,72,64V174.08A36,36,0,1,0,88,204V70.25l112-28v99.83A36,36,0,1,0,216,172V32A8,8,0,0,0,212.92,25.69Z"/></svg>;
    case "videos":
      return <svg {...iconProps}><path d="M164.44,105.34l-48-32A8,8,0,0,0,104,80v64a8,8,0,0,0,12.44,6.66l48-32a8,8,0,0,0,0-13.32ZM232,80v96a16,16,0,0,1-16,16H40a16,16,0,0,1-16-16V80A16,16,0,0,1,40,64H216A16,16,0,0,1,232,80Z"/></svg>;
    default:
      return <svg {...iconProps}><path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z"/></svg>;
  }
}

export default App;

