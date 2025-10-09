import React, { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Welcome } from './components/Welcome';
import { MainApp } from './components/MainApp';
import { FileEntry } from './types';
import './App.css';

type Screen = 'welcome' | 'main';

export const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('welcome');
  const [scanPath, setScanPath] = useState<string>('');

  useEffect(() => {
    const window = getCurrentWindow();

    if (screen === 'welcome') {
      // Small window for welcome screen
      window.setSize({ width: 500, height: 450 });
      window.center();
    } else if (screen === 'main') {
      // Large window for main app
      window.setSize({ width: 1400, height: 900 });
      window.center();
    }
  }, [screen]);

  const handleScanStart = (path: string) => {
    setScanPath(path);
    setScreen('main');
  };

  const handleNewScan = () => {
    setScanPath('');
    setScreen('welcome');
  };

  return (
    <div className="app">
      {screen === 'welcome' && <Welcome onScanStart={handleScanStart} />}
      {screen === 'main' && (
        <MainApp scanPath={scanPath} onNewScan={handleNewScan} />
      )}
    </div>
  );
};
