import React, { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useTauri } from '../hooks/useTauri';
import { FileEntry } from '../types';
import { WindowControls } from './WindowControls';
import './Scanner.css';

interface ScannerProps {
  scanPath: string;
  onComplete: (data: FileEntry) => void;
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

export const Scanner: React.FC<ScannerProps> = ({ scanPath, onComplete }) => {
  const { scanDrive } = useTauri();
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
      .then((data) => {
        setTimeout(() => onComplete(data), 500);
      })
      .catch((error) => {
        alert(`Scan failed: ${error}`);
      });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [scanPath]);

  return (
    <div className="loading-screen">
      <div className="drag-region" data-tauri-drag-region>
        <div className="drag-spacer"></div>
        <WindowControls />
      </div>

      <div className="loading-content">
        <h2>SCANNING</h2>
        <p className="scan-path">{scanPath}</p>

        <div className="loading-dots">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>

        <p className="status-text">{filesScanned.toLocaleString()} files</p>
        <p className="progress-text">{formatBytes(bytesScanned)}</p>
      </div>
    </div>
  );
};
