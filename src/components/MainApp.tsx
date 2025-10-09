import React, { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTauri } from '../hooks/useTauri';
import { FileEntry } from '../types';
import { WindowControls } from './WindowControls';
import './MainApp.css';

interface MainAppProps {
  scanPath: string;
  onNewScan: () => void;
}

interface ScanProgress {
  files_scanned: number;
  bytes_scanned: number;
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export const MainApp: React.FC<MainAppProps> = ({ scanPath, onNewScan }) => {
  const { scanDrive } = useTauri();
  const [data, setData] = useState<FileEntry | null>(null);
  const [currentPath, setCurrentPath] = useState<FileEntry[]>([]);
  const [isScanning, setIsScanning] = useState(true);
  const [filesScanned, setFilesScanned] = useState(0);
  const [bytesScanned, setBytesScanned] = useState(0);

  useEffect(() => {
    // Listen for real-time progress events from Rust
    const unlisten = listen<ScanProgress>('scan-progress', (event) => {
      setFilesScanned(event.payload.files_scanned);
      setBytesScanned(event.payload.bytes_scanned);
    });

    // Perform scan
    scanDrive(scanPath)
      .then((scanData) => {
        setData(scanData);
        setCurrentPath([scanData]);
        setIsScanning(false);
      })
      .catch((error) => {
        console.error(`Scan failed: ${error}`);
        alert(`Scan failed: ${error}`);
        setIsScanning(false);
      });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [scanPath]);

  const currentData = data && currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;

  const navigateToChild = (child: FileEntry) => {
    if (child.is_dir && child.children.length > 0) {
      setCurrentPath([...currentPath, child]);
    }
  };

  const navigateToParent = (index: number) => {
    setCurrentPath(currentPath.slice(0, index + 1));
  };

  const sortedChildren = currentData ? [...currentData.children].sort((a, b) => b.size - a.size) : [];

  const getSizeCategory = (size: number): 'large' | 'medium' | 'small' => {
    const GB = 1024 * 1024 * 1024;
    const MB = 1024 * 1024;
    if (size >= GB) return 'large';
    if (size >= 100 * MB) return 'medium';
    return 'small';
  };

  return (
    <div className="main-app">
      {/* Header with breadcrumb */}
      <header className="app-header" data-tauri-drag-region>
        <div className="breadcrumb-path">
          {currentPath.map((item, index) => (
            <span key={index}>
              <button
                className="path-segment"
                onClick={() => navigateToParent(index)}
              >
                {item.name || scanPath}
              </button>
              {index < currentPath.length - 1 && <span className="path-separator"> &gt; </span>}
            </span>
          ))}
          {currentPath.length === 0 && <span className="path-loading">{scanPath}</span>}
        </div>
        <div className="header-actions">
          {isScanning && (
            <div className="scan-status">
              <span className="scanning-indicator">⏳</span>
              <span>{filesScanned.toLocaleString()} files ({formatBytes(bytesScanned)})</span>
            </div>
          )}
          <button className="btn-new-scan" onClick={onNewScan}>
            NEW SCAN
          </button>
          <WindowControls />
        </div>
      </header>

      {/* Main content area */}
      <main className="app-main">
        {/* Sidebar - Folders */}
        <div className="sidebar">
          <h2 className="sidebar-title">FOLDERS</h2>
          <div className="folder-list">
            {isScanning && !data ? (
              <div className="scanning-message">
                <div className="loading-spinner"></div>
                <p>Scanning...</p>
                <p className="scan-stats">{filesScanned.toLocaleString()} files</p>
              </div>
            ) : (
              sortedChildren.slice(0, 20).map((item, index) => {
                const sizeCategory = getSizeCategory(item.size);
                return (
                  <div
                    key={index}
                    className={`folder-item ${sizeCategory}`}
                    onClick={() => navigateToChild(item)}
                  >
                    <div className="folder-icon">
                      {item.is_dir ? '📁' : '📄'}
                    </div>
                    <div className="folder-info">
                      <p className="folder-name">{item.name}</p>
                      <p className="folder-size">{formatBytes(item.size)}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Main visualization area */}
        <div className="visualization">
          <div className="viz-header">
            <h2 className="viz-title">FILE VISUALIZATION</h2>
            <div className="legend">
              <div className="legend-item">
                <div className="legend-color large"></div>
                <span>Large (&gt;1GB)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color medium"></div>
                <span>Medium (100MB-1GB)</span>
              </div>
              <div className="legend-item">
                <div className="legend-color small"></div>
                <span>Small (&lt;100MB)</span>
              </div>
            </div>
          </div>
          <div className="treemap">
            {isScanning && !data ? (
              <div className="treemap-placeholder">
                <div className="loading-spinner large"></div>
                <h3>Building visualization...</h3>
                <p>{formatBytes(bytesScanned)} processed</p>
              </div>
            ) : (
              sortedChildren.slice(0, 10).map((item, index) => {
                const percentage = currentData && currentData.size > 0
                  ? (item.size / currentData.size) * 100
                  : 0;
                const sizeCategory = getSizeCategory(item.size);

                return (
                  <div
                    key={index}
                    className={`treemap-block ${sizeCategory}`}
                    style={{ flex: Math.max(percentage, 1) }}
                    onClick={() => navigateToChild(item)}
                    title={`${item.name} - ${formatBytes(item.size)}`}
                  >
                    <div className="block-content">
                      <span className="block-name">{item.name}</span>
                      <span className="block-size">{formatBytes(item.size)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>
          TOTAL SIZE: {currentData ? formatBytes(currentData.size) : '0 B'} |
          FILES: {filesScanned.toLocaleString()} |
          {isScanning ? ' SCANNING...' : ' SCAN COMPLETE'}
        </p>
      </footer>
    </div>
  );
};
