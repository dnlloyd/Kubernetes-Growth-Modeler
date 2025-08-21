"use client";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Download, Upload } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

// ---------- Helpers ----------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const STORAGE_KEY = "k8s-cluster-growth-model-v1";

function clampNum(n, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number.isFinite(+n) ? +n : 0;
  return Math.min(Math.max(num, min), max);
}

// ---------- Retro palette (inspired by Atari vibes) ----------
const RETRO = {
  bg: "#0b0b12",
  panel: "#141423",
  border: "#2a2a40",
  text: "#E7E7FF",
  textDim: "#A7A7C7",
  accent: "#FF3E3E", // neon red
  accent2: "#FFB000", // amber/gold
  accent3: "#00E5FF", // electric cyan
  accent4: "#9C27FF", // purple
  accent5: "#33FF57", // retro green
};
const BAR_COLORS = [RETRO.accent, RETRO.accent2, RETRO.accent3, RETRO.accent4, RETRO.accent5];

export default function ClusterGrowthModeler() {
  const [clusters, setClusters] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return [
      {
        id: uid(),
        name: "alva-prod",
        maxCpuCores: 100,
        maxMemoryGiB: 500,
        workloads: [
          { id: uid(), name: "web-frontend", cpuCores: 2, memoryGiB: 4, replicas: 5 },
          { id: uid(), name: "api-backend", cpuCores: 3, memoryGiB: 6, replicas: 3 },
          { id: uid(), name: "postgres", cpuCores: 4, memoryGiB: 16, replicas: 1 },
        ],
      },
      {
        id: uid(),
        name: "rwcm-prod",
        maxCpuCores: 80,
        maxMemoryGiB: 300,
        workloads: [
          { id: uid(), name: "ingress-nginx", cpuCores: 1, memoryGiB: 1, replicas: 4 },
          { id: uid(), name: "metrics", cpuCores: 2, memoryGiB: 8, replicas: 2 },
        ],
      },
    ];
  });

  const [stackByWorkload, setStackByWorkload] = useState(true);
  const [unitCPU, setUnitCPU] = useState("cores"); // "cores" | "millicores"
  const [unitMem, setUnitMem] = useState("GiB"); // "GiB" | "MiB"

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clusters));
    } catch (_) {}
  }, [clusters]);

  // Totals
  const clusterTotals = useMemo(() => {
    return clusters.map((c) => {
      const cpu = c.workloads.reduce((acc, w) => acc + w.cpuCores * w.replicas, 0);
      const mem = c.workloads.reduce((acc, w) => acc + w.memoryGiB * w.replicas, 0);
      return { id: c.id, name: c.name, cpuCores: cpu, memoryGiB: mem };
    });
  }, [clusters]);

  const grandTotals = useMemo(() => {
    const cpu = clusterTotals.reduce((a, t) => a + t.cpuCores, 0);
    const mem = clusterTotals.reduce((a, t) => a + t.memoryGiB, 0);
    return { cpuCores: cpu, memoryGiB: mem };
  }, [clusterTotals]);

  // Units
  const fmtCPU = (cores) => (unitCPU === "millicores" ? `${Math.round(cores * 1000)} m` : `${Number(cores).toFixed(2)} cores`);
  const fmtMem = (gib) => (unitMem === "MiB" ? `${Math.round(gib * 1024)} MiB` : `${Number(gib).toFixed(2)} GiB`);
  const toUnitCPU = (cores) => (unitCPU === "millicores" ? cores * 1000 : cores);
  const toUnitMem = (gib) => (unitMem === "MiB" ? gib * 1024 : gib);

  // Charts data
  const chartDataCPU = useMemo(() => {
    if (stackByWorkload) {
      return clusters.map((c) => {
        const row = { cluster: c.name };
        c.workloads.forEach((w) => {
          row[w.name] = toUnitCPU(w.cpuCores * w.replicas);
        });
        // capacity for overlay if needed later
        row.__capacity = toUnitCPU(c.maxCpuCores || 0);
        return row;
      });
    }
    return clusterTotals.map((t) => ({ cluster: t.name, total: toUnitCPU(t.cpuCores), __capacity: toUnitCPU((clusters.find(c=>c.id===t.id)?.maxCpuCores)||0) }));
  }, [clusters, clusterTotals, stackByWorkload, unitCPU]);

  const chartDataMem = useMemo(() => {
    if (stackByWorkload) {
      return clusters.map((c) => {
        const row = { cluster: c.name };
        c.workloads.forEach((w) => {
          row[w.name] = toUnitMem(w.memoryGiB * w.replicas);
        });
        row.__capacity = toUnitMem(c.maxMemoryGiB || 0);
        return row;
      });
    }
    return clusterTotals.map((t) => ({ cluster: t.name, total: toUnitMem(t.memoryGiB), __capacity: toUnitMem((clusters.find(c=>c.id===t.id)?.maxMemoryGiB)||0) }));
  }, [clusters, clusterTotals, stackByWorkload, unitMem]);

  const workloadKeys = useMemo(() => {
    const setNames = new Set();
    clusters.forEach((c) => c.workloads.forEach((w) => setNames.add(w.name)));
    return [...setNames];
  }, [clusters]);

  // Mutators
  const addCluster = () => setClusters((prev) => [...prev, { id: uid(), name: `cluster-${prev.length + 1}`, maxCpuCores: 100, maxMemoryGiB: 100, workloads: [] }]);
  const removeCluster = (cid) => setClusters((prev) => prev.filter((c) => c.id !== cid));
  const updateClusterName = (cid, name) => setClusters((prev) => prev.map((c) => (c.id === cid ? { ...c, name } : c)));
  const updateClusterField = (cid, field, value) => setClusters((prev) => prev.map((c) => (c.id === cid ? { ...c, [field]: clampNum(value) } : c)));

  const addWorkload = (cid) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.id === cid
          ? {
              ...c,
              workloads: [
                ...c.workloads,
                { id: uid(), name: `workload-${c.workloads.length + 1}`, cpuCores: 1, memoryGiB: 1, replicas: 1 },
              ],
            }
          : c
      )
    );
  };
  const removeWorkload = (cid, wid) => setClusters((prev) => prev.map((c) => (c.id === cid ? { ...c, workloads: c.workloads.filter((w) => w.id !== wid) } : c)));
  const setWorkloadField = (cid, wid, field, value) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.id === cid
          ? {
              ...c,
              workloads: c.workloads.map((w) => (w.id === wid ? { ...w, [field]: field === "name" ? value : clampNum(value) } : w)),
            }
          : c
      )
    );
  };

  // DnD handler (intra + cross-cluster)
  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    setClusters((prev) => {
      const sourceIdx = prev.findIndex((c) => c.id === source.droppableId);
      const destIdx = prev.findIndex((c) => c.id === destination.droppableId);
      if (sourceIdx === -1 || destIdx === -1) return prev;

      const sourceCluster = prev[sourceIdx];
      const destCluster = prev[destIdx];

      const sourceItems = Array.from(sourceCluster.workloads);
      const [moved] = sourceItems.splice(source.index, 1);

      const destItems = sourceIdx === destIdx ? sourceItems : Array.from(destCluster.workloads);
      destItems.splice(destination.index, 0, moved);

      const next = [...prev];
      next[sourceIdx] = { ...sourceCluster, workloads: sourceIdx === destIdx ? destItems : sourceItems };
      if (sourceIdx !== destIdx) next[destIdx] = { ...destCluster, workloads: destItems };
      return next;
    });
  };

  // ---------- Theming helpers ----------
  const retroCard = "border-[1.5px] border-["+RETRO.border+"] bg-["+RETRO.panel+"] text-["+RETRO.text+"] shadow-[0_0_0_1px_rgba(255,255,255,0.02)]";
  const retroBadge = "rounded-full border px-3 py-1 text-xs";

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      {/* Retro font & CRT effects */}
      <link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet" />
      <style jsx global>{`
        body { background: ${RETRO.bg}; color: ${RETRO.text}; }
        .crt {
          position: relative;
          isolation: isolate;
        }
        .crt:before {
          content: "";
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(255,255,255,0.06) 0px,
            rgba(255,255,255,0.06) 1px,
            transparent 2px,
            transparent 3px
          );
          mix-blend-mode: overlay;
          pointer-events: none;
          opacity: .25;
        }
        .scan-edge { box-shadow: inset 0 0 80px rgba(0,0,0,0.6); }
        .pixel { font-family: 'VT323', monospace; letter-spacing: 0.5px; }
        .btn-retro {
          border: 1.5px solid ${RETRO.accent};
          background: linear-gradient(180deg, rgba(255,62,62,0.15), rgba(255,62,62,0.05));
          color: ${RETRO.text};
        }
        .btn-retro:hover { box-shadow: 0 0 0 2px ${RETRO.accent}33 inset; }
        .btn-outline-retro {
          border: 1.5px solid ${RETRO.accent3};
          color: ${RETRO.accent3};
          background: transparent;
        }
        .btn-outline-retro:hover { background: ${RETRO.accent3}11; }
        .input-retro {
          background: ${RETRO.bg};
          border: 1.5px solid ${RETRO.border};
          color: ${RETRO.text};
        }
        .input-retro:focus { outline: none; box-shadow: 0 0 0 2px ${RETRO.accent3}55; border-color: ${RETRO.accent3}; }
        .label-retro { color: ${RETRO.textDim}; }
        .badge-retro { border-color: ${RETRO.border}; background: ${RETRO.bg}; color: ${RETRO.textDim}; }
      `}</style>

      <div className="crt min-h-screen w-full p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="pixel text-3xl font-bold tracking-tight" style={{color: RETRO.accent2}}>Kubernetes Cluster Growth Modeler</h1>
              <p className="text-sm" style={{color: RETRO.textDim}}>Drag to reorder or move workloads across clusters. Totals update live.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="btn-retro" onClick={addCluster}><Plus className="mr-2 h-4 w-4" /> Add Cluster</Button>
              <Button className="btn-outline-retro" onClick={() => {
                const blob = new Blob([JSON.stringify(clusters, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "k8s-cluster-growth.json";
                a.click();
                URL.revokeObjectURL(url);
              }}><Download className="mr-2 h-4 w-4" /> Export JSON</Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm shadow-sm hover:opacity-90" style={{borderColor: RETRO.accent4, color: RETRO.text}}>
                <Upload className="h-4 w-4" /><span>Import JSON</span>
                <input type="file" accept="application/json" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  file.text().then((text) => {
                    try {
                      const data = JSON.parse(text);
                      if (!Array.isArray(data)) throw new Error("Invalid format");
                      setClusters(data);
                    } catch (err) {
                      alert(`Import failed: ${err.message}`);
                    }
                  });
                }} />
              </label>
            </div>
          </header>

          {/* Totals & Units */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <Stat title="Total CPU" value={fmtCPU(grandTotals.cpuCores)} subtitle="All clusters" />
            <Stat title="Total Memory" value={fmtMem(grandTotals.memoryGiB)} subtitle="All clusters" />
            <div className={`${retroCard} rounded-2xl p-4 scan-edge`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium" style={{color: RETRO.text}}>Units</div>
                  <div className="text-xs" style={{color: RETRO.textDim}}>View conversions only</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" className={unitCPU === "cores" ? "btn-retro" : "btn-outline-retro"} onClick={() => setUnitCPU("cores")}>cores</Button>
                  <Button size="sm" className={unitCPU === "millicores" ? "btn-retro" : "btn-outline-retro"} onClick={() => setUnitCPU("millicores")}>millicores</Button>
                  <div className="w-2" />
                  <Button size="sm" className={unitMem === "GiB" ? "btn-retro" : "btn-outline-retro"} onClick={() => setUnitMem("GiB")}>GiB</Button>
                  <Button size="sm" className={unitMem === "MiB" ? "btn-retro" : "btn-outline-retro"} onClick={() => setUnitMem("MiB")}>MiB</Button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Switch id="stack" checked={stackByWorkload} onCheckedChange={setStackByWorkload} />
                <Label htmlFor="stack" className="text-sm label-retro">Stack charts by workload groups</Label>
              </div>
            </div>
          </div>

          {/* Clusters */}
          <div className="grid gap-6 lg:grid-cols-2">
            {clusters.map((cluster) => (
              <motion.div key={cluster.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <Card className={`${retroCard} rounded-2xl scan-edge`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <div className="w-full max-w-md">
                      <Label htmlFor={`name-${cluster.id}`} className="text-xs label-retro">Cluster Name</Label>
                      <Input id={`name-${cluster.id}`} className="mt-1 input-retro" value={cluster.name} onChange={(e) => updateClusterName(cluster.id, e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`${retroBadge} badge-retro inline-flex items-center gap-2`}>
                        <span className="font-medium" style={{color: RETRO.accent3}}>CPU:</span>
                        <span>{fmtCPU((clusterTotals.find((t) => t.id === cluster.id)?.cpuCores) || 0)}</span>
                      </div>
                      <div className={`${retroBadge} badge-retro inline-flex items-center gap-2`}>
                        <span className="font-medium" style={{color: RETRO.accent2}}>Mem:</span>
                        <span>{fmtMem((clusterTotals.find((t) => t.id === cluster.id)?.memoryGiB) || 0)}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="hover:opacity-80" style={{color: RETRO.accent}} onClick={() => removeCluster(cluster.id)} aria-label="Remove cluster"><Trash2 className="h-5 w-5" /></Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <table className="w-full text-sm">
                      <thead className="text-left" style={{color: RETRO.textDim}}>
                        <tr>
                          <th className="px-3 py-2">Workload</th>
                          <th className="px-3 py-2">CPU (cores/replica)</th>
                          <th className="px-3 py-2">Memory (GiB/replica)</th>
                          <th className="px-3 py-2">Replicas</th>
                          <th className="px-3 py-2 text-right">Actions</th>
                        </tr>
                      </thead>
                      <Droppable droppableId={cluster.id} type="WORKLOAD">
                        {(provided) => (
                          <tbody ref={provided.innerRef} {...provided.droppableProps}>
                            {clusters.find(c=>c.id===cluster.id)?.workloads.map((w, idx) => (
                              <Draggable key={w.id} draggableId={w.id} index={idx}>
                                {(drag) => (
                                  <tr
                                    ref={drag.innerRef}
                                    {...drag.draggableProps}
                                    {...drag.dragHandleProps}
                                    className="border-t"
                                    style={{ borderColor: RETRO.border, ...(drag.draggableProps.style || {}) }}
                                  >
                                    <td className="px-3 py-2"><Input className="input-retro" value={w.name} onChange={(e) => setWorkloadField(cluster.id, w.id, "name", e.target.value)} /></td>
                                    <td className="px-3 py-2"><Input className="input-retro" type="number" inputMode="decimal" value={w.cpuCores} onChange={(e) => setWorkloadField(cluster.id, w.id, "cpuCores", Number(e.target.value))} /></td>
                                    <td className="px-3 py-2"><Input className="input-retro" type="number" inputMode="decimal" value={w.memoryGiB} onChange={(e) => setWorkloadField(cluster.id, w.id, "memoryGiB", Number(e.target.value))} /></td>
                                    <td className="px-3 py-2"><Input className="input-retro" type="number" inputMode="numeric" value={w.replicas} onChange={(e) => setWorkloadField(cluster.id, w.id, "replicas", Math.round(Number(e.target.value)))} /></td>
                                    <td className="px-3 py-2 text-right"><Button variant="ghost" size="icon" className="hover:opacity-80" style={{color: RETRO.accent}} onClick={() => removeWorkload(cluster.id, w.id)}><Trash2 className="h-4 w-4" /></Button></td>
                                  </tr>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </tbody>
                        )}
                      </Droppable>
                    </table>
                    <div className="mt-2"><Button className="btn-retro" onClick={() => addWorkload(cluster.id)}><Plus className="mr-2 h-4 w-4" /> Add Workload</Button></div>

                    {/* Utilization vs Max (CPU & Memory) */}
                    {(() => {
                      const totals = clusterTotals.find((t) => t.id === cluster.id);
                      const usedCpu = totals?.cpuCores ?? 0;
                      const usedMem = totals?.memoryGiB ?? 0;
                      const capCpu = clusters.find(c=>c.id===cluster.id)?.maxCpuCores ?? 0;
                      const capMem = clusters.find(c=>c.id===cluster.id)?.maxMemoryGiB ?? 0;
                      const cpuPct = capCpu > 0 ? Math.min(100, Math.round((usedCpu / capCpu) * 100)) : 0;
                      const memPct = capMem > 0 ? Math.min(100, Math.round((usedMem / capMem) * 100)) : 0;
                      const overCpu = capCpu > 0 && usedCpu > capCpu;
                      const overMem = capMem > 0 && usedMem > capMem;
                      return (
                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className={`rounded-xl border px-3 py-2 text-xs ${overCpu ? "border-red-300" : ""}`} style={{borderColor: RETRO.border, background: RETRO.bg}}>
                            <div className="flex justify-between"><span className="font-medium" style={{color: RETRO.accent3}}>CPU Utilization</span><span>{capCpu > 0 ? `${cpuPct}%` : "—"}</span></div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded" style={{background: "#1a1a2a"}}>
                              <div className="h-2" style={{ width: `${capCpu > 0 ? cpuPct : 0}%`, background: overCpu ? RETRO.accent : RETRO.accent3 }} />
                            </div>
                            <div className="mt-1" style={{color: RETRO.textDim}}>
                              {fmtCPU(usedCpu)} / {capCpu > 0 ? fmtCPU(capCpu) : "no max set"}
                            </div>
                          </div>
                          <div className={`rounded-xl border px-3 py-2 text-xs ${overMem ? "border-red-300" : ""}`} style={{borderColor: RETRO.border, background: RETRO.bg}}>
                            <div className="flex justify-between"><span className="font-medium" style={{color: RETRO.accent2}}>Memory Utilization</span><span>{capMem > 0 ? `${memPct}%` : "—"}</span></div>
                            <div className="mt-1 h-2 w-full overflow-hidden rounded" style={{background: "#1a1a2a"}}>
                              <div className="h-2" style={{ width: `${capMem > 0 ? memPct : 0}%`, background: overMem ? RETRO.accent : RETRO.accent2 }} />
                            </div>
                            <div className="mt-1" style={{color: RETRO.textDim}}>
                              {fmtMem(usedMem)} / {capMem > 0 ? fmtMem(capMem) : "no max set"}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Cluster capacity inputs */}
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs label-retro">Max CPU (cores)</Label>
                        <Input
                          className="input-retro"
                          type="number"
                          inputMode="decimal"
                          value={cluster.maxCpuCores ?? 0}
                          onChange={(e) => updateClusterField(cluster.id, "maxCpuCores", Number(e.target.value))}
                        />
                      </div>
                      <div>
                        <Label className="text-xs label-retro">Max Memory (GiB)</Label>
                        <Input
                          className="input-retro"
                          type="number"
                          inputMode="decimal"
                          value={cluster.maxMemoryGiB ?? 0}
                          onChange={(e) => updateClusterField(cluster.id, "maxMemoryGiB", Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Charts */}
          <Tabs defaultValue="cpu" className="w-full mt-4">
            <TabsList className="grid w-full grid-cols-2" style={{background: RETRO.panel, border: `1.5px solid ${RETRO.border}`}}>
              <TabsTrigger value="cpu" className="pixel" style={{color: RETRO.text}}>CPU</TabsTrigger>
              <TabsTrigger value="mem" className="pixel" style={{color: RETRO.text}}>Memory</TabsTrigger>
            </TabsList>

            <TabsContent value="cpu" className="mt-4">
              <Card className={`${retroCard} rounded-2xl scan-edge`}>
                <CardHeader>
                  <CardTitle className="text-lg pixel" style={{color: RETRO.accent3}}>CPU by Cluster {stackByWorkload ? "(stacked by workload)" : "(totals)"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    <ResponsiveContainer>
                      <BarChart data={chartDataCPU} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <XAxis dataKey="cluster" angle={-10} textAnchor="end" height={50} stroke={RETRO.textDim} tick={{ fill: RETRO.textDim }} />
                        <YAxis stroke={RETRO.textDim} tick={{ fill: RETRO.textDim }} />
                        <Tooltip contentStyle={{ background: RETRO.panel, border: `1px solid ${RETRO.border}`, color: RETRO.text }} />
                        <Legend wrapperStyle={{ color: RETRO.text }} />
                        {stackByWorkload
                          ? workloadKeys.map((k, i) => <Bar key={k} dataKey={k} stackId="cpu" fill={BAR_COLORS[i % BAR_COLORS.length]} />)
                          : <Bar dataKey="total" fill={RETRO.accent3} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mem" className="mt-4">
              <Card className={`${retroCard} rounded-2xl scan-edge`}>
                <CardHeader>
                  <CardTitle className="text-lg pixel" style={{color: RETRO.accent2}}>Memory by Cluster {stackByWorkload ? "(stacked by workload)" : "(totals)"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    <ResponsiveContainer>
                      <BarChart data={chartDataMem} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <XAxis dataKey="cluster" angle={-10} textAnchor="end" height={50} stroke={RETRO.textDim} tick={{ fill: RETRO.textDim }} />
                        <YAxis stroke={RETRO.textDim} tick={{ fill: RETRO.textDim }} />
                        <Tooltip contentStyle={{ background: RETRO.panel, border: `1px solid ${RETRO.border}`, color: RETRO.text }} />
                        <Legend wrapperStyle={{ color: RETRO.text }} />
                        {stackByWorkload
                          ? workloadKeys.map((k, i) => <Bar key={k} dataKey={k} stackId="mem" fill={BAR_COLORS[i % BAR_COLORS.length]} />)
                          : <Bar dataKey="total" fill={RETRO.accent2} />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DragDropContext>
  );
}

function Stat({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl p-4 scan-edge" style={{ background: RETRO.panel, border: `1.5px solid ${RETRO.border}`, color: RETRO.text }}>
      <div className="text-xs uppercase tracking-wide pixel" style={{ color: RETRO.textDim }}>{title}</div>
      <div className="mt-1 text-2xl font-semibold pixel" style={{ color: RETRO.accent4 }}>{value}</div>
      {subtitle && <div className="text-xs" style={{ color: RETRO.textDim }}>{subtitle}</div>}
    </div>
  );
}
