import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open } from '@tauri-apps/plugin-dialog';
import { FileEntry } from '../types';

export const useTauri = () => {
  const window = getCurrentWindow();

  const minimizeWindow = () => window.minimize();
  const maximizeWindow = async () => {
    const isMaximized = await window.isMaximized();
    if (isMaximized) {
      await window.unmaximize();
    } else {
      await window.maximize();
    }
  };
  const closeWindow = () => window.close();

  const listDrives = async (): Promise<string[]> => {
    return await invoke('list_drives');
  };

  const scanDrive = async (path: string): Promise<FileEntry> => {
    return await invoke('scan_drive', { path });
  };

  const openFolderDialog = async (): Promise<string | null> => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Select folder to scan',
    });
    return selected as string | null;
  };

  return {
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    listDrives,
    scanDrive,
    openFolderDialog,
  };
};
