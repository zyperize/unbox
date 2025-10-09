import React, { useEffect, useState } from 'react';
import { useTauri } from '../hooks/useTauri';
import { WindowControls } from './WindowControls';
import './Welcome.css';

interface WelcomeProps {
  onScanStart: (path: string) => void;
}

export const Welcome: React.FC<WelcomeProps> = ({ onScanStart }) => {
  const { listDrives, openFolderDialog } = useTauri();
  const [drives, setDrives] = useState<string[]>([]);

  useEffect(() => {
    listDrives().then(setDrives);
  }, []);

  const handleDriveClick = (drive: string) => {
    onScanStart(drive);
  };

  const handleBrowse = async () => {
    const folder = await openFolderDialog();
    if (folder) {
      onScanStart(folder);
    }
  };

  return (
    <div className="welcome-screen">
      {/* Draggable region with controls */}
      <div className="drag-region" data-tauri-drag-region>
        <div className="drag-spacer"></div>
        <WindowControls />
      </div>

      <div className="neobrutalist-window">
        {/* Window Header */}
        <div className="window-header">
          <h1 className="window-title">SPACE</h1>
        </div>

        {/* Main Content */}
        <div className="window-content">
          <div className="welcome-main">
            <h2 className="main-title">Space</h2>
            <p className="main-subtitle">Data Analysis Application</p>

            <div className="drive-selector-section">
              <label htmlFor="drive-selector" className="drive-label">
                Select Drive:
              </label>
              <div className="select-wrapper">
                <select
                  id="drive-selector"
                  className="drive-select"
                  onChange={(e) => handleDriveClick(e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Choose a drive...
                  </option>
                  {drives.map((drive) => (
                    <option key={drive} value={drive}>
                      {drive}
                    </option>
                  ))}
                </select>
                <div className="select-arrow">
                  <span className="arrow-icon">▼</span>
                </div>
              </div>
            </div>

            <button className="run-button" onClick={handleBrowse}>
              Run
            </button>
          </div>
        </div>

        {/* Window Footer */}
        <div className="window-footer">
          <p className="version-text">v1.0.0</p>
        </div>
      </div>
    </div>
  );
};
