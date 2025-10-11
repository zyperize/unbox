import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

const appWindow = getCurrentWindow();

interface FileEntry {
  name: string;
  path: string;
  size: number;
  is_directory: boolean;
  modified: string;
  file_type: string;
  is_archive: boolean;
}

interface DirectoryContents {
  current_path: string;
  files: FileEntry[];
}

interface TabData {
  id: string;
  path: string;
  name: string;
  files: FileEntry[];
  selectedFiles: Set<string>;
}

interface RecentZipFile {
  name: string;
  path: string;
  size: number;
  modified: string;
  modified_timestamp: number;
}

interface ContextMenu {
  x: number;
  y: number;
  file: FileEntry;
}

function App() {
  const [pinnedFolders, setPinnedFolders] = useState<[string, string][]>([]);
  const [recentZips, setRecentZips] = useState<RecentZipFile[]>([]);
  const [tabs, setTabs] = useState<TabData[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [showExtractDialog, setShowExtractDialog] = useState(false);
  const [extractPath, setExtractPath] = useState("");
  const [extractingFile, setExtractingFile] = useState<FileEntry | null>(null);
  const [showExtractOptions, setShowExtractOptions] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["quick-access", "recent-archives"]));
  const [draggedFile, setDraggedFile] = useState<FileEntry | null>(null);
  const [draggedFromTab, setDraggedFromTab] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{files: string[], operation: 'copy' | 'cut'} | null>(null);
  const [navigationHistory, setNavigationHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sortColumn, setSortColumn] = useState<'name' | 'size' | 'modified' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0.9);
  const [archiveSortBy, setArchiveSortBy] = useState<'date' | 'size'>('date');
  const [archiveSortDirection, setArchiveSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogMessage, setConfirmDialogMessage] = useState("");
  const [confirmDialogCallback, setConfirmDialogCallback] = useState<(() => void) | null>(null);
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [alertDialogMessage, setAlertDialogMessage] = useState("");
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

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
    // Ctrl + Scroll zoom functionality - adjusts font and spacing
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey && tableRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        setZoomLevel(prev => {
          const delta = e.deltaY > 0 ? -0.05 : 0.05;
          return Math.max(0.65, Math.min(1.35, prev + delta));
        });
      }
    };

    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

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
        selectedFiles: new Set()
      };
      setTabs([newTab]);
      setActiveTabId(newTabId);
      setExtractPath(homeDir);
    } catch (error) {
      console.error("Failed to initialize:", error);
    }
  }

  async function loadDirectory(path: string, tabId?: string, addToHistory: boolean = true) {
    try {
      const contents = await invoke<DirectoryContents>("get_directory_contents", { path });
      const targetTabId = tabId || activeTabId;

      setTabs(tabs.map(tab =>
        tab.id === targetTabId
          ? {
              ...tab,
              path: contents.current_path,
              name: path.split(/[/\\]/).pop() || "Home",
              files: contents.files,
              selectedFiles: new Set()
            }
          : tab
      ));

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
  }

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

  async function handleSearch() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || !searchQuery.trim()) {
      if (activeTab) loadDirectory(activeTab.path);
      return;
    }

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
    }
  }

  function handleFileDoubleClick(file: FileEntry) {
    if (file.is_directory) {
      loadDirectory(file.path);
    }
  }

  function handleFileRightClick(file: FileEntry, event: React.MouseEvent) {
    event.preventDefault();
    if (file.is_archive) {
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        file
      });
    }
  }

  function handleFileSelect(filePath: string, event: React.MouseEvent) {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    const newSelected = new Set(activeTab.selectedFiles);

    if (event.ctrlKey) {
      // Ctrl+Click: toggle selection
      if (newSelected.has(filePath)) {
        newSelected.delete(filePath);
      } else {
        newSelected.add(filePath);
      }
    } else {
      // Regular click: select only this file
      newSelected.clear();
      newSelected.add(filePath);
    }

    setTabs(tabs.map(tab =>
      tab.id === activeTabId ? { ...tab, selectedFiles: newSelected } : tab
    ));
  }

  async function handleCopy() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.selectedFiles.size === 0) return;

    setClipboard({
      files: Array.from(activeTab.selectedFiles),
      operation: 'copy'
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

    showConfirm(`Delete ${activeTab.selectedFiles.size} file(s)?`, async () => {
      try {
        for (const filePath of activeTab.selectedFiles) {
          await invoke("delete_file", { filePath });
        }

        loadDirectory(activeTab.path);
      } catch (error) {
        showAlert(`Failed to delete: ${error}`);
      }
    });
  }

  function handleSort(column: 'name' | 'size' | 'modified') {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    let newDirection: 'asc' | 'desc' = 'asc';

    if (sortColumn === column) {
      // Toggle direction if clicking same column
      newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    }

    setSortColumn(column);
    setSortDirection(newDirection);

    const sortedFiles = [...activeTab.files].sort((a, b) => {
      // Always keep directories at the top
      if (a.is_directory && !b.is_directory) return -1;
      if (!a.is_directory && b.is_directory) return 1;

      let comparison = 0;

      if (column === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (column === 'size') {
        comparison = a.size - b.size;
      } else if (column === 'modified') {
        comparison = a.modified.localeCompare(b.modified);
      }

      return newDirection === 'asc' ? comparison : -comparison;
    });

    setTabs(tabs.map(tab =>
      tab.id === activeTabId ? { ...tab, files: sortedFiles } : tab
    ));
  }

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
      selectedFiles: new Set()
    };

    setTabs([...tabs, newTab]);
    setActiveTabId(newTabId);
  }

  function switchTab(tabId: string) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
      setActiveTabId(tabId);
      setExtractPath(tab.path);
    }
  }

  function closeTab(tabId: string, event: React.MouseEvent) {
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

  function toggleFolder(folderId: string) {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  }

  function handleDragStart(file: FileEntry, tabId: string) {
    setDraggedFile(file);
    setDraggedFromTab(tabId);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(targetTabId: string) {
    if (!draggedFile || !draggedFromTab) return;

    // In a real implementation, you would copy/move the file here
    console.log(`Moving ${draggedFile.name} to tab ${targetTabId}`);

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

  function getSortedArchives(): RecentZipFile[] {
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
  }

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

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="app-container">
      {/* Diagonal Resize Handle */}
      <div
        className="resize-handle"
        onMouseDown={async (e) => {
          e.preventDefault();
          await appWindow.startResizeDragging('bottom-right' as any);
        }}
      />

      {/* Custom Title Bar */}
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256" style={{ marginRight: '0.5rem' }}>
            <path d="M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64Z" />
          </svg>
          UNBOX
        </div>
        <div className="titlebar-controls">
          <button className="titlebar-button titlebar-minimize" onClick={() => appWindow.minimize()} title="Minimize">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <rect x="2" y="7" width="12" height="3" fill="currentColor"/>
            </svg>
          </button>
          <button className="titlebar-button titlebar-maximize" onClick={async () => {
            await appWindow.toggleMaximize();
            const maximized = await appWindow.isMaximized();
            setIsMaximized(maximized);
          }} title={isMaximized ? "Restore" : "Maximize"}>
            {isMaximized ? (
              <svg width="16" height="16" viewBox="0 0 16 16">
                <rect x="4" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3"/>
                <rect x="2" y="4" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="3"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16">
                <rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3"/>
              </svg>
            )}
          </button>
          <button className="titlebar-button titlebar-close" onClick={() => appWindow.close()} title="Close">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M2 2 L14 14 M14 2 L2 14" stroke="currentColor" strokeWidth="3" strokeLinecap="square"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="main-layout">
        {/* Sidebar with pinned folders */}
        <div className="sidebar">
          {/* Quick Access */}
          <div className="sidebar-section">
            <button
              className="sidebar-folder-header"
              onClick={() => toggleFolder("quick-access")}
            >
              <svg className="folder-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" style={{ transform: expandedFolders.has("quick-access") ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>
              </svg>
              Quick Access
            </button>
            {expandedFolders.has("quick-access") && (
              <div className="sidebar-items">
                {pinnedFolders.map(([name, path]) => (
                  <button
                    key={path}
                    className="sidebar-item quick-access-item"
                    onClick={() => loadDirectory(path)}
                  >
                    {getFolderIcon(name)}
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent Archives */}
          {recentZips.length > 0 && (
            <div className="sidebar-section">
              <button
                className="sidebar-folder-header"
                onClick={() => toggleFolder("recent-archives")}
              >
                <svg className="folder-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256" style={{ transform: expandedFolders.has("recent-archives") ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                  <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z"/>
                </svg>
                Recent Archives ({recentZips.length})
              </button>
              {expandedFolders.has("recent-archives") && (
                <>
                  <div className="archive-sort-controls">
                    <button
                      className={`archive-sort-btn ${archiveSortBy === 'date' ? 'active' : ''}`}
                      onClick={() => {
                        if (archiveSortBy === 'date') {
                          setArchiveSortDirection(archiveSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setArchiveSortBy('date');
                          setArchiveSortDirection('desc');
                        }
                      }}
                      title={`Sort by date modified (${archiveSortBy === 'date' ? (archiveSortDirection === 'asc' ? 'oldest first' : 'newest first') : 'click to sort'})`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M208,32H184V24a8,8,0,0,0-16,0v8H88V24a8,8,0,0,0-16,0v8H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32Z"/>
                      </svg>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256" style={{ opacity: archiveSortBy === 'date' ? 1 : 0.3 }}>
                        {(archiveSortBy === 'date' && archiveSortDirection === 'asc') || archiveSortBy !== 'date' ? (
                          <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"/>
                        ) : (
                          <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z"/>
                        )}
                      </svg>
                    </button>
                    <button
                      className={`archive-sort-btn ${archiveSortBy === 'size' ? 'active' : ''}`}
                      onClick={() => {
                        if (archiveSortBy === 'size') {
                          setArchiveSortDirection(archiveSortDirection === 'asc' ? 'desc' : 'asc');
                        } else {
                          setArchiveSortBy('size');
                          setArchiveSortDirection('desc');
                        }
                      }}
                      title={`Sort by size (${archiveSortBy === 'size' ? (archiveSortDirection === 'asc' ? 'smallest first' : 'largest first') : 'click to sort'})`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256">
                        <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34Z"/>
                      </svg>
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 256 256" style={{ opacity: archiveSortBy === 'size' ? 1 : 0.3 }}>
                        {(archiveSortBy === 'size' && archiveSortDirection === 'asc') || archiveSortBy !== 'size' ? (
                          <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"/>
                        ) : (
                          <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z"/>
                        )}
                      </svg>
                    </button>
                  </div>
                  <div className="sidebar-items archive-scrollable" key={`${archiveSortBy}-${archiveSortDirection}`}>
                    {getSortedArchives().map((zip, index) => (
                    <button
                      key={`${zip.path}-${index}-${archiveSortBy}-${archiveSortDirection}`}
                      className="sidebar-item"
                      onClick={async () => {
                        const dir = zip.path.split(/[/\\]/).slice(0, -1).join(zip.path.includes('\\') ? '\\' : '/');

                        // Load directory containing the ZIP file
                        await loadDirectory(dir);

                        // Small delay to ensure state updates, then select and scroll to the zip file
                        setTimeout(() => {
                          setTabs(prevTabs => prevTabs.map(tab =>
                            tab.id === activeTabId
                              ? { ...tab, selectedFiles: new Set([zip.path]) }
                              : tab
                          ));

                          // Scroll to the selected file
                          setTimeout(() => {
                            const selectedRow = document.querySelector('.file-row.selected');
                            if (selectedRow) {
                              selectedRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                          }, 150);
                        }, 100);
                      }}
                      onContextMenu={async (e) => {
                        e.preventDefault();
                        const dir = zip.path.split(/[/\\]/).slice(0, -1).join(zip.path.includes('\\') ? '\\' : '/');
                        await loadDirectory(dir);

                        // Create a temporary FileEntry for the context menu
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
                          x: e.clientX,
                          y: e.clientY,
                          file: fileEntry
                        });
                      }}
                      title={zip.path}
                    >
                      <div className="archive-item-content">
                        <svg className="icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
                          <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-48-80a8,8,0,0,1-8,8H136v8h8a8,8,0,0,1,0,16h-8v8a8,8,0,0,1-16,0v-8h-8a8,8,0,0,1,0-16h8v-8h-8a8,8,0,0,1,0-16h8v-8a8,8,0,0,1,16,0v8h8A8,8,0,0,1,152,136Z"/>
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
                  onDrop={() => handleDrop(tab.id)}
                >
                  <span>{tab.name}</span>
                  {tabs.length > 1 && (
                    <button
                      className="tab-close"
                      onClick={(e) => closeTab(tab.id, e)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <button className="tab-new" onClick={createNewTab}>
                +
              </button>
            </div>

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
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                {searchQuery && (
                  <button className="search-clear-compact" onClick={() => {
                    setSearchQuery("");
                    if (activeTab) loadDirectory(activeTab.path);
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
            {zoomLevel !== 0.9 && (
              <button
                onClick={() => setZoomLevel(0.9)}
                style={{
                  padding: '0.25rem 0.5rem',
                  background: 'transparent',
                  border: '2px solid #1c140d',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  color: '#1c140d',
                  opacity: 0.5,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
              >
                {((zoomLevel / 0.9) * 100).toFixed(0)}%
              </button>
            )}
          </div>
          <div className="table-container" ref={tableRef}>
            <div className="table-wrapper">
              <table className="file-table">
                <thead>
                  <tr>
                    <th className="th-name">Name</th>
                    <th className="th-size th-sortable" onClick={() => handleSort('size')}>
                      <div className="th-content">
                        Size
                        {sortColumn === 'size' && (
                          <svg className="sort-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256">
                            {sortDirection === 'asc' ? (
                              <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z"/>
                            ) : (
                              <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"/>
                            )}
                          </svg>
                        )}
                      </div>
                    </th>
                    <th className="th-modified th-sortable" onClick={() => handleSort('modified')}>
                      <div className="th-content">
                        Last Modified
                        {sortColumn === 'modified' && (
                          <svg className="sort-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 256 256">
                            {sortDirection === 'asc' ? (
                              <path d="M205.66,149.66l-72,72a8,8,0,0,1-11.32,0l-72-72a8,8,0,0,1,11.32-11.32L120,196.69V40a8,8,0,0,1,16,0V196.69l58.34-58.35a8,8,0,0,1,11.32,11.32Z"/>
                            ) : (
                              <path d="M205.66,117.66a8,8,0,0,1-11.32,0L136,59.31V216a8,8,0,0,1-16,0V59.31L61.66,117.66a8,8,0,0,1-11.32-11.32l72-72a8,8,0,0,1,11.32,0l72,72A8,8,0,0,1,205.66,117.66Z"/>
                            )}
                          </svg>
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab?.files.map((file) => (
                    <tr
                      key={file.path}
                      className={`file-row ${activeTab.selectedFiles.has(file.path) ? 'selected' : ''}`}
                      onClick={(e) => handleFileSelect(file.path, e)}
                      onDoubleClick={() => handleFileDoubleClick(file)}
                      onContextMenu={(e) => handleFileRightClick(file, e)}
                      draggable
                      onDragStart={() => handleDragStart(file, activeTabId)}
                    >
                      <td className={`file-name ${file.name.toLowerCase().endsWith('.zip') ? 'zip-file' : ''}`}>
                        {file.is_directory ? (
                          <svg className="folder-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                            <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z" />
                          </svg>
                        ) : file.name.toLowerCase().endsWith('.zip') ? (
                          <svg className="zip-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                            <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-48-80a8,8,0,0,1-8,8H136v8h8a8,8,0,0,1,0,16h-8v8a8,8,0,0,1-16,0v-8h-8a8,8,0,0,1,0-16h8v-8h-8a8,8,0,0,1,0-16h8v-8a8,8,0,0,1,16,0v8h8A8,8,0,0,1,152,136Z"/>
                          </svg>
                        ) : file.is_archive ? (
                          <svg className="archive-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 256 256">
                            <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Z"/>
                          </svg>
                        ) : null}
                        <span className={file.name.toLowerCase().endsWith('.zip') ? 'zip-text' : ''}>{file.name}</span>
                      </td>
                      <td className={`file-size ${file.name.toLowerCase().endsWith('.zip') ? 'zip-size' : ''}`}>
                        {file.is_directory ? "—" : formatSize(file.size)}
                      </td>
                      <td className={`file-modified ${file.name.toLowerCase().endsWith('.zip') ? 'zip-modified' : ''}`}>{file.modified}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Action buttons */}
          <div className="actions">
            <div className="action-buttons">
              <button className="action-btn" title="Copy" onClick={handleCopy} disabled={!activeTab || activeTab.selectedFiles.size === 0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,32H88a8,8,0,0,0-8,8V80H40a8,8,0,0,0-8,8V216a8,8,0,0,0,8,8H168a8,8,0,0,0,8-8V176h40a8,8,0,0,0,8-8V40A8,8,0,0,0,216,32ZM160,208H48V96H160Zm48-48H176V88a8,8,0,0,0-8-8H96V48H208Z" />
                </svg>
              </button>
              <button className="action-btn" title="Paste" onClick={handlePaste} disabled={!clipboard}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M168,152a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,152Zm-8-40H96a8,8,0,0,0,0,16h64a8,8,0,0,0,0-16Zm56-64V216a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V48A16,16,0,0,1,56,32H92.26a47.92,47.92,0,0,1,71.48,0H200A16,16,0,0,1,216,48Z" />
                </svg>
              </button>
              <button className="action-btn" title="Delete" onClick={handleDelete} disabled={!activeTab || activeTab.selectedFiles.size === 0}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16Z" />
                </svg>
              </button>
              <button className="action-btn" title="New Folder" onClick={() => setShowNewFolderDialog(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Zm-88,88a8,8,0,0,1,8,8v16h16a8,8,0,0,1,0,16H136v16a8,8,0,0,1-16,0V152H104a8,8,0,0,1,0-16h16V120A8,8,0,0,1,128,112Z" />
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
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="context-menu-item" onClick={() => openExtractDialog(contextMenu.file)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M245,110.64A16,16,0,0,0,232,104H216V88a16,16,0,0,0-16-16H130.67L102.94,51.2a16.14,16.14,0,0,0-9.6-3.2H40A16,16,0,0,0,24,64V208h0a8,8,0,0,0,8,8H211.1a8,8,0,0,0,7.59-5.47l28.49-85.47A16.05,16.05,0,0,0,245,110.64Z" />
            </svg>
            Extract Here
          </div>
          <div className="context-menu-item" onClick={() => {
            setExtractPath(activeTab?.path || "");
            openExtractDialog(contextMenu.file);
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z" />
            </svg>
            Extract To...
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
