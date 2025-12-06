import { useEffect, useState } from "react";
import App from "../../App";
import { theme } from "../../setup/theme";

export default function UnboxHost() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => setReady(true), 220);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <div
      className="unbox-host-container"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        background: theme.colors.surface,
      }}
    >
      {!ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(247, 241, 226, 0.92)",
            fontFamily: theme.fontStack,
            fontWeight: 600,
            color: theme.colors.textMuted,
            zIndex: 2,
          }}
        >
          Preparing Unbox workspace...
        </div>
      )}
      <div
        className="unbox-app-wrapper"
        style={{
          opacity: ready ? 1 : 0,
          transition: "opacity 240ms ease",
          display: "flex",
          flex: 1,
          minHeight: 0,
        }}
      >
        <App />
      </div>
    </div>
  );
}
