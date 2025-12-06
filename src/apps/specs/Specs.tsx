import React, { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { theme } from "../../setup/theme";

type CpuInfo = {
  name: string;
  usage: number;
  clock_mhz: number;
  logical_cores: number;
  physical_cores: number;
  per_core_usage: number[];
};

type GpuInfo = {
  name: string;
  vendor?: string | null;
  driver_version?: string | null;
  memory_total?: number | null;
  memory_used?: number | null;
  utilization?: number | null;
  temperature?: number | null;
};

type MemoryInfo = {
  total: number;
  used: number;
  swap_total: number;
  swap_used: number;
};

type DiskInfo = {
  mount: string;
  name: string;
  file_system: string;
  total: number;
  used: number;
};

type TempsInfo = {
  cpu?: number | null;
  gpu?: number | null;
  warning?: string | null;
};

type ProcessInfo = {
  pid: number;
  name: string;
  cpu_usage: number;
  memory_kb: number;
};

type NetworkInfo = {
  interface_name: string;
  received_bytes: number;
  transmitted_bytes: number;
};

type SpecsSnapshot = {
  cpu: CpuInfo;
  gpus: GpuInfo[];
  memory: MemoryInfo;
  disks: DiskInfo[];
  temps: TempsInfo;
  top_processes?: ProcessInfo[];
  network?: NetworkInfo[];
  uptime_seconds?: number;
  boot_time?: number;
};

const formatKibToGb = (kib: number) => (kib / (1024 * 1024)).toFixed(1);
const formatBytesToGb = (bytes: number) => (bytes / 1024 ** 3).toFixed(1);
const formatBytesToMb = (bytes: number) => (bytes / 1024 ** 2).toFixed(1);
const formatTemp = (value?: number | null) =>
  value === undefined || value === null ? "--" : `${value.toFixed(0)}C`;
const formatPercent = (value?: number | null) =>
  value === undefined || value === null ? "--" : `${value.toFixed(1)}%`;

const formatUptime = (seconds?: number) => {
  if (!seconds) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
};

const formatNetworkSpeed = (bytesPerSec: number) => {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${bytesPerSec.toFixed(0)} B/s`;
};

// Animated progress bar with gradient and pulse effect
const AnimatedProgress: React.FC<{ value: number | null; height?: number; animated?: boolean }> = ({
  value,
  height = 12,
  animated = true
}) => {
  if (value === null || Number.isNaN(value)) {
    return null;
  }

  const clamped = Math.min(100, Math.max(0, value));
  const color = clamped > 80 ? '#D97A2B' : clamped > 60 ? '#E8B45F' : '#6C9F7F';

  return (
    <div
      style={{
        width: "100%",
        height,
        borderRadius: 999,
        border: `2px solid ${theme.colors.border}`,
        background: theme.colors.surfaceAlt,
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          width: `${clamped}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${color}, ${color}dd)`,
          transition: animated ? "width 400ms cubic-bezier(0.4, 0, 0.2, 1)" : "none",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {animated && clamped > 5 && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)",
              animation: "shimmer 2s infinite",
            }}
          />
        )}
      </div>
    </div>
  );
};

const Specs = () => {
  const [snapshot, setSnapshot] = useState<SpecsSnapshot | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [coreActivityExpanded, setCoreActivityExpanded] = useState(false);
  const [processesExpanded, setProcessesExpanded] = useState(true);
  const [networkExpanded, setNetworkExpanded] = useState(true);
  const [prevNetwork, setPrevNetwork] = useState<NetworkInfo[] | null>(null);
  const [networkSpeeds, setNetworkSpeeds] = useState<Record<string, { rx: number; tx: number }>>({});

  useEffect(() => {
    // Add keyframe animation for shimmer effect
    const style = document.createElement("style");
    style.textContent = `
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      @keyframes slideIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastFetchTime = Date.now();

    const fetchSnapshot = async () => {
      try {
        const result = await invoke<SpecsSnapshot>("specs_snapshot");
        if (!cancelled) {
          // Calculate network speeds
          const now = Date.now();
          const elapsed = (now - lastFetchTime) / 1000;
          lastFetchTime = now;

          if (prevNetwork && result.network && elapsed > 0) {
            const speeds: Record<string, { rx: number; tx: number }> = {};
            for (const net of result.network) {
              const prev = prevNetwork.find(p => p.interface_name === net.interface_name);
              if (prev) {
                speeds[net.interface_name] = {
                  rx: Math.max(0, (net.received_bytes - prev.received_bytes) / elapsed),
                  tx: Math.max(0, (net.transmitted_bytes - prev.transmitted_bytes) / elapsed),
                };
              }
            }
            setNetworkSpeeds(speeds);
          }
          setPrevNetwork(result.network ?? null);

          setSnapshot(result);
          setLastUpdated(new Date());
        }
      } catch (error) {
        console.error("specs_snapshot", error);
      }
    };

    fetchSnapshot();
    const intervalId = window.setInterval(fetchSnapshot, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [prevNetwork]);

  const cpuUsage = useMemo(() => {
    if (!snapshot) return null;
    return Math.min(100, Math.max(0, snapshot.cpu.usage));
  }, [snapshot]);

  const memoryUsage = useMemo(() => {
    if (!snapshot || !snapshot.memory.total) return null;
    return Math.min(100, Math.max(0, (snapshot.memory.used / snapshot.memory.total) * 100));
  }, [snapshot]);

  const swapUsage = useMemo(() => {
    if (!snapshot || !snapshot.memory.swap_total) return null;
    return Math.min(100, Math.max(0, (snapshot.memory.swap_used / snapshot.memory.swap_total) * 100));
  }, [snapshot]);

  const primaryGpu = snapshot?.gpus[0] ?? null;
  const tempWarning = snapshot?.temps.warning ?? null;
  const perCoreUsage = snapshot?.cpu.per_core_usage ?? [];
  const hasPerCoreUsage = perCoreUsage.length > 0;
  const topProcesses = snapshot?.top_processes ?? [];
  const networkInterfaces = snapshot?.network ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: "0 4px" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: `3px solid ${theme.colors.border}`,
        paddingBottom: 12,
      }}>
        <div style={{ fontFamily: theme.fontStack, fontWeight: 900, fontSize: 28 }}>
          SYSTEM TELEMETRY
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {snapshot?.uptime_seconds && (
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 12,
              color: theme.colors.textMuted,
              border: `2px solid ${theme.colors.border}`,
              borderRadius: 6,
              padding: "4px 10px",
              background: theme.colors.surfaceAlt,
            }}>
              UPTIME: <span style={{ fontWeight: 800 }}>{formatUptime(snapshot.uptime_seconds)}</span>
            </div>
          )}
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 13,
            color: theme.colors.textMuted,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: lastUpdated ? "#6C9F7F" : theme.colors.textMuted,
              animation: lastUpdated ? "blink 2s ease-in-out infinite" : "none",
            }} />
            {lastUpdated ? lastUpdated.toLocaleTimeString() : "INITIALIZING"}
          </div>
        </div>
      </div>

      {/* Big Stats Cards */}
      <div style={{
        display: "grid",
        gridTemplateColumns: primaryGpu?.utilization ? "repeat(auto-fit, minmax(200px, 1fr))" : "1fr 1fr 1fr",
        gap: 16,
      }}>
        {/* CPU */}
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: "20px 24px",
          boxShadow: theme.shadows.lg,
          animation: "slideIn 0.3s ease-out",
        }}>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 12,
            color: theme.colors.textMuted,
            letterSpacing: 2,
            fontWeight: 800,
            marginBottom: 8
          }}>
            CPU LOAD
          </div>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 48,
            fontWeight: 900,
            color: theme.colors.text,
            lineHeight: 1,
            marginBottom: 12
          }}>
            {formatPercent(cpuUsage)}
          </div>
          <AnimatedProgress value={cpuUsage} height={16} />
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 13,
            color: theme.colors.textMuted,
            marginTop: 12,
            fontWeight: 600
          }}>
            {snapshot?.cpu.name || "Detecting..."}
          </div>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 12,
            color: theme.colors.textMuted,
            marginTop: 4
          }}>
            {snapshot ? `${snapshot.cpu.physical_cores}C/${snapshot.cpu.logical_cores}T @ ${snapshot.cpu.clock_mhz}MHz` : "--"}
          </div>
        </div>

        {/* GPU (if available) */}
        {primaryGpu?.utilization !== undefined && primaryGpu.utilization !== null && (
          <div style={{
            border: `3px solid ${theme.colors.border}`,
            background: theme.colors.surface,
            borderRadius: theme.radius,
            padding: "20px 24px",
            boxShadow: theme.shadows.lg,
            animation: "slideIn 0.4s ease-out",
          }}>
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 12,
              color: theme.colors.textMuted,
              letterSpacing: 2,
              fontWeight: 800,
              marginBottom: 8
            }}>
              GPU LOAD
            </div>
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 48,
              fontWeight: 900,
              color: theme.colors.text,
              lineHeight: 1,
              marginBottom: 12
            }}>
              {formatPercent(primaryGpu.utilization)}
            </div>
            <AnimatedProgress value={primaryGpu.utilization} height={16} />
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 13,
              color: theme.colors.textMuted,
              marginTop: 12,
              fontWeight: 600
            }}>
              {primaryGpu.name}
            </div>
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 12,
              color: theme.colors.textMuted,
              marginTop: 4
            }}>
              {primaryGpu.memory_total ? `${formatBytesToGb(primaryGpu.memory_total)}GB VRAM` : "VRAM N/A"}
            </div>
          </div>
        )}

        {/* Memory */}
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: "20px 24px",
          boxShadow: theme.shadows.lg,
          animation: "slideIn 0.5s ease-out",
        }}>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 12,
            color: theme.colors.textMuted,
            letterSpacing: 2,
            fontWeight: 800,
            marginBottom: 8
          }}>
            MEMORY
          </div>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 48,
            fontWeight: 900,
            color: theme.colors.text,
            lineHeight: 1,
            marginBottom: 12
          }}>
            {formatPercent(memoryUsage)}
          </div>
          <AnimatedProgress value={memoryUsage} height={16} />
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 13,
            color: theme.colors.textMuted,
            marginTop: 12,
            fontWeight: 600
          }}>
            {snapshot ? `${formatKibToGb(snapshot.memory.used)} / ${formatKibToGb(snapshot.memory.total)} GB` : "-- / -- GB"}
          </div>
          {swapUsage !== null && snapshot && snapshot.memory.swap_total > 0 && (
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 12,
              color: theme.colors.textMuted,
              marginTop: 4
            }}>
              Swap: {formatKibToGb(snapshot.memory.swap_used)}/{formatKibToGb(snapshot.memory.swap_total)}GB
            </div>
          )}
        </div>

        {/* CPU Temperature */}
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: "20px 24px",
          boxShadow: theme.shadows.lg,
          animation: "slideIn 0.6s ease-out",
        }}>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 12,
            color: theme.colors.textMuted,
            letterSpacing: 2,
            fontWeight: 800,
            marginBottom: 8
          }}>
            CPU TEMP
          </div>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 48,
            fontWeight: 900,
            color: snapshot?.temps.cpu && snapshot.temps.cpu > 80 ? '#D97A2B' : theme.colors.text,
            lineHeight: 1,
            marginBottom: 12
          }}>
            {formatTemp(snapshot?.temps.cpu)}
          </div>
          <AnimatedProgress value={snapshot?.temps.cpu ? Math.min(100, snapshot.temps.cpu) : null} height={16} />
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 13,
            color: theme.colors.textMuted,
            marginTop: 12,
            fontWeight: 600
          }}>
            CPU Package Temperature
          </div>
          {snapshot?.temps.cpu === null && (
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 11,
              color: theme.colors.accent,
              marginTop: 4
            }}>
              Run as Admin for temps
            </div>
          )}
        </div>
      </div>

      {/* Warning */}
      {tempWarning && (
        <div style={{
          border: `2px dashed ${theme.colors.accent}`,
          borderRadius: theme.radius,
          padding: 16,
          background: theme.colors.surfaceAlt,
          fontFamily: theme.fontStack,
          fontSize: 13,
          color: theme.colors.text,
          animation: "slideIn 0.3s ease-out",
        }}>
          <strong style={{ fontWeight: 800 }}>Warning:</strong> {tempWarning}
        </div>
      )}

      {/* Top Processes - Task Manager Style */}
      {topProcesses.length > 0 && (
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: 24,
          boxShadow: theme.shadows.md,
        }}>
          <button
            onClick={() => setProcessesExpanded(!processesExpanded)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginBottom: processesExpanded ? 16 : 0,
            }}
          >
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 14,
              color: theme.colors.textMuted,
              letterSpacing: 1.5,
              fontWeight: 800,
            }}>
              TOP PROCESSES ({topProcesses.length})
            </div>
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 20,
              color: theme.colors.text,
              fontWeight: 900,
              transform: processesExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}>
              {processesExpanded ? "^" : "v"}
            </div>
          </button>
          {processesExpanded && (
            <div style={{ overflowX: "auto" }}>
              <table style={{
                width: "100%",
                borderCollapse: "collapse",
                fontFamily: theme.fontStack,
              }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${theme.colors.border}` }}>
                    <th style={{
                      textAlign: "left",
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 800,
                      color: theme.colors.textMuted,
                      letterSpacing: 1,
                    }}>PROCESS</th>
                    <th style={{
                      textAlign: "right",
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 800,
                      color: theme.colors.textMuted,
                      letterSpacing: 1,
                    }}>PID</th>
                    <th style={{
                      textAlign: "right",
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 800,
                      color: theme.colors.textMuted,
                      letterSpacing: 1,
                    }}>CPU</th>
                    <th style={{
                      textAlign: "right",
                      padding: "8px 12px",
                      fontSize: 11,
                      fontWeight: 800,
                      color: theme.colors.textMuted,
                      letterSpacing: 1,
                    }}>MEMORY</th>
                  </tr>
                </thead>
                <tbody>
                  {topProcesses.map((proc, index) => (
                    <tr
                      key={`${proc.pid}-${index}`}
                      style={{
                        borderBottom: `1px solid ${theme.colors.border}`,
                        background: index % 2 === 0 ? "transparent" : theme.colors.surfaceAlt,
                      }}
                    >
                      <td style={{
                        padding: "10px 12px",
                        fontSize: 13,
                        fontWeight: 600,
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}>{proc.name}</td>
                      <td style={{
                        padding: "10px 12px",
                        fontSize: 12,
                        textAlign: "right",
                        color: theme.colors.textMuted,
                        fontFamily: "monospace",
                      }}>{proc.pid}</td>
                      <td style={{
                        padding: "10px 12px",
                        fontSize: 13,
                        textAlign: "right",
                        fontWeight: 700,
                        color: proc.cpu_usage > 50 ? '#D97A2B' : theme.colors.text,
                      }}>{proc.cpu_usage.toFixed(1)}%</td>
                      <td style={{
                        padding: "10px 12px",
                        fontSize: 13,
                        textAlign: "right",
                        fontWeight: 600,
                      }}>{formatBytesToMb(proc.memory_kb * 1024)} MB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Network Activity */}
      {networkInterfaces.length > 0 && (
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: 24,
          boxShadow: theme.shadows.md,
        }}>
          <button
            onClick={() => setNetworkExpanded(!networkExpanded)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginBottom: networkExpanded ? 16 : 0,
            }}
          >
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 14,
              color: theme.colors.textMuted,
              letterSpacing: 1.5,
              fontWeight: 800,
            }}>
              NETWORK ACTIVITY
            </div>
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 20,
              color: theme.colors.text,
              fontWeight: 900,
              transform: networkExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}>
              {networkExpanded ? "^" : "v"}
            </div>
          </button>
          {networkExpanded && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 12,
            }}>
              {networkInterfaces.map((net, index) => {
                const speeds = networkSpeeds[net.interface_name];
                return (
                  <div key={net.interface_name} style={{
                    border: `2px solid ${theme.colors.border}`,
                    borderRadius: 8,
                    padding: "14px 16px",
                    background: theme.colors.surfaceAlt,
                    animation: `slideIn ${0.3 + index * 0.05}s ease-out`,
                  }}>
                    <div style={{
                      fontFamily: theme.fontStack,
                      fontSize: 14,
                      fontWeight: 800,
                      color: theme.colors.text,
                      marginBottom: 12,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {net.interface_name}
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: theme.fontStack,
                          fontSize: 10,
                          color: theme.colors.textMuted,
                          marginBottom: 4,
                          fontWeight: 700,
                        }}>
                          DOWNLOAD
                        </div>
                        <div style={{
                          fontFamily: theme.fontStack,
                          fontSize: 16,
                          fontWeight: 900,
                          color: '#6C9F7F',
                        }}>
                          {speeds ? formatNetworkSpeed(speeds.rx) : "--"}
                        </div>
                        <div style={{
                          fontFamily: theme.fontStack,
                          fontSize: 11,
                          color: theme.colors.textMuted,
                          marginTop: 2,
                        }}>
                          Total: {formatBytesToGb(net.received_bytes)} GB
                        </div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: theme.fontStack,
                          fontSize: 10,
                          color: theme.colors.textMuted,
                          marginBottom: 4,
                          fontWeight: 700,
                        }}>
                          UPLOAD
                        </div>
                        <div style={{
                          fontFamily: theme.fontStack,
                          fontSize: 16,
                          fontWeight: 900,
                          color: '#D97A2B',
                        }}>
                          {speeds ? formatNetworkSpeed(speeds.tx) : "--"}
                        </div>
                        <div style={{
                          fontFamily: theme.fontStack,
                          fontSize: 11,
                          color: theme.colors.textMuted,
                          marginTop: 2,
                        }}>
                          Total: {formatBytesToGb(net.transmitted_bytes)} GB
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Per-Core Activity - Collapsible */}
      {snapshot && hasPerCoreUsage && (
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: 24,
          boxShadow: theme.shadows.md,
        }}>
          <button
            onClick={() => setCoreActivityExpanded(!coreActivityExpanded)}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginBottom: coreActivityExpanded ? 16 : 0,
            }}
          >
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 14,
              color: theme.colors.textMuted,
              letterSpacing: 1.5,
              fontWeight: 800,
            }}>
              PER-CORE ACTIVITY ({perCoreUsage.length} CORES)
            </div>
            <div style={{
              fontFamily: theme.fontStack,
              fontSize: 20,
              color: theme.colors.text,
              fontWeight: 900,
              transform: coreActivityExpanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}>
              {coreActivityExpanded ? "^" : "v"}
            </div>
          </button>
          {coreActivityExpanded && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 12,
            }}>
              {perCoreUsage.map((value, index) => (
                <div key={`core-${index}`} style={{
                  border: `2px solid ${theme.colors.border}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  background: theme.colors.surfaceAlt,
                  animation: `slideIn ${0.3 + index * 0.05}s ease-out`,
                }}>
                  <div style={{
                    fontFamily: theme.fontStack,
                    fontSize: 11,
                    color: theme.colors.textMuted,
                    marginBottom: 6,
                    fontWeight: 700
                  }}>
                    CORE {index}
                  </div>
                  <div style={{
                    fontFamily: theme.fontStack,
                    fontSize: 24,
                    fontWeight: 900,
                    color: theme.colors.text,
                    marginBottom: 8
                  }}>
                    {formatPercent(value)}
                  </div>
                  <AnimatedProgress value={value} height={8} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* GPUs Detail */}
      {snapshot && snapshot.gpus.length > 0 && (
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: 24,
          boxShadow: theme.shadows.md,
        }}>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 14,
            color: theme.colors.textMuted,
            letterSpacing: 1.5,
            fontWeight: 800,
            marginBottom: 16
          }}>
            GRAPHICS ADAPTERS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {snapshot.gpus.map((gpu, index) => {
              const vramUsage =
                gpu.memory_total && gpu.memory_used
                  ? Math.min(100, Math.max(0, (gpu.memory_used / gpu.memory_total) * 100))
                  : null;
              const gpuLoad =
                gpu.utilization !== undefined && gpu.utilization !== null
                  ? Math.min(100, Math.max(0, gpu.utilization))
                  : null;

              return (
                <div key={`${gpu.name}-${index}`} style={{
                  border: `2px solid ${theme.colors.border}`,
                  borderRadius: 8,
                  padding: "16px 20px",
                  background: theme.colors.surfaceAlt,
                  animation: `slideIn ${0.3 + index * 0.1}s ease-out`,
                }}>
                  <div style={{
                    fontFamily: theme.fontStack,
                    fontSize: 18,
                    fontWeight: 800,
                    color: theme.colors.text,
                    marginBottom: 12
                  }}>
                    {gpu.name}
                  </div>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 12,
                    marginBottom: 16
                  }}>
                    <div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 11, color: theme.colors.textMuted, marginBottom: 4 }}>
                        VENDOR
                      </div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 14, fontWeight: 700 }}>
                        {gpu.vendor || "Unknown"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 11, color: theme.colors.textMuted, marginBottom: 4 }}>
                        DRIVER
                      </div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 14, fontWeight: 700 }}>
                        {gpu.driver_version || "N/A"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 11, color: theme.colors.textMuted, marginBottom: 4 }}>
                        VRAM
                      </div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 14, fontWeight: 700 }}>
                        {gpu.memory_total ? `${formatBytesToGb(gpu.memory_total)} GB` : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 11, color: theme.colors.textMuted, marginBottom: 4 }}>
                        TEMPERATURE
                      </div>
                      <div style={{
                        fontFamily: theme.fontStack,
                        fontSize: 14,
                        fontWeight: 700,
                        color: gpu.temperature && gpu.temperature > 80 ? '#D97A2B' : theme.colors.text,
                      }}>
                        {formatTemp(gpu.temperature)}
                      </div>
                    </div>
                  </div>
                  {gpuLoad !== null && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 11, color: theme.colors.textMuted, marginBottom: 6 }}>
                        CORE UTILIZATION
                      </div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 20, fontWeight: 900, marginBottom: 8 }}>
                        {formatPercent(gpuLoad)}
                      </div>
                      <AnimatedProgress value={gpuLoad} height={12} />
                    </div>
                  )}
                  {vramUsage !== null && (
                    <div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 11, color: theme.colors.textMuted, marginBottom: 6 }}>
                        MEMORY UTILIZATION
                      </div>
                      <div style={{ fontFamily: theme.fontStack, fontSize: 20, fontWeight: 900, marginBottom: 8 }}>
                        {formatPercent(vramUsage)}
                      </div>
                      <AnimatedProgress value={vramUsage} height={12} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Storage */}
      {snapshot && snapshot.disks.length > 0 && (
        <div style={{
          border: `3px solid ${theme.colors.border}`,
          background: theme.colors.surface,
          borderRadius: theme.radius,
          padding: 24,
          boxShadow: theme.shadows.md,
        }}>
          <div style={{
            fontFamily: theme.fontStack,
            fontSize: 14,
            color: theme.colors.textMuted,
            letterSpacing: 1.5,
            fontWeight: 800,
            marginBottom: 16
          }}>
            STORAGE VOLUMES
          </div>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 12,
          }}>
            {snapshot.disks.map((disk, index) => {
              const usedPercent = disk.total ? Math.min(100, Math.max(0, (disk.used / disk.total) * 100)) : 0;
              // Clean up mount point - remove trailing backslash and any weird chars
              const cleanMount = disk.mount.replace(/\\$/, '').replace(/[^\x20-\x7E]/g, '');
              const cleanName = disk.name.replace(/[^\x20-\x7E]/g, '');
              return (
                <div key={`${disk.mount}-${index}`} style={{
                  border: `2px solid ${theme.colors.border}`,
                  borderRadius: 8,
                  padding: "14px 16px",
                  background: theme.colors.surfaceAlt,
                  animation: `slideIn ${0.3 + index * 0.05}s ease-out`,
                }}>
                  <div style={{
                    fontFamily: theme.fontStack,
                    fontSize: 16,
                    fontWeight: 800,
                    color: theme.colors.text,
                    marginBottom: 8
                  }}>
                    {cleanName || cleanMount}
                  </div>
                  <div style={{
                    fontFamily: theme.fontStack,
                    fontSize: 12,
                    color: theme.colors.textMuted,
                    marginBottom: 10
                  }}>
                    {cleanMount} | {disk.file_system}
                  </div>
                  <div style={{
                    fontFamily: theme.fontStack,
                    fontSize: 20,
                    fontWeight: 900,
                    marginBottom: 8
                  }}>
                    {formatBytesToGb(disk.used)} / {formatBytesToGb(disk.total)} GB
                  </div>
                  <AnimatedProgress value={usedPercent} height={10} />
                  <div style={{
                    fontFamily: theme.fontStack,
                    fontSize: 12,
                    color: theme.colors.textMuted,
                    marginTop: 6,
                    fontWeight: 700
                  }}>
                    {formatPercent(usedPercent)} USED
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Specs;
