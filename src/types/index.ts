export interface FileEntry {
  path: string;
  name: string;
  size: number;
  is_dir: boolean;
  children: FileEntry[];
}

export interface DriveInfo {
  path: string;
  label?: string;
}
