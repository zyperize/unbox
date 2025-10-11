import { useState } from 'react';
import { useSettings } from '../../contexts/SettingsContext';
import './SettingsDialog.css';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'behavior' | 'performance' | 'shortcuts';

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { settings, updateAppearance, updateBehavior, updatePerformance, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');

  if (!isOpen) return null;

  const handleReset = () => {
    if (confirm('Reset all settings to defaults? This cannot be undone.')) {
      resetSettings();
    }
  };

  return (
    <div className="dialog-overlay">
      <div className="dialog settings-dialog">
        <div className="dialog-header">
          <h2 className="dialog-title">Settings</h2>
        </div>

        {/* Settings Tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M200.77,53.89A103.27,103.27,0,0,0,128,24h-1.07A104,104,0,0,0,24,128c0,43,26.58,79.06,69.36,94.17A32,32,0,0,0,136,192a16,16,0,0,1,16-16h46.21a31.81,31.81,0,0,0,31.2-24.88,104.43,104.43,0,0,0,2.59-24A103.28,103.28,0,0,0,200.77,53.89Z"/>
            </svg>
            Appearance
          </button>
          <button
            className={`settings-tab ${activeTab === 'behavior' ? 'active' : ''}`}
            onClick={() => setActiveTab('behavior')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM176,184H80a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16Zm0-32H80a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16Zm0-32H80a8,8,0,0,1,0-16h96a8,8,0,0,1,0,16Z"/>
            </svg>
            Behavior
          </button>
          <button
            className={`settings-tab ${activeTab === 'performance' ? 'active' : ''}`}
            onClick={() => setActiveTab('performance')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M232,120h-8.34A96.14,96.14,0,0,0,136,32.34V24a8,8,0,0,0-16,0v8.34A96.14,96.14,0,0,0,32.34,120H24a8,8,0,0,0,0,16h8.34A96.14,96.14,0,0,0,120,223.66V232a8,8,0,0,0,16,0v-8.34A96.14,96.14,0,0,0,223.66,136H232a8,8,0,0,0,0-16Z"/>
            </svg>
            Performance
          </button>
          <button
            className={`settings-tab ${activeTab === 'shortcuts' ? 'active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 256 256">
              <path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z"/>
            </svg>
            Shortcuts
          </button>
        </div>

        {/* Settings Content */}
        <div className="dialog-body settings-content">
          {activeTab === 'appearance' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Appearance</h3>

              <div className="settings-group">
                <label className="settings-label">Theme</label>
                <select
                  className="settings-select"
                  value={settings.appearance.theme}
                  onChange={(e) => updateAppearance({ theme: e.target.value as 'light' | 'dark' | 'auto' })}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                  <option value="auto">Auto (System)</option>
                </select>
              </div>

              <div className="settings-group">
                <label className="settings-label">Font Size: {settings.appearance.fontSize}px</label>
                <input
                  type="range"
                  className="settings-range"
                  min="12"
                  max="24"
                  value={settings.appearance.fontSize}
                  onChange={(e) => updateAppearance({ fontSize: parseInt(e.target.value) })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-label">Icon Size</label>
                <select
                  className="settings-select"
                  value={settings.appearance.iconSize}
                  onChange={(e) => updateAppearance({ iconSize: e.target.value as 'small' | 'medium' | 'large' })}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>

              <div className="settings-group">
                <label className="settings-label">Table Zoom: {(settings.appearance.zoomLevel * 100).toFixed(0)}%</label>
                <input
                  type="range"
                  className="settings-range"
                  min="1.0"
                  max="2.5"
                  step="0.05"
                  value={settings.appearance.zoomLevel}
                  onChange={(e) => updateAppearance({ zoomLevel: parseFloat(e.target.value) })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.appearance.compactMode}
                    onChange={(e) => updateAppearance({ compactMode: e.target.checked })}
                  />
                  <span>Compact Mode</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'behavior' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Behavior</h3>

              <div className="settings-group">
                <label className="settings-label">Default Sort</label>
                <select
                  className="settings-select"
                  value={settings.behavior.defaultSort}
                  onChange={(e) => updateBehavior({ defaultSort: e.target.value as 'name' | 'size' | 'modified' })}
                >
                  <option value="name">Name</option>
                  <option value="size">Size</option>
                  <option value="modified">Date Modified</option>
                </select>
              </div>

              <div className="settings-group">
                <label className="settings-label">Default View</label>
                <select
                  className="settings-select"
                  value={settings.behavior.defaultView}
                  onChange={(e) => updateBehavior({ defaultView: e.target.value as 'list' | 'grid' | 'details' })}
                >
                  <option value="list">List</option>
                  <option value="grid">Grid</option>
                  <option value="details">Details</option>
                </select>
              </div>

              <div className="settings-group">
                <label className="settings-label">Double-Click Speed: {settings.behavior.doubleClickSpeed}ms</label>
                <input
                  type="range"
                  className="settings-range"
                  min="200"
                  max="800"
                  step="50"
                  value={settings.behavior.doubleClickSpeed}
                  onChange={(e) => updateBehavior({ doubleClickSpeed: parseInt(e.target.value) })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.behavior.confirmDelete}
                    onChange={(e) => updateBehavior({ confirmDelete: e.target.checked })}
                  />
                  <span>Confirm Before Delete</span>
                </label>
              </div>

              <div className="settings-group">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.behavior.showHiddenFiles}
                    onChange={(e) => updateBehavior({ showHiddenFiles: e.target.checked })}
                  />
                  <span>Show Hidden Files</span>
                </label>
              </div>

              <div className="settings-group">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.behavior.autoRefresh}
                    onChange={(e) => updateBehavior({ autoRefresh: e.target.checked })}
                  />
                  <span>Auto-Refresh Folders</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'performance' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Performance</h3>

              <div className="settings-group">
                <label className="settings-label">Max Recent Archives: {settings.performance.maxRecentArchives}</label>
                <input
                  type="range"
                  className="settings-range"
                  min="5"
                  max="50"
                  value={settings.performance.maxRecentArchives}
                  onChange={(e) => updatePerformance({ maxRecentArchives: parseInt(e.target.value) })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-label">Search Depth: {settings.performance.searchDepth} levels</label>
                <input
                  type="range"
                  className="settings-range"
                  min="1"
                  max="10"
                  value={settings.performance.searchDepth}
                  onChange={(e) => updatePerformance({ searchDepth: parseInt(e.target.value) })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-label">Cache Size: {settings.performance.cacheSize} items</label>
                <input
                  type="range"
                  className="settings-range"
                  min="50"
                  max="500"
                  step="50"
                  value={settings.performance.cacheSize}
                  onChange={(e) => updatePerformance({ cacheSize: parseInt(e.target.value) })}
                />
              </div>

              <div className="settings-group">
                <label className="settings-checkbox">
                  <input
                    type="checkbox"
                    checked={settings.performance.enableVirtualScrolling}
                    onChange={(e) => updatePerformance({ enableVirtualScrolling: e.target.checked })}
                  />
                  <span>Enable Virtual Scrolling (for 1000+ files)</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="settings-section">
              <h3 className="settings-section-title">Keyboard Shortcuts</h3>
              <div className="shortcuts-list">
                {Object.entries(settings.shortcuts).map(([key, shortcut]) => (
                  <div key={key} className="shortcut-item">
                    <span className="shortcut-description">{shortcut.description}</span>
                    <span className="shortcut-keys">
                      {shortcut.ctrl && <kbd>Ctrl</kbd>}
                      {shortcut.shift && <kbd>Shift</kbd>}
                      {shortcut.alt && <kbd>Alt</kbd>}
                      <kbd>{shortcut.key}</kbd>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dialog Actions */}
        <div className="dialog-actions">
          <button className="dialog-btn dialog-btn-secondary" onClick={handleReset}>
            Reset to Defaults
          </button>
          <button className="dialog-btn dialog-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
