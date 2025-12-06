import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export type ScanState = {
  isScanning: boolean;
  progress: number;
  path: string | null;
  scannedEntries: number;
  scannedBytes: number;
};

type ScanContextValue = {
  scanState: ScanState;
  updateScanState: (updates: Partial<ScanState>) => void;
  resetScanState: () => void;
};

const initialState: ScanState = {
  isScanning: false,
  progress: 0,
  path: null,
  scannedEntries: 0,
  scannedBytes: 0,
};

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: ReactNode }) {
  const [scanState, setScanState] = useState<ScanState>(initialState);

  const updateScanState = useCallback((updates: Partial<ScanState>) => {
    setScanState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetScanState = useCallback(() => {
    setScanState(initialState);
  }, []);

  return (
    <ScanContext.Provider value={{ scanState, updateScanState, resetScanState }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScan() {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error("useScan must be used within a ScanProvider");
  }
  return context;
}
