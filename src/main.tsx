import React from "react";
import ReactDOM from "react-dom/client";
import { Setup } from "./setup/Setup";
import { SettingsProvider } from "./contexts/SettingsContext";
import { ScanProvider } from "./contexts/ScanContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <ScanProvider>
        <Setup />
      </ScanProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
