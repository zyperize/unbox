import React, { Suspense, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { theme } from "./theme";
import { useScan } from "../contexts/ScanContext";
import { useSettings } from "../contexts/SettingsContext";

const Unbox = React.lazy(() => import("../apps/unbox/UnboxHost"));
const Specs = React.lazy(() => import("../apps/specs/Specs"));
const Space = React.lazy(() => import("../apps/space/Space"));

const appWindow = getCurrentWindow();

type AppKey = "launcher" | "unbox" | "specs" | "space";

const apps = [
  {
    key: "specs" as const,
    icon: "[S]",
    title: "Specs",
    blurb: "Realtime telemetry for CPU, GPU, memory, and temperatures.",
  },
  {
    key: "unbox" as const,
    icon: "[U]",
    title: "Unbox",
    blurb: "Modern archiver and file explorer with instant drag-and-drop.",
  },
  {
    key: "space" as const,
    icon: "[D]",
    title: "Space",
    blurb: "Disk usage maps with quick drill down and folder insights.",
  },
];

const outlineStyle = (withShadow = true): React.CSSProperties => ({
  border: `2px solid ${theme.colors.border}`,
  borderRadius: theme.radius,
  boxShadow: withShadow ? theme.shadows.md : undefined,
});

const navButtonStyle: React.CSSProperties = {
  ...outlineStyle(false),
  background: theme.colors.surfaceAlt,
  padding: "8px 16px",
  fontFamily: theme.fontStack,
  fontWeight: 600,
  cursor: "pointer",
  transition: "transform 120ms ease",
};

const chromeButtonStyle = (variant: "default" | "close" = "default"): React.CSSProperties => ({
  border: `2px solid ${theme.colors.border}`,
  borderRadius: theme.radius,
  background: variant === "close" ? theme.colors.accent : theme.colors.surfaceAlt,
  color: variant === "close" ? theme.colors.surface : theme.colors.text,
  padding: "4px 12px",
  fontFamily: theme.fontStack,
  fontWeight: 700,
  cursor: "pointer",
  transition: "transform 120ms ease",
});

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

function FloatingScanProgress({ onClick }: { onClick?: () => void }) {
  const { scanState } = useScan();

  if (!scanState.isScanning) {
    return null;
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1000,
        border: `3px solid ${theme.colors.border}`,
        borderRadius: theme.radius,
        background: theme.colors.surface,
        boxShadow: theme.shadows.lg,
        padding: "12px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minWidth: 280,
        cursor: onClick ? "pointer" : "default",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = "translate(-2px, -2px)";
          e.currentTarget.style.boxShadow = theme.shadows.xl ?? theme.shadows.lg;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "none";
        e.currentTarget.style.boxShadow = theme.shadows.lg;
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Space Scan</div>
        <div style={{ fontSize: 12, color: theme.colors.textMuted }}>
          {scanState.progress.toFixed(0)}%
        </div>
      </div>

      <div
        style={{
          height: 8,
          border: `2px solid ${theme.colors.border}`,
          borderRadius: 4,
          background: theme.colors.surfaceAlt,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, scanState.progress)}%`,
            background: theme.colors.accent,
            transition: "width 200ms ease-out",
          }}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.colors.textMuted }}>
        <span>{numberFormatter.format(scanState.scannedEntries)} entries</span>
        <span>{formatBytes(scanState.scannedBytes)}</span>
      </div>

      {scanState.path && (
        <div
          style={{
            fontSize: 11,
            color: theme.colors.textMuted,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {scanState.path}
        </div>
      )}
    </div>
  );
}

function DarkModeToggle() {
  const { settings, updateAppearance } = useSettings();
  const isDarkMode = settings.appearance.theme === 'dark' ||
    (settings.appearance.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <button
      onClick={() => updateAppearance({ theme: isDarkMode ? 'light' : 'dark' })}
      title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
      style={{
        position: "fixed",
        bottom: 24,
        left: 24,
        zIndex: 999,
        width: 48,
        height: 48,
        borderRadius: "50%",
        border: `3px solid ${theme.colors.border}`,
        background: isDarkMode ? theme.colors.surface : theme.colors.surfaceAlt,
        boxShadow: theme.shadows.lg,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: isDarkMode ? "#F5D547" : theme.colors.text,
        transition: "transform 150ms ease, box-shadow 150ms ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.boxShadow = theme.shadows.xl ?? theme.shadows.lg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = theme.shadows.lg;
      }}
    >
      {isDarkMode ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
          <path d="M120,40V16a8,8,0,0,1,16,0V40a8,8,0,0,1-16,0Zm72,88a64,64,0,1,1-64-64A64.07,64.07,0,0,1,192,128Zm-16,0a48,48,0,1,0-48,48A48.05,48.05,0,0,0,176,128ZM58.34,69.66A8,8,0,0,0,69.66,58.34l-16-16A8,8,0,0,0,42.34,53.66Zm0,116.68-16,16a8,8,0,0,0,11.32,11.32l16-16a8,8,0,0,0-11.32-11.32ZM192,72a8,8,0,0,0,5.66-2.34l16-16a8,8,0,0,0-11.32-11.32l-16,16A8,8,0,0,0,192,72Zm5.66,114.34a8,8,0,0,0-11.32,11.32l16,16a8,8,0,0,0,11.32-11.32ZM48,128a8,8,0,0,0-8-8H16a8,8,0,0,0,0,16H40A8,8,0,0,0,48,128Zm80,80a8,8,0,0,0-8,8v24a8,8,0,0,0,16,0V216A8,8,0,0,0,128,208Zm112-88H216a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16Z"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 256 256">
          <path d="M233.54,142.23a8,8,0,0,0-8-2,88.08,88.08,0,0,1-109.8-109.8,8,8,0,0,0-10-10,104.84,104.84,0,0,0-52.91,37A104,104,0,0,0,136,224a103.09,103.09,0,0,0,62.52-20.88,104.84,104.84,0,0,0,37-52.91A8,8,0,0,0,233.54,142.23ZM188.9,190.34A88,88,0,0,1,65.66,67.11a89,89,0,0,1,31.4-26A106,106,0,0,0,96,56,104.11,104.11,0,0,0,200,160a106,106,0,0,0,14.92-1.06A89,89,0,0,1,188.9,190.34Z"/>
        </svg>
      )}
    </button>
  );
}

export function Setup() {
  const { settings } = useSettings();
  const [active, setActive] = useState<AppKey>("launcher");
  const [isMaximized, setIsMaximized] = useState(false);
  const [mountedApps, setMountedApps] = useState<Partial<Record<AppKey, boolean>>>({});

  const isDarkMode = settings.appearance.theme === 'dark' ||
    (settings.appearance.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const previousBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = theme.colors.bg;
    document.body.style.color = theme.colors.text;
    document.body.style.fontFamily = theme.fontStack;
    return () => {
      document.body.style.backgroundColor = previousBackground;
    };
  }, []);

  // Apply dark mode class to body based on settings
  useEffect(() => {
    if (isDarkMode) {
      document.body.classList.add('dark-mode');
    } else {
      document.body.classList.remove('dark-mode');
    }
  }, [isDarkMode]);

  useEffect(() => {
    let mounted = true;

    appWindow.isMaximized().then((value) => {
      if (mounted) {
        setIsMaximized(value);
      }
    });

    const unlistenPromise = appWindow.onResized(() => {
      appWindow.isMaximized().then((value) => {
        if (mounted) {
          setIsMaximized(value);
        }
      });
    });

    return () => {
      mounted = false;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximizeToggle = () => {
    appWindow.isMaximized().then((maximized) => {
      if (maximized) {
        appWindow.unmaximize();
        setIsMaximized(false);
      } else {
        appWindow.maximize();
        setIsMaximized(true);
      }
    });
  };

  const handleClose = () => {
    appWindow.close();
  };

  const activeMeta = useMemo(() => apps.find((app) => app.key === active), [active]);

  useEffect(() => {
    if (active === "launcher") {
      return;
    }
    setMountedApps((prev) => {
      if (prev[active]) {
        return prev;
      }
      return { ...prev, [active]: true };
    });
  }, [active]);

  const renderAppBody = (key: Exclude<AppKey, "launcher">) => {
    switch (key) {
      case "specs":
        return <Specs />;
      case "unbox":
        return <Unbox />;
      case "space":
        return <Space />;
      default:
        return null;
    }
  };

  const renderLauncher = () => (
    <div
      style={{
        minHeight: "100%",
        background: theme.colors.bg,
        padding: "48px 24px",
        color: theme.colors.text,
      }}
    >
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "flex", flexDirection: "column", gap: 48 }}>
        <header style={{ borderBottom: `4px solid ${theme.colors.border}`, paddingBottom: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 24 }}>
            <div>
              <h1 style={{ fontFamily: theme.fontStack, fontSize: 64, fontWeight: 900, margin: 0 }}>SETUP<span style={{ color: theme.colors.accent }}>.</span></h1>
              <p style={{ fontFamily: theme.fontStack, fontSize: 16, fontWeight: 600, color: theme.colors.textMuted, marginTop: 8 }}>
                POST-INSTALL UTILITY SUITE | NEOBRUTAL EDITION
              </p>
            </div>
            <div style={{ display: "flex", gap: 24, fontFamily: theme.fontStack, fontSize: 12, color: theme.colors.textMuted }}>
              <div>
                <div style={{ fontWeight: 700 }}>BUILD</div>
                <div>v1.0.0-alpha</div>
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>STATUS</div>
                <div>All modules idle</div>
              </div>
            </div>
          </div>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 32,
          }}
        >
          {apps.map((app) => (
            <button
              key={app.key}
              onClick={() => setActive(app.key)}
              style={{
                ...outlineStyle(true),
                background: theme.colors.surface,
                padding: 24,
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 18,
                transition: "transform 120ms ease, box-shadow 120ms ease",
              }}
              onMouseEnter={(event) => {
                const element = event.currentTarget;
                element.style.transform = "translate(-4px, -4px)";
                element.style.boxShadow = theme.shadows.lg;
              }}
              onMouseLeave={(event) => {
                const element = event.currentTarget;
                element.style.transform = "none";
                element.style.boxShadow = theme.shadows.md ?? "none";
              }}
            >
              <div
                style={{
                  ...outlineStyle(false),
                  background: theme.colors.accentSoft,
                  width: 64,
                  height: 64,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}
              >
                {app.icon}
              </div>
              <div>
                <h2 style={{ fontFamily: theme.fontStack, fontSize: 28, fontWeight: 800, margin: 0 }}>{app.title}</h2>
                <p style={{ fontFamily: theme.fontStack, fontSize: 14, color: theme.colors.textMuted, marginTop: 12 }}>{app.blurb}</p>
              </div>
              <span style={{ fontFamily: theme.fontStack, fontSize: 12, color: theme.colors.textMuted }}>Launch -&gt;</span>
            </button>
          ))}
        </section>

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: theme.fontStack,
            fontSize: 12,
            color: theme.colors.textMuted,
            borderTop: `2px solid ${theme.colors.border}`,
            paddingTop: 16,
          }}
        >
          <span>2024 Setup Suite. Warm utilities for fresh machines.</span>
          <span>Press F1 for palette & theme options</span>
        </footer>
      </div>
    </div>
  );

  const renderActive = () => {
    const isUnbox = active === "unbox";
    const appFrameStyle: React.CSSProperties = isUnbox
      ? {
          border: `2px solid ${theme.colors.border}`,
          borderRadius: theme.radius,
          background: theme.colors.surface,
          boxShadow: theme.shadows.lg,
          minHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }
      : {
          ...outlineStyle(true),
          background: theme.colors.surface,
          minHeight: "70vh",
          padding: 16,
        };

    return (
      <div style={{ padding: "32px 16px 48px", background: theme.colors.bg, minHeight: "100%" }}>
        <div
          style={{
            maxWidth: 1280,
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 16,
            }}
          >
            <div>
              <div style={{ fontFamily: theme.fontStack, fontSize: 32, fontWeight: 800 }}>{activeMeta?.title ?? ""}</div>
              <div style={{ fontFamily: theme.fontStack, fontSize: 14, color: theme.colors.textMuted, marginTop: 6 }}>{activeMeta?.blurb ?? ""}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {apps.map((app) => (
                <button
                  key={app.key}
                  onClick={() => setActive(app.key)}
                  style={{
                    ...navButtonStyle,
                    background: active === app.key ? theme.colors.accentSoft : theme.colors.surfaceAlt,
                    boxShadow: active === app.key ? theme.shadows.sm : undefined,
                    transform: active === app.key ? "translate(-2px, -2px)" : undefined,
                  }}
                >
                  {app.title}
                </button>
              ))}
              <button
                onClick={() => setActive("launcher")}
                style={{
                  ...navButtonStyle,
                  background: theme.colors.surface,
                }}
              >
                Back to Launcher
              </button>
            </div>
          </div>

          <div style={appFrameStyle}>
            {(["specs", "unbox", "space"] as Array<Exclude<AppKey, "launcher">>).map((key) => {
              const shouldRender = mountedApps[key] || active === key;
              if (!shouldRender) {
                return null;
              }
              // Keep components mounted even when viewing launcher
              const isVisible = active === key;
              const body = renderAppBody(key);
              const wrapperStyle: React.CSSProperties =
                key === "unbox"
                  ? {
                      flex: 1,
                      display: isVisible ? "flex" : "none",
                      minHeight: 0,
                    }
                  : {
                      display: isVisible ? "block" : "none",
                    };
              return (
                <div key={key} style={wrapperStyle}>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const fallback = (
    <div style={{ padding: 32 }}>
      <div
        style={{
          ...outlineStyle(true),
          background: theme.colors.surface,
          padding: 24,
          fontFamily: theme.fontStack,
          fontWeight: 600,
          color: theme.colors.text,
        }}
      >
        Bootstrapping suite...
      </div>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: theme.colors.bg,
        color: theme.colors.text,
      }}
    >
      <header
        style={{
          borderBottom: `2px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          padding: "8px 16px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          userSelect: "none",
          WebkitAppRegion: "drag",
        } as React.CSSProperties}
        onDoubleClick={handleMaximizeToggle}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: theme.fontStack, fontSize: 20, fontWeight: 800 }}>Setup Suite</div>
          <div style={{ fontFamily: theme.fontStack, fontSize: 12, color: theme.colors.textMuted }}>
            {active === "launcher" ? "Specs | Unbox | Space" : `Active | ${activeMeta?.title ?? ""}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, WebkitAppRegion: "no-drag" } as React.CSSProperties}>
          <button onClick={handleMinimize} style={chromeButtonStyle()}>-</button>
          <button onClick={handleMaximizeToggle} style={chromeButtonStyle()}>{isMaximized ? "[]" : "[ ]"}</button>
          <button onClick={handleClose} style={chromeButtonStyle("close")}>X</button>
        </div>
      </header>

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          background: theme.colors.bg,
        }}
      >
        <Suspense fallback={fallback}>
          <div style={{ display: active === "launcher" ? "block" : "none" }}>
            {renderLauncher()}
          </div>
          <div style={{ display: active === "launcher" ? "none" : "block" }}>
            {renderActive()}
          </div>
        </Suspense>
      </main>

      {/* Floating scan progress - shown when not viewing Space */}
      {active !== "space" && <FloatingScanProgress onClick={() => setActive("space")} />}

      {/* Global dark mode toggle */}
      <DarkModeToggle />
    </div>
  );
}

export default Setup;
