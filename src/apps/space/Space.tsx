import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { theme } from "../../setup/theme";
import { useScan } from "../../contexts/ScanContext";

type ScanProgress = {
  path: string;
  completedChildren: number;
  totalChildren: number;
  scannedEntries: number;
  scannedBytes: number;
  currentPath: string;
};

type SpaceChild = {
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  fileCount: number;
  dirCount: number;
};

type SpaceScanResult = {
  path: string;
  name: string;
  totalSize: number;
  scannedEntries: number;
  scannedBytes: number;
  children: SpaceChild[];
  totalChildren: number;
  otherChildren: number;
  otherSize: number;
  fileCount: number;
  dirCount: number;
  missingEntries: number;
  permissionDeniedEntries: number;
  otherErrors: number;
};

type DriveStat = {
  path: string;
  totalBytes: number;
  availableBytes: number;
};

// Note: Rust uses #[serde(rename_all = "camelCase")] so job_id becomes jobId
type ScanStartedEvent = { jobId: string; path: string };
type ScanProgressEvent = { jobId: string; progress: ScanProgress };
type ScanCompleteEvent = { jobId: string; result: SpaceScanResult };
type ScanCancelledEvent = { jobId: string };
type ScanErrorEvent = { jobId: string; message: string };

type NodeKind = "self" | "child" | "other";

type TreemapNode = {
  id: string;
  path: string;
  name: string;
  size: number;
  isDir: boolean;
  fileCount: number;
  dirCount: number;
  kind: NodeKind;
};

type TreemapTile = TreemapNode & {
  x: number;
  y: number;
  width: number;
  height: number;
  percentOfParent: number;
  color: string;
};

type ContextMenuState = {
  x: number;
  y: number;
  node: TreemapNode;
};

const numberFormatter = new Intl.NumberFormat("en-US");

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  const precision = value >= 10 || exponent === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[exponent]}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0%";
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)}%`;
}

function normalizeDriveKey(path: string): string {
  if (!path) {
    return "";
  }
  const separator = path.includes("\\") ? "\\" : "/";
  const withSlash = path.endsWith(separator) ? path : `${path}${separator}`;
  return withSlash.toLowerCase();
}

function colorForIndex(index: number): string {
  const hue = (28 + index * 37) % 360;
  return `hsl(${hue}, 72%, 62%)`;
}

function getOtherNodeId(path: string): string {
  return `__OTHER__${path}`;
}

type Rect = { x: number; y: number; width: number; height: number };

type LayoutNode = TreemapNode & {
  area: number;
  color: string;
};

function computeTreemap(nodes: TreemapNode[], width: number, height: number): TreemapTile[] {
  if (!nodes.length || width <= 0 || height <= 0) {
    return [];
  }

  const totalSize = nodes.reduce((sum, node) => sum + Math.max(0, node.size), 0);
  const area = width * height;
  const tiles: TreemapTile[] = [];

  if (totalSize <= 0 || area <= 0) {
    const columns = Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / columns);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    nodes.forEach((node, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      tiles.push({
        ...node,
        x: col * cellWidth,
        y: row * cellHeight,
        width: cellWidth,
        height: cellHeight,
        color: colorForIndex(index),
        percentOfParent: 0,
      });
    });
    return tiles;
  }

  const scale = area / totalSize;
  const sorted: LayoutNode[] = nodes
    .map((node, index) => ({
      ...node,
      color: colorForIndex(index),
      area: Math.max(node.size * scale, 0),
    }))
    .sort((a, b) => b.area - a.area);

  const remaining: LayoutNode[] = [...sorted];

  const rect: Rect = { x: 0, y: 0, width, height };

  function shortestSide(r: Rect): number {
    return Math.min(r.width, r.height);
  }

  function worstAspect(row: LayoutNode[], side: number): number {
    if (!row.length) {
      return Number.POSITIVE_INFINITY;
    }
    const sum = row.reduce((acc, item) => acc + item.area, 0);
    if (sum === 0 || side === 0) {
      return Number.POSITIVE_INFINITY;
    }
    const maxArea = Math.max(...row.map((item) => item.area));
    const minArea = Math.max(Math.min(...row.map((item) => item.area)), Number.EPSILON);
    const sideSquared = side * side;
    const sumSquared = sum * sum;
    return Math.max((sideSquared * maxArea) / sumSquared, sumSquared / (sideSquared * minArea));
  }

  function placeRow(row: LayoutNode[], container: Rect): Rect {
    const horizontal = container.width >= container.height;
    const sumArea = row.reduce((acc, item) => acc + item.area, 0);

    if (sumArea <= 0) {
      const fallbackCount = row.length || 1;
      const fallbackWidth = horizontal ? container.width / fallbackCount : container.width;
      const fallbackHeight = horizontal ? container.height : container.height / fallbackCount;
      row.forEach((item, index) => {
        const x = horizontal ? container.x + index * fallbackWidth : container.x;
        const y = horizontal ? container.y : container.y + index * fallbackHeight;
        tiles.push({
          ...item,
          x,
          y,
          width: fallbackWidth,
          height: fallbackHeight,
          percentOfParent: totalSize > 0 ? item.size / totalSize : 0,
        });
      });
      return horizontal
        ? { x: container.x, y: container.y + container.height, width: container.width, height: 0 }
        : { x: container.x + container.width, y: container.y, width: 0, height: container.height };
    }

    if (horizontal) {
      const rowHeight = sumArea / container.width;
      let offsetX = container.x;
      row.forEach((item) => {
        const tileWidth = rowHeight > 0 ? item.area / rowHeight : container.width / row.length;
        tiles.push({
          ...item,
          x: offsetX,
          y: container.y,
          width: tileWidth,
          height: rowHeight,
          percentOfParent: totalSize > 0 ? item.size / totalSize : 0,
        });
        offsetX += tileWidth;
      });
      return {
        x: container.x,
        y: container.y + rowHeight,
        width: container.width,
        height: Math.max(container.height - rowHeight, 0),
      };
    }

    const columnWidth = sumArea / container.height;
    let offsetY = container.y;
    row.forEach((item) => {
      const tileHeight = columnWidth > 0 ? item.area / columnWidth : container.height / row.length;
      tiles.push({
        ...item,
        x: container.x,
        y: offsetY,
        width: columnWidth,
        height: tileHeight,
        percentOfParent: totalSize > 0 ? item.size / totalSize : 0,
      });
      offsetY += tileHeight;
    });
    return {
      x: container.x + columnWidth,
      y: container.y,
      width: Math.max(container.width - columnWidth, 0),
      height: container.height,
    };
  }

  let container = rect;
  let row: LayoutNode[] = [];

  while (remaining.length) {
    const side = shortestSide(container);
    const candidate = remaining[0];
    const newRow = [...row, candidate];
    if (!row.length || worstAspect(newRow, side) <= worstAspect(row, side)) {
      row = newRow;
      remaining.shift();
    } else {
      container = placeRow(row, container);
      row = [];
    }
    if ((container.width <= 0 || container.height <= 0) && remaining.length) {
      container = rect;
    }
  }

  if (row.length) {
    placeRow(row, container);
  }

  return tiles;
}

function useElementSize<T extends HTMLElement>(): [React.RefCallback<T>, { width: number; height: number }] {
  const observerRef = useRef<ResizeObserver | null>(null);
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const callbackRef = useCallback((node: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    setElement(node);
  }, []);

  useEffect(() => {
    if (!element) {
      setSize({ width: 0, height: 0 });
      return;
    }

    const update = () => {
      setSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    update();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target === element) {
            const { width, height } = entry.contentRect;
            setSize({ width, height });
          }
        }
      });
      observer.observe(element);
      observerRef.current = observer;
      return () => observer.disconnect();
    }

    const interval = window.setInterval(update, 250);
    return () => window.clearInterval(interval);
  }, [element]);

  return [callbackRef, size];
}

function buildBreadcrumbs(path: string): Array<{ label: string; path: string }> {
  if (!path) {
    return [];
  }
  const isWindows = path.includes("\\");
  const separator = isWindows ? "\\" : "/";
  const trimmed =
    path.length > (isWindows ? 3 : 1) && path.endsWith(separator) ? path.slice(0, -1) : path;
  const parts = trimmed.split(separator).filter((part) => part.length > 0);

  if (!parts.length) {
    return [{ label: path, path }];
  }

  if (isWindows) {
    const [drive, ...rest] = parts;
    const breadcrumbs: Array<{ label: string; path: string }> = [];
    const driveLabel = drive.endsWith(":") ? `${drive}\\` : `${drive}:\\`;
    breadcrumbs.push({ label: driveLabel, path: driveLabel });
    let pointer = driveLabel.replace(/\\$/, "");
    rest.forEach((segment) => {
      pointer = pointer.endsWith("\\") ? `${pointer}${segment}` : `${pointer}\\${segment}`;
      breadcrumbs.push({ label: segment, path: pointer });
    });
    return breadcrumbs;
  }

  const breadcrumbs: Array<{ label: string; path: string }> = [{ label: "/", path: "/" }];
  let pointer = "";
  parts.forEach((segment) => {
    pointer = `${pointer}/${segment}`.replace(/\/{2,}/g, "/");
    breadcrumbs.push({ label: segment || "/", path: pointer });
  });
  return breadcrumbs;
}

const palette = {
  background: "#F4E9D8",
  surface: "#FFF3E0",
  surfaceAlt: "#F3DFC9",
  surfaceMuted: "#FAE9D1",
  accent: "#E47B2B",
  accentStrong: "#C8611C",
  accentSoft: "#F6B68A",
  text: "#2D2117",
  textMuted: "#7C6B59",
  border: "#27180F",
  highlight: "#FFE7B9",
};

const shadows = {
  xl: "14px 14px 0 rgba(39,24,15,0.85)",
  lg: "10px 10px 0 rgba(39,24,15,0.8)",
  md: "6px 6px 0 rgba(39,24,15,0.7)",
  sm: "3px 3px 0 rgba(39,24,15,0.55)",
};

const panelStyle: React.CSSProperties = {
  border: `3px solid ${palette.border}`,
  borderRadius: 18,
  background: palette.surface,
  boxShadow: shadows.md,
};

const buttonStyle: React.CSSProperties = {
  border: `3px solid ${palette.border}`,
  borderRadius: 16,
  background: palette.surfaceAlt,
  padding: "10px 18px",
  fontFamily: theme.fontStack,
  fontWeight: 700,
  cursor: "pointer",
  transition: "transform 160ms ease, box-shadow 160ms ease",
  boxShadow: shadows.sm,
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `3px solid ${palette.border}`,
  borderRadius: 16,
  padding: "6px 12px",
  background: palette.highlight,
  fontFamily: theme.fontStack,
  fontSize: 12,
  fontWeight: 700,
  boxShadow: shadows.sm,
};

const menuStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 20,
  minWidth: 200,
  border: `3px solid ${palette.border}`,
  borderRadius: 16,
  background: palette.surface,
  boxShadow: shadows.md,
  padding: 6,
};

const menuItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  fontFamily: theme.fontStack,
  fontSize: 13,
  padding: "10px 12px",
  borderRadius: 14,
  cursor: "pointer",
  transition: "transform 140ms ease, background 140ms ease",
};

const drillDownCopy =
  "Drill Down reuses the completed scan so you can open folders instantly. Double-click a tile or right-click for actions.";

const treemapPadding = 8;

const MIN_LABEL_AREA = 120;

function Space() {
  const { updateScanState, resetScanState } = useScan();
  const [drives, setDrives] = useState<string[]>([]);
  const [driveStats, setDriveStats] = useState<Record<string, DriveStat>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const [scanRootPath, setScanRootPath] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, SpaceScanResult>>({});
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressVisible, setProgressVisible] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const [lastProgressAt, setLastProgressAt] = useState<number | null>(null);
  const pollTimer = useRef<number | null>(null);

  const progressHideHandle = useRef<number | null>(null);
  const listenersReadyRef = useRef(false);
  const pendingScanRef = useRef<string | null>(null);
  const runScanRef = useRef<(path: string) => void>(() => {});
  const pendingJobAckRef = useRef(false);
  const lastCancelledJobRef = useRef<string | null>(null);
  const updateScanStateRef = useRef(updateScanState);
  const resetScanStateRef = useRef(resetScanState);

  // Keep refs up to date
  useEffect(() => {
    updateScanStateRef.current = updateScanState;
    resetScanStateRef.current = resetScanState;
  }, [updateScanState, resetScanState]);

  const [treemapRef, treemapSize] = useElementSize<HTMLDivElement>();

  const reconcileJobId = useCallback(
    (incomingId: string) => {
      if (jobIdRef.current === incomingId) {
        console.log(`[scan] Job ID match: ${incomingId}`);
        return true;
      }
      if (pendingJobAckRef.current && incomingId !== lastCancelledJobRef.current) {
        console.log(`[scan] Accepting pending job: ${incomingId} (was: ${jobIdRef.current})`);
        jobIdRef.current = incomingId;
        setJobId(incomingId);
        pendingJobAckRef.current = false;
        return true;
      }
      console.warn(`[scan] REJECTED event for job ${incomingId}, current: ${jobIdRef.current}, pending: ${pendingJobAckRef.current}`);
      return false;
    },
    [setJobId],
  );

  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  useEffect(() => {
    return () => {
      if (progressHideHandle.current !== null) {
        window.clearTimeout(progressHideHandle.current);
        progressHideHandle.current = null;
      }
      if (pollTimer.current !== null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      const currentJob = jobIdRef.current;
      if (currentJob) {
        void invoke("space_scan_release", { job_id: currentJob }).catch(() => {
          /* ignored */
        });
      }
    };
  }, []);

  // Add shimmer animation for progress bar
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, []);

  const dismissContextMenu = useCallback(() => {
    setContextMenu(null);
    setHoveredMenuItem(null);
  }, []);

  useEffect(() => {
    const handleGlobalClick = () => dismissContextMenu();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismissContextMenu();
      }
    };
    window.addEventListener("click", handleGlobalClick);
    window.addEventListener("contextmenu", handleGlobalClick);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("click", handleGlobalClick);
      window.removeEventListener("contextmenu", handleGlobalClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [dismissContextMenu]);

  const runScan = useCallback(
    async (path: string) => {
      if (!path) {
        return;
      }

      dismissContextMenu();
      setErrorMessage(null);

      if (progressHideHandle.current !== null) {
        window.clearTimeout(progressHideHandle.current);
        progressHideHandle.current = null;
      }

      const previousJob = jobIdRef.current;
      if (previousJob) {
        lastCancelledJobRef.current = previousJob;
      } else {
        lastCancelledJobRef.current = null;
      }
      if (previousJob) {
        void invoke("space_scan_cancel", { job_id: previousJob }).catch(() => {
          /* ignore cancel errors */
        });
      }

      const nextJobId = crypto.randomUUID();
      console.log(`[scan] Starting scan with jobId: ${nextJobId}`);
      jobIdRef.current = nextJobId;
      setJobId(nextJobId);
      pendingJobAckRef.current = true;

      setSnapshots({});
      setProgress(null);
      setProgressPercent(0);
      setProgressVisible(true);
      setSelectedNodeId(null);
      setCurrentPath(null);
      setScanRootPath(path);
      setHistory([path]);
      setHistoryIndex(0);

      // Update global scan state
      updateScanState({
        isScanning: true,
        progress: 0,
        path,
        scannedEntries: 0,
        scannedBytes: 0,
      });

      try {
        const assignedJob = await invoke<string>("space_scan_start", {
          path,
          job_id: nextJobId,
        });
        console.log(`[scan] Backend returned jobId: ${assignedJob}, expected: ${nextJobId}`);
        if (assignedJob && assignedJob !== nextJobId) {
          console.log(`[scan] Updating to backend-assigned jobId: ${assignedJob}`);
          jobIdRef.current = assignedJob;
          setJobId(assignedJob);
        }
        pendingJobAckRef.current = false;
        console.log(`[scan] pendingJobAckRef set to false, jobIdRef.current: ${jobIdRef.current}`);
        setProgress({
          path,
          completedChildren: 0,
          totalChildren: 0,
          scannedEntries: 0,
          scannedBytes: 0,
          currentPath: path,
        });
      } catch (error) {
        jobIdRef.current = null;
        setJobId(null);
        pendingJobAckRef.current = false;
        setProgressVisible(false);
        resetScanState();
        const message =
          error instanceof Error ? error.message : "Unable to start scan. Please try again.";
        setErrorMessage(message);
      }
    },
    [dismissContextMenu, updateScanState, resetScanState],
  );

  useEffect(() => {
    runScanRef.current = (path: string) => {
      void runScan(path);
    };
  }, [runScan]);

  const queueScan = useCallback(
    (path: string | null) => {
      if (!path) {
        return;
      }
      if (!listenersReadyRef.current) {
        pendingScanRef.current = path;
        return;
      }
      void runScan(path);
    },
    [runScan],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [driveList, stats] = await Promise.all([
          invoke<string[]>("space_drives"),
          invoke<DriveStat[]>("space_drive_stats"),
        ]);
        if (!mounted) {
          return;
        }
        setDrives(driveList);
        const statsMap = stats.reduce<Record<string, DriveStat>>((acc, stat) => {
          acc[normalizeDriveKey(stat.path)] = stat;
          return acc;
        }, {});
        setDriveStats(statsMap);
        // Don't auto-start scan - wait for user to click "Scan" button
      } catch (error) {
        if (!mounted) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Unable to enumerate drives. Space requires disk access.";
        setErrorMessage(message);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listenersReadyRef.current = false;
    const unlisten: UnlistenFn[] = [];
    (async () => {
        try {
          const started = await listen<ScanStartedEvent>("space-scan-started", (event) => {
            console.log(`[scan] Received space-scan-started event, jobId: ${event.payload.jobId}`);
            if (!reconcileJobId(event.payload.jobId)) {
              return;
            }
            console.log(`[scan] Processing space-scan-started event`);
            setProgressVisible(true);
            setProgress((current) => ({
              path: event.payload.path,
              completedChildren: current?.completedChildren ?? 0,
              totalChildren: current?.totalChildren ?? 0,
              scannedEntries: current?.scannedEntries ?? 0,
              scannedBytes: current?.scannedBytes ?? 0,
              currentPath: current?.currentPath ?? event.payload.path,
            }));
          });
          const progressListener = await listen<ScanProgressEvent>(
            "space-scan-progress",
            (event) => {
              // Only log occasionally to avoid console spam
              if (event.payload.progress.scannedEntries % 10000 < 100) {
                console.log(`[scan] Received progress event, jobId: ${event.payload.jobId}, entries: ${event.payload.progress.scannedEntries}`);
              }
              if (!reconcileJobId(event.payload.jobId)) {
                return;
              }
              const payload = event.payload.progress;
              setProgress(payload);
              setProgressVisible(true);
              setLastProgressAt(Date.now());

              // Calculate progress based on multiple signals:
              // 1. Top-level folder completion (completedChildren / totalChildren)
              // 2. Entry count progress (logarithmic scale for large scans)
              // 3. Bytes scanned progress
              // Blend these for smoother progress that doesn't stay at 0%

              let nextPercent = 5; // Start at 5% once scanning begins

              if (payload.totalChildren > 0 && payload.completedChildren > 0) {
                // Primary: folder completion progress (weighted 60%)
                const folderProgress = (payload.completedChildren / payload.totalChildren) * 100;
                nextPercent = Math.max(nextPercent, folderProgress);
              }

              if (payload.scannedEntries > 0) {
                // Secondary: entry-based progress using logarithmic scale
                // Typical drive has 100k-1M entries, so scale appropriately
                // log10(1000) = 3, log10(100000) = 5, log10(1000000) = 6
                const entryProgress = Math.min(85, (Math.log10(payload.scannedEntries + 1) / 6) * 85);
                nextPercent = Math.max(nextPercent, entryProgress);
              }

              if (payload.scannedBytes > 0) {
                // Tertiary: bytes-based progress (assume ~100GB drive usage)
                const assumedTotalBytes = 100 * 1024 * 1024 * 1024; // 100GB assumption
                const bytesProgress = Math.min(80, (payload.scannedBytes / assumedTotalBytes) * 80);
                nextPercent = Math.max(nextPercent, bytesProgress);
              }

              // Cap at 99% until scan completes
              nextPercent = Math.min(99, nextPercent);

              setProgressPercent((current) => {
                // Always allow progress to increase, never decrease
                const next = Math.max(current, nextPercent);
                return Number.isFinite(next) ? next : current;
              });

              // Update global scan state
              updateScanStateRef.current({
                progress: nextPercent,
                scannedEntries: payload.scannedEntries,
                scannedBytes: payload.scannedBytes,
              });
            },
          );
          const complete = await listen<ScanCompleteEvent>("space-scan-complete", (event) => {
            console.log(`[scan] Received space-scan-complete event, jobId: ${event.payload.jobId}`);
            if (!reconcileJobId(event.payload.jobId)) {
              return;
            }
            console.log(`[scan] Processing space-scan-complete event - updating UI`);
            const result = event.payload.result;
            setSnapshots((prev) => ({ ...prev, [result.path]: result }));
            setScanRootPath(result.path);
            setCurrentPath(result.path);
            setHistory([result.path]);
            setHistoryIndex(0);
            setProgress((current) =>
              current
                ? {
                    ...current,
                    completedChildren: current.totalChildren || current.completedChildren,
                  }
                : null,
            );
            setProgressPercent(100);
            setLastUpdated(Date.now());

            // Update global scan state to complete
            updateScanStateRef.current({
              isScanning: false,
              progress: 100,
            });

            if (progressHideHandle.current !== null) {
              window.clearTimeout(progressHideHandle.current);
            }
            progressHideHandle.current = window.setTimeout(() => {
              setProgressVisible(false);
              progressHideHandle.current = null;
              // Reset global state after hiding
              resetScanStateRef.current();
            }, 1200);
          });
          const cancelled = await listen<ScanCancelledEvent>("space-scan-cancelled", (event) => {
            if (!reconcileJobId(event.payload.jobId)) {
              return;
            }
            setProgressVisible(false);
            setProgress(null);
            setProgressPercent(0);
            resetScanStateRef.current();
          });
          const errored = await listen<ScanErrorEvent>("space-scan-error", (event) => {
            if (!reconcileJobId(event.payload.jobId)) {
              return;
            }
            setErrorMessage(event.payload.message);
            setProgressVisible(false);
            setProgress(null);
            setProgressPercent(0);
            resetScanStateRef.current();
          });

        listenersReadyRef.current = true;
        const queued = pendingScanRef.current;
        if (queued) {
          pendingScanRef.current = null;
          runScanRef.current?.(queued);
        }

        if (!active) {
          started();
          progressListener();
          complete();
          cancelled();
          errored();
        } else {
          unlisten.push(started, progressListener, complete, cancelled, errored);
        }
      } catch (error) {
        if (error instanceof Error) {
          setErrorMessage(error.message);
        }
      }
    })();

    return () => {
      active = false;
      listenersReadyRef.current = false;
      while (unlisten.length) {
        const off = unlisten.pop();
        if (off) {
          off();
        }
      }
    };
  }, []);

  const currentSnapshot = currentPath ? snapshots[currentPath] : undefined;
  const rootSnapshot = scanRootPath ? snapshots[scanRootPath] : undefined;

  // Fallback polling if events stall
  useEffect(() => {
    if (!jobId || !progressVisible) {
      if (pollTimer.current !== null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
      return;
    }
    if (pollTimer.current !== null) {
      return;
    }
    pollTimer.current = window.setInterval(() => {
      const last = lastProgressAt ?? 0;
      if (Date.now() - last < 3000) {
        return;
      }
      void invoke<ScanProgress | null>("space_scan_status", { job_id: jobId })
        .then((payload) => {
          if (!payload) return;
          setProgress(payload);
          setProgressVisible(true);
          setLastProgressAt(Date.now());

          let nextPercent = 5;
          if (payload.totalChildren > 0 && payload.completedChildren > 0) {
            const folderProgress = (payload.completedChildren / payload.totalChildren) * 100;
            nextPercent = Math.max(nextPercent, folderProgress);
          }
          if (payload.scannedEntries > 0) {
            const entryProgress = Math.min(85, (Math.log10(payload.scannedEntries + 1) / 6) * 85);
            nextPercent = Math.max(nextPercent, entryProgress);
          }
          if (payload.scannedBytes > 0) {
            const assumedTotalBytes = 100 * 1024 * 1024 * 1024;
            const bytesProgress = Math.min(80, (payload.scannedBytes / assumedTotalBytes) * 80);
            nextPercent = Math.max(nextPercent, bytesProgress);
          }
          nextPercent = Math.min(99, nextPercent);
          setProgressPercent((current) => Math.max(current, nextPercent));
          updateScanStateRef.current({
            progress: nextPercent,
            scannedEntries: payload.scannedEntries,
            scannedBytes: payload.scannedBytes,
          });
        })
        .catch(() => {
          /* ignore poll errors */
        });
    }, 1500);

    return () => {
      if (pollTimer.current !== null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [jobId, progressVisible, lastProgressAt, updateScanState]);

  useEffect(() => {
    if (!currentSnapshot) {
      setSelectedNodeId(null);
      return;
    }
    const otherId =
      currentSnapshot.otherSize > 0 ? getOtherNodeId(currentSnapshot.path) : undefined;
    const childIds = new Set(currentSnapshot.children.map((child) => child.path));

    if (
      selectedNodeId &&
      (selectedNodeId === currentSnapshot.path ||
        childIds.has(selectedNodeId) ||
        (otherId && selectedNodeId === otherId))
    ) {
      return;
    }

    if (currentSnapshot.children.length > 0) {
      setSelectedNodeId(currentSnapshot.children[0].path);
      return;
    }

    if (otherId) {
      setSelectedNodeId(otherId);
      return;
    }

    setSelectedNodeId(currentSnapshot.path);
  }, [currentSnapshot, selectedNodeId]);

  const aggregatedNodes = useMemo<TreemapNode[]>(() => {
    if (!currentSnapshot) {
      return [];
    }
    const base = currentSnapshot.children.map<TreemapNode>((child) => ({
      id: child.path,
      path: child.path,
      name: child.name,
      size: child.size,
      isDir: child.isDir,
      fileCount: child.fileCount,
      dirCount: child.dirCount,
      kind: "child",
    }));
    if (currentSnapshot.otherSize > 0) {
      base.push({
        id: getOtherNodeId(currentSnapshot.path),
        path: currentSnapshot.path,
        name:
          currentSnapshot.otherChildren === 1
            ? "1 other item"
            : `${currentSnapshot.otherChildren} other items`,
        size: currentSnapshot.otherSize,
        isDir: false,
        fileCount: currentSnapshot.otherChildren,
        dirCount: 0,
        kind: "other",
      });
    }
    return base;
  }, [currentSnapshot]);

  const tiles = useMemo<TreemapTile[]>(() => {
    if (!currentSnapshot) {
      return [];
    }
    const size = {
      width: Math.max(treemapSize.width - treemapPadding * 2, 0),
      height: Math.max(treemapSize.height - treemapPadding * 2, 0),
    };
    const computed = computeTreemap(aggregatedNodes, size.width, size.height);
    return computed.map((tile) => ({
      ...tile,
      x: tile.x + treemapPadding,
      y: tile.y + treemapPadding,
    }));
  }, [aggregatedNodes, currentSnapshot, treemapSize.height, treemapSize.width]);

  const selectedNode = useMemo<TreemapNode | null>(() => {
    if (!currentSnapshot) {
      return null;
    }
    if (!selectedNodeId || selectedNodeId === currentSnapshot.path) {
      return {
        id: currentSnapshot.path,
        path: currentSnapshot.path,
        name: currentSnapshot.name,
        size: currentSnapshot.totalSize,
        isDir: true,
        fileCount: currentSnapshot.fileCount,
        dirCount: currentSnapshot.dirCount,
        kind: "self",
      };
    }
    const child = currentSnapshot.children.find((entry) => entry.path === selectedNodeId);
    if (child) {
      return {
        id: child.path,
        path: child.path,
        name: child.name,
        size: child.size,
        isDir: child.isDir,
        fileCount: child.fileCount,
        dirCount: child.dirCount,
        kind: "child",
      };
    }
    if (currentSnapshot.otherSize > 0) {
      const otherId = getOtherNodeId(currentSnapshot.path);
      if (selectedNodeId === otherId) {
        return {
          id: otherId,
          path: currentSnapshot.path,
          name:
            currentSnapshot.otherChildren === 1
              ? "1 other item"
              : `${currentSnapshot.otherChildren} other items`,
          size: currentSnapshot.otherSize,
          isDir: false,
          fileCount: currentSnapshot.otherChildren,
          dirCount: 0,
          kind: "other",
        };
      }
    }
    return null;
  }, [currentSnapshot, selectedNodeId]);

  const percentWithinParent =
    selectedNode && currentSnapshot && currentSnapshot.totalSize > 0
      ? (selectedNode.size / currentSnapshot.totalSize) * 100
      : 0;

  const percentOfRoot =
    selectedNode && rootSnapshot && rootSnapshot.totalSize > 0
      ? (selectedNode.size / rootSnapshot.totalSize) * 100
      : null;

  const driveStat =
    rootSnapshot &&
    driveStats[normalizeDriveKey(rootSnapshot.path)] !== undefined
      ? driveStats[normalizeDriveKey(rootSnapshot.path)]
      : null;
  const permissionDeniedEntries = rootSnapshot?.permissionDeniedEntries ?? 0;
  const missingEntries = rootSnapshot?.missingEntries ?? 0;
  const otherErrors = rootSnapshot?.otherErrors ?? 0;
  const hasScanNotes =
    !!rootSnapshot &&
    (permissionDeniedEntries > 0 || missingEntries > 0 || otherErrors > 0);
  const infoBadgeStyle: React.CSSProperties = {
    ...badgeStyle,
    background: palette.surface,
    boxShadow: "none",
  };

  const goBack = useCallback(() => {
    if (historyIndex <= 0) {
      return;
    }
    const nextIndex = historyIndex - 1;
    const target = history[nextIndex];
    setHistoryIndex(nextIndex);
    setCurrentPath(target);
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < 0 || historyIndex >= history.length - 1) {
      return;
    }
    const nextIndex = historyIndex + 1;
    const target = history[nextIndex];
    setHistoryIndex(nextIndex);
    setCurrentPath(target);
  }, [history, historyIndex]);

  const drillDown = useCallback(
    async (node: TreemapNode | null) => {
      if (!node || node.kind === "other") {
        return;
      }
      if (!node.isDir) {
        setSelectedNodeId(node.id);
        return;
      }
      const currentJob = jobIdRef.current;
      if (!currentJob) {
        return;
      }

      setLoadingPath(node.path);
      setErrorMessage(null);
      dismissContextMenu();

      try {
        if (!snapshots[node.path]) {
          const result = await invoke<SpaceScanResult>("space_scan_snapshot", {
            job_id: currentJob,
            path: node.path,
          });
          setSnapshots((prev) => ({ ...prev, [result.path]: result }));
        }
        setCurrentPath(node.path);
        setHistory((prev) => {
          const next = prev.slice(0, historyIndex + 1);
          next.push(node.path);
          return next;
        });
        setHistoryIndex((prev) => prev + 1);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to open folder snapshot.";
        setErrorMessage(message);
      } finally {
        setLoadingPath(null);
      }
    },
    [dismissContextMenu, historyIndex, snapshots],
  );

  const revealInExplorer = useCallback((node: TreemapNode | null) => {
    if (!node || node.kind === "other") {
      return;
    }
    dismissContextMenu();
    setErrorMessage(null);
    void invoke("space_reveal_path", { path: node.path }).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unable to reveal item in Explorer.";
      setErrorMessage(message);
    });
  }, [dismissContextMenu]);

  const deletePath = useCallback(
    async (node: TreemapNode | null) => {
      if (!node || node.kind === "other") {
        return;
      }
      dismissContextMenu();
      const confirmation = window.confirm(
        `Delete "${node.name}"?\nThis action cannot be undone.`,
      );
      if (!confirmation) {
        return;
      }
      try {
        await invoke("space_delete_path", { path: node.path });
        if (scanRootPath) {
        await runScan(scanRootPath);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to delete the selected item.";
        setErrorMessage(message);
      }
    },
    [dismissContextMenu, runScan, scanRootPath],
  );

  const contextMenuItems = useMemo(
    () =>
      contextMenu
        ? [
            {
              label: "Drill Down",
              detail: "Open this snapshot",
              disabled: !contextMenu.node.isDir || contextMenu.node.kind === "other",
              action: () => drillDown(contextMenu.node),
            },
            {
              label: "Reveal in Explorer",
              detail: "Open folder location",
              disabled: contextMenu.node.kind === "other",
              action: () => revealInExplorer(contextMenu.node),
            },
            {
              label: "Delete",
              detail: "Remove from disk",
              disabled: contextMenu.node.kind === "other",
              action: () => deletePath(contextMenu.node),
            },
          ]
        : [],
    [contextMenu, deletePath, drillDown, revealInExplorer],
  );

  const scanning = progressVisible && progressPercent < 100;
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;

  const handleTileContextMenu = useCallback(
    (event: ReactMouseEvent, node: TreemapNode) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedNodeId(node.id);
      setHoveredMenuItem(null);
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        node,
      });
    },
    [],
  );

  const handleTileDoubleClick = useCallback(
    (node: TreemapNode) => {
      void drillDown(node);
    },
    [drillDown],
  );

  const handleBreadcrumbClick = useCallback(
    (path: string) => {
      if (!snapshots[path]) {
        return;
      }
      setCurrentPath(path);
      const index = history.indexOf(path);
      if (index >= 0) {
        setHistoryIndex(index);
      } else {
        setHistory((prev) => {
          const next = prev.slice(0, historyIndex + 1);
          next.push(path);
          return next;
        });
        setHistoryIndex((prev) => prev + 1);
      }
    },
    [history, historyIndex, snapshots],
  );

  const driveOptions = drives.length ? drives : Object.values(driveStats).map((stat) => stat.path);
  const activeDrive = rootSnapshot?.path ?? scanRootPath ?? driveOptions[0] ?? "";

  const usedBytes =
    driveStat !== null ? driveStat.totalBytes - driveStat.availableBytes : undefined;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: palette.background,
        backgroundImage:
          "radial-gradient(circle at 24px 24px, rgba(255,255,255,0.08) 0, rgba(255,255,255,0.08) 2px, transparent 2px)",
        backgroundSize: "48px 48px",
        color: palette.text,
        fontFamily: theme.fontStack,
        padding: 18,
        gap: 18,
      }}
    >
      <header
        style={{
          ...panelStyle,
          padding: 16,
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <label
            style={{
              ...panelStyle,
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "8px 12px",
              boxShadow: shadows.sm,
              cursor: "pointer",
            }}
          >
            <span style={{ fontWeight: 700 }}>Drive</span>
            <select
              value={activeDrive}
              onChange={(event) => queueScan(event.target.value)}
              style={{
                border: "none",
                background: "transparent",
                fontFamily: theme.fontStack,
                fontWeight: 600,
                fontSize: 14,
                outline: "none",
              }}
            >
              {driveOptions.map((drive) => (
                <option key={drive} value={drive}>
                  {drive}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => queueScan(activeDrive)}
            style={{
              ...buttonStyle,
              background: palette.accent,
              color: palette.surface,
              boxShadow: shadows.sm,
            }}
            disabled={!activeDrive || scanning}
          >
            {scanning ? "Scanning..." : rootSnapshot ? "Rescan" : "Scan"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {driveStat && (
            <span style={badgeStyle}>
              <strong>{formatBytes(usedBytes ?? 0)}</strong> used / {formatBytes(driveStat.totalBytes)}
            </span>
          )}
          {progressVisible && (
            <span
              style={{
                ...badgeStyle,
                background: palette.accentSoft,
              }}
            >
              {progressPercent >= 100 ? "Scan complete" : "Scanning"} - {progressPercent.toFixed(0)}%
            </span>
          )}
          {progressVisible && progress?.currentPath && (
            <span
              style={{
                ...badgeStyle,
                background: palette.surface,
                color: palette.textMuted,
                maxWidth: 360,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={progress.currentPath}
            >
              Scanning: {progress.currentPath}
            </span>
          )}
          {lastUpdated && !scanning && (
            <span style={badgeStyle}>
              Updated {new Date(lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {errorMessage && (
        <div
          style={{
            ...panelStyle,
            background: "#ffe1d4",
            borderColor: palette.border,
            color: palette.text,
            padding: 12,
          }}
        >
          <strong style={{ display: "block", marginBottom: 4 }}>Heads up</strong>
          <span>{errorMessage}</span>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 16,
          alignItems: "stretch",
          minHeight: 0,
        }}
      >
        <aside
          style={{
            ...panelStyle,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: 16,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Details</div>
            <div style={{ fontSize: 13, color: palette.textMuted, marginTop: 4 }}>
              {currentSnapshot ? currentSnapshot.path : "Select a drive to start scanning."}
            </div>
          </div>

          {selectedNode && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{selectedNode.name}</div>
                <div style={{ color: palette.textMuted, fontSize: 14, marginTop: 4 }}>
                  {selectedNode.kind === "self"
                    ? "Current folder"
                    : selectedNode.isDir
                      ? "Folder"
                      : "File"}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  fontSize: 14,
                }}
              >
                <div style={badgeStyle}>
                  <span>Size</span>
                  <strong>{formatBytes(selectedNode.size)}</strong>
                </div>
                <div style={badgeStyle}>
                  <span>Within folder</span>
                  <strong>{formatPercent(percentWithinParent)}</strong>
                </div>
                {percentOfRoot !== null && (
                  <div style={badgeStyle}>
                    <span>Of scan root</span>
                    <strong>{formatPercent(percentOfRoot)}</strong>
                  </div>
                )}
              </div>

              <div
                style={{
                  border: `2px dashed ${palette.border}`,
                  borderRadius: theme.radius,
                  padding: 12,
                  background: palette.surfaceAlt,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {selectedNode.kind === "other" ? (
                  <span>
                    These entries are smaller items grouped together. Run a rescan to unpack them
                    or explore directly in Explorer.
                  </span>
                ) : (
                  <span>
                    {selectedNode.isDir
                      ? `Contains ${numberFormatter.format(selectedNode.dirCount)} folders and ${numberFormatter.format(selectedNode.fileCount - selectedNode.dirCount)} files.`
                      : "Single file entry captured during the scan."}
                  </span>
                )}
              </div>
            </div>
          )}

          {hasScanNotes && (
            <div
              style={{
                ...panelStyle,
                background: palette.surfaceMuted,
                padding: 12,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>Scan notes</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  fontSize: 12,
                }}
              >
                {permissionDeniedEntries > 0 && (
                  <span style={infoBadgeStyle}>
                    {numberFormatter.format(permissionDeniedEntries)}{" "}
                    {permissionDeniedEntries === 1 ? "protected item" : "protected items"} skipped
                  </span>
                )}
                {missingEntries > 0 && (
                  <span style={infoBadgeStyle}>
                    {numberFormatter.format(missingEntries)}{" "}
                    {missingEntries === 1 ? "entry" : "entries"} vanished during scan
                  </span>
                )}
                {otherErrors > 0 && (
                  <span style={infoBadgeStyle}>
                    {numberFormatter.format(otherErrors)} unreadable{" "}
                    {otherErrors === 1 ? "entry" : "entries"}
                  </span>
                )}
              </div>
              {permissionDeniedEntries > 0 && (
                <div style={{ fontSize: 12, color: palette.textMuted }}>
                  Run the Space utility as administrator to include protected system folders.
                </div>
              )}
            </div>
          )}

          <div
            style={{
              ...panelStyle,
              background: palette.surfaceAlt,
              padding: 12,
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Drill Down</div>
            <div>{drillDownCopy}</div>
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              <li>Double-click a tile or list item to enter the folder.</li>
              <li>Right-click for the action menu: Drill Down, Reveal, Delete.</li>
            </ul>
          </div>

          {driveStat && (
            <div
              style={{
                ...panelStyle,
                padding: 12,
                background: palette.surfaceAlt,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700 }}>Drive usage</div>
              <div
                style={{
                  height: 12,
                  border: `2px solid ${palette.border}`,
                  borderRadius: theme.radius,
                  background: palette.surface,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: driveStat.totalBytes
                      ? `${Math.min(
                          100,
                          ((usedBytes ?? 0) / driveStat.totalBytes) * 100,
                        ).toFixed(1)}%`
                      : "0%",
                    background: palette.accent,
                    transition: "width 240ms ease-out",
                  }}
                />
              </div>
              <div style={{ fontSize: 13, color: palette.textMuted }}>
                {formatBytes(usedBytes ?? 0)} used • {formatBytes(driveStat.availableBytes)} free
              </div>
            </div>
          )}
        </aside>

        <main
          style={{
            ...panelStyle,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={goBack}
                style={{
                  ...buttonStyle,
                  padding: "6px 14px",
                  boxShadow: canGoBack ? shadows.sm : "none",
                  cursor: canGoBack ? "pointer" : "not-allowed",
                  opacity: canGoBack ? 1 : 0.4,
                }}
                disabled={!canGoBack}
              >
                Back
              </button>
              <button
                type="button"
                onClick={goForward}
                style={{
                  ...buttonStyle,
                  padding: "6px 14px",
                  boxShadow: canGoForward ? shadows.sm : "none",
                  cursor: canGoForward ? "pointer" : "not-allowed",
                  opacity: canGoForward ? 1 : 0.4,
                }}
                disabled={!canGoForward}
              >
                Forward
              </button>
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                alignItems: "center",
                fontSize: 12,
              }}
            >
              {currentSnapshot &&
                buildBreadcrumbs(currentSnapshot.path).map((crumb, index, list) => (
                  <Fragment key={crumb.path}>
                    <button
                      type="button"
                      onClick={() => handleBreadcrumbClick(crumb.path)}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontFamily: theme.fontStack,
                        fontWeight: index === list.length - 1 ? 700 : 500,
                        cursor: index === list.length - 1 ? "default" : "pointer",
                        textDecoration: index === list.length - 1 ? "none" : "underline",
                        color:
                          index === list.length - 1
                            ? palette.text
                            : palette.textMuted,
                      }}
                      disabled={index === list.length - 1}
                    >
                      {crumb.label}
                    </button>
                    {index !== list.length - 1 && <span>/</span>}
                  </Fragment>
                ))}
            </div>
          </div>

          <div
            ref={treemapRef}
            style={{
              position: "relative",
              flex: "1 1 auto",
              minHeight: 320,
              border: `2px solid ${palette.border}`,
              borderRadius: theme.radius,
              background: palette.surfaceAlt,
              overflow: "hidden",
            }}
          >
            {!currentSnapshot && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  color: palette.textMuted,
                  padding: 32,
                }}
              >
                {scanning ? (
                  <>
                    <div style={{ fontWeight: 800, fontSize: 24, marginBottom: 16, color: palette.text }}>
                      Scanning Drive...
                    </div>
                    <div style={{
                      width: "100%",
                      maxWidth: 400,
                      height: 20,
                      border: `3px solid ${palette.border}`,
                      borderRadius: 12,
                      background: palette.surface,
                      overflow: "hidden",
                      position: "relative",
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${progressPercent}%`,
                        background: `linear-gradient(90deg, ${palette.accent}, ${palette.accentSoft})`,
                        transition: "width 300ms ease-out",
                        position: "relative",
                      }}>
                        <div style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)",
                          animation: "shimmer 1.5s infinite",
                        }} />
                      </div>
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 900, marginTop: 16, color: palette.text }}>
                      {progressPercent.toFixed(0)}%
                    </div>
                    {progress && (
                      <div style={{ fontSize: 14, marginTop: 12, textAlign: "center" }}>
                        <div>{numberFormatter.format(progress.scannedEntries)} entries scanned</div>
                        <div style={{ marginTop: 4 }}>{formatBytes(progress.scannedBytes)} analyzed</div>
                        {progress.totalChildren > 0 && (
                          <div style={{ marginTop: 4 }}>
                            {progress.completedChildren} / {progress.totalChildren} top-level items
                          </div>
                        )}
                        {progress.currentPath && (
                          <div style={{
                            marginTop: 8,
                            fontSize: 11,
                            color: palette.textMuted,
                            maxWidth: 350,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap"
                          }}>
                            {progress.currentPath.length > 60
                              ? "..." + progress.currentPath.slice(-57)
                              : progress.currentPath}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 18 }}>Ready to Scan</div>
                    <div style={{ fontSize: 13, marginTop: 8 }}>
                      Pick a drive and click Scan to view the treemap.
                    </div>
                  </>
                )}
              </div>
            )}

            {currentSnapshot &&
              tiles.map((tile) => {
                const isSelected = selectedNodeId === tile.id;
                const area = tile.width * tile.height;
                const showLabel = area > MIN_LABEL_AREA;
                return (
                  <div
                    key={tile.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedNodeId(tile.id)}
                    onDoubleClick={() => handleTileDoubleClick(tile)}
                    onContextMenu={(event) => handleTileContextMenu(event, tile)}
                    style={{
                      position: "absolute",
                      left: tile.x,
                      top: tile.y,
                      width: tile.width,
                      height: tile.height,
                      background: tile.color,
                      border: isSelected
                        ? `3px solid ${palette.border}`
                        : `1px solid ${palette.border}`,
                      borderRadius: 6,
                      boxShadow: isSelected
                        ? `${shadows.sm}, inset 0 0 0 2px rgba(255,255,255,0.25)`
                        : "4px 4px 0 rgba(39,24,15,0.3)",
                      padding: 8,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      cursor: tile.kind === "other" ? "default" : "pointer",
                      color: palette.text,
                      transition: "transform 160ms ease, box-shadow 160ms ease",
                      transform: isSelected ? "translate(-2px, -2px)" : "translate(0, 0)",
                      outline: "none",
                    }}
                  >
                    {showLabel && (
                      <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>
                        {tile.name}
                      </div>
                    )}
                    {showLabel && (
                      <div style={{ fontSize: 12, fontWeight: 600 }}>
                        {formatBytes(tile.size)} - {formatPercent(tile.percentOfParent * 100)}
                      </div>
                    )}
                  </div>
                );
              })}

            {scanning && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(247, 241, 226, 0.8)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  fontWeight: 600,
                }}
              >
                <span>Scanning...</span>
                {progress && (
                  <span style={{ fontSize: 12, color: palette.textMuted }}>
                    {numberFormatter.format(progress.scannedEntries)} entries inspected
                  </span>
                )}
              </div>
            )}
          </div>

          <div
            style={{
              border: `2px solid ${palette.border}`,
              borderRadius: theme.radius,
              overflow: "hidden",
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
              }}
            >
              <thead style={{ background: palette.surfaceAlt }}>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderBottom: `2px solid ${palette.border}`,
                    }}
                  >
                    Name
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 12px",
                      borderBottom: `2px solid ${palette.border}`,
                    }}
                  >
                    Size
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 12px",
                      borderBottom: `2px solid ${palette.border}`,
                    }}
                  >
                    % of folder
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 12px",
                      borderBottom: `2px solid ${palette.border}`,
                    }}
                  >
                    Items
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentSnapshot &&
                  aggregatedNodes.map((node) => {
                    const isSelected = selectedNodeId === node.id;
                    return (
                      <tr
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        onDoubleClick={() => handleTileDoubleClick(node)}
                        onContextMenu={(event) => handleTileContextMenu(event, node)}
                        style={{
                          cursor: node.kind === "other" ? "default" : "pointer",
                          background: isSelected ? palette.accentSoft : palette.surface,
                          borderBottom: `1px solid ${palette.border}`,
                        }}
                      >
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{node.name}</td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {formatBytes(node.size)}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {currentSnapshot.totalSize
                            ? formatPercent((node.size / currentSnapshot.totalSize) * 100)
                            : "0%"}
                        </td>
                        <td style={{ padding: "8px 12px", textAlign: "right" }}>
                          {numberFormatter.format(node.fileCount)}
                        </td>
                      </tr>
                    );
                  })}
                {!currentSnapshot && (
                  <tr>
                    <td
                      colSpan={4}
                      style={{
                        padding: "16px 12px",
                        textAlign: "center",
                        color: palette.textMuted,
                      }}
                    >
                      Treemap data will appear after the first scan completes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {contextMenu && (
        <div
          style={{
            ...menuStyle,
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          {contextMenuItems.map((item) => {
            const isHovered = !item.disabled && item.label && hoveredMenuItem === item.label;
            return (
              <div
                key={item.label}
                role="menuitem"
                onClick={() => {
                  if (!item.disabled) {
                    item.action();
                    dismissContextMenu();
                  }
                }}
                onMouseEnter={() => {
                  if (!item.disabled && item.label) {
                    setHoveredMenuItem(item.label);
                  }
                }}
                onMouseLeave={() => {
                  setHoveredMenuItem((current) =>
                    current && current === item.label ? null : current,
                  );
                }}
                style={{
                  ...menuItemStyle,
                  color: item.disabled ? palette.textMuted : palette.text,
                  cursor: item.disabled ? "not-allowed" : "pointer",
                  background: item.disabled
                    ? palette.surface
                    : isHovered
                      ? palette.accentSoft
                      : palette.surfaceAlt,
                  transform: isHovered ? "translate(-2px, -2px)" : "translate(0, 0)",
                  boxShadow: isHovered ? shadows.sm : "none",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: palette.textMuted }}>{item.detail}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loadingPath && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            ...panelStyle,
            padding: "10px 16px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>Opening snapshot...</span>
          <span style={{ fontWeight: 700 }}>{loadingPath}</span>
        </div>
      )}
    </div>
  );
}

export default Space;
