import React from 'react';
import { useTauri } from '../hooks/useTauri';
import './WindowControls.css';

export const WindowControls: React.FC = () => {
  const { minimizeWindow, maximizeWindow, closeWindow } = useTauri();

  return (
    <div className="window-controls">
      <button className="titlebar-button minimize-button" onClick={minimizeWindow}>
        ─
      </button>
      <button className="titlebar-button maximize-button" onClick={maximizeWindow}>
        □
      </button>
      <button className="titlebar-button close-button" onClick={closeWindow}>
        ✕
      </button>
    </div>
  );
};
