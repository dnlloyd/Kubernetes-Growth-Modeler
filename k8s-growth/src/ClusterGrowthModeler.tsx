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
        workloads: [
          { id: uid(), name: "web-frontend", cpuCores: 2, memoryGiB: 4, replicas: 5 },
          { id: uid(), name: "api-backend", cpuCores: 3, memoryGiB: 6, replicas: 3 },
          { id: uid(), name: "postgres", cpuCores: 4, memoryGiB: 16, replicas: 1 },
        ],
      },
      {
        id: uid(),
        name: "rwcm-prod",
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
        return row;
      });
    }
    return clusterTotals.map((t) => ({ cluster: t.name, total: toUnitCPU(t.cpuCores) }));
  }, [clusters, clusterTotals, stackByWorkload, unitCPU]);

  const chartDataMem = useMemo(() => {
    if (stackByWorkload) {
      return clusters.map((c) => {
        const row = { cluster: c.name };
        c.workloads.forEach((w) => {
          row[w.name] = toUnitMem(w.memoryGiB * w.replicas);
        });
        return row;
      });
    }
    return clusterTotals.map((t) => ({ cluster: t.name, total: toUnitMem(t.memoryGiB) }));
  }, [clusters, clusterTotals, stackByWorkload, unitMem]);

  const workloadKeys = useMemo(() => {
    const setNames = new Set();
    clusters.forEach((c) => c.workloads.forEach((w) => setNames.add(w.name)));
    return [...setNames];
  }, [clusters]);

  // Mutators
  const addCluster = () => setClusters((prev) => [...prev, { id: uid(), name: `cluster-${prev.length + 1}`, workloads: [] }]);
  const removeCluster = (cid) => setClusters((prev) => prev.filter((c) => c.id !== cid));
  const updateClusterName = (cid, name) => setClusters((prev) => prev.map((c) => (c.id === cid ? { ...c, name } : c)));

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

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Kubernetes Cluster Growth Modeler</h1>
              <p className="text-slate-600">Drag to reorder or move workloads across clusters. Totals update live.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={addCluster}><Plus className="mr-2 h-4 w-4" /> Add Cluster</Button>
              <Button variant="outline" onClick={() => {
                const blob = new Blob([JSON.stringify(clusters, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "k8s-cluster-growth.json";
                a.click();
                URL.revokeObjectURL(url);
              }}><Download className="mr-2 h-4 w-4" /> Export JSON</Button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50">
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
            <div className="rounded-2xl border bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Units</div>
                  <div className="text-xs text-slate-500">View conversions only</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant={unitCPU === "cores" ? "default" : "outline"} onClick={() => setUnitCPU("cores")}>cores</Button>
                  <Button size="sm" variant={unitCPU === "millicores" ? "default" : "outline"} onClick={() => setUnitCPU("millicores")}>millicores</Button>
                  <div className="w-2" />
                  <Button size="sm" variant={unitMem === "GiB" ? "default" : "outline"} onClick={() => setUnitMem("GiB")}>GiB</Button>
                  <Button size="sm" variant={unitMem === "MiB" ? "default" : "outline"} onClick={() => setUnitMem("MiB")}>MiB</Button>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Switch id="stack" checked={stackByWorkload} onCheckedChange={setStackByWorkload} />
                <Label htmlFor="stack" className="text-sm">Stack charts by workload groups</Label>
              </div>
            </div>
          </div>

          {/* Clusters */}
          <div className="grid gap-6 lg:grid-cols-2">
            {clusters.map((cluster) => (
              <Droppable droppableId={cluster.id} key={cluster.id}>
                {(provided) => (
                  <motion.div ref={provided.innerRef} {...provided.droppableProps} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="border-slate-200 shadow-sm">
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <div className="w-full max-w-md">
                          <Label htmlFor={`name-${cluster.id}`} className="text-xs text-slate-500">Cluster Name</Label>
                          <Input id={`name-${cluster.id}`} className="mt-1" value={cluster.name} onChange={(e) => updateClusterName(cluster.id, e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1 text-xs">
                            <span className="font-medium">CPU:</span>
                            <span>{fmtCPU((clusterTotals.find((t) => t.id === cluster.id)?.cpuCores) || 0)}</span>
                          </div>
                          <div className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1 text-xs">
                            <span className="font-medium">Mem:</span>
                            <span>{fmtMem((clusterTotals.find((t) => t.id === cluster.id)?.memoryGiB) || 0)}</span>
                          </div>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => removeCluster(cluster.id)} aria-label="Remove cluster"><Trash2 className="h-5 w-5" /></Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left">
                            <tr className="text-slate-600">
                              <th className="px-3 py-2">Workload</th>
                              <th className="px-3 py-2">CPU (cores/replica)</th>
                              <th className="px-3 py-2">Memory (GiB/replica)</th>
                              <th className="px-3 py-2">Replicas</th>
                              <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cluster.workloads.map((w, idx) => (
                              <Draggable key={w.id} draggableId={w.id} index={idx}>
                                {(drag) => (
                                  <tr ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} className="border-t hover:bg-slate-50/40">
                                    <td className="px-3 py-2"><Input value={w.name} onChange={(e) => setWorkloadField(cluster.id, w.id, "name", e.target.value)} /></td>
                                    <td className="px-3 py-2"><Input type="number" inputMode="decimal" value={w.cpuCores} onChange={(e) => setWorkloadField(cluster.id, w.id, "cpuCores", Number(e.target.value))} /></td>
                                    <td className="px-3 py-2"><Input type="number" inputMode="decimal" value={w.memoryGiB} onChange={(e) => setWorkloadField(cluster.id, w.id, "memoryGiB", Number(e.target.value))} /></td>
                                    <td className="px-3 py-2"><Input type="number" inputMode="numeric" value={w.replicas} onChange={(e) => setWorkloadField(cluster.id, w.id, "replicas", Math.round(Number(e.target.value)))} /></td>
                                    <td className="px-3 py-2 text-right"><Button variant="ghost" size="icon" className="text-red-500" onClick={() => removeWorkload(cluster.id, w.id)}><Trash2 className="h-4 w-4" /></Button></td>
                                  </tr>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </tbody>
                        </table>
                        <div className="mt-2"><Button variant="secondary" onClick={() => addWorkload(cluster.id)}><Plus className="mr-2 h-4 w-4" /> Add Workload</Button></div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
              </Droppable>
            ))}
          </div>

          {/* Charts */}
          <Tabs defaultValue="cpu" className="w-full mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="cpu">CPU</TabsTrigger>
              <TabsTrigger value="mem">Memory</TabsTrigger>
            </TabsList>

            <TabsContent value="cpu" className="mt-4">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">CPU by Cluster {stackByWorkload ? "(stacked by workload)" : "(totals)"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    <ResponsiveContainer>
                      <BarChart data={chartDataCPU} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <XAxis dataKey="cluster" angle={-10} textAnchor="end" height={50} />
                        <YAxis />
                        <Tooltip formatter={(val) => (unitCPU === "millicores" ? `${val} m` : `${Number(val).toFixed(2)} cores`)} />
                        <Legend />
                        {stackByWorkload
                          ? workloadKeys.map((k) => <Bar key={k} dataKey={k} stackId="cpu" />)
                          : <Bar dataKey="total" />}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="mem" className="mt-4">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-lg">Memory by Cluster {stackByWorkload ? "(stacked by workload)" : "(totals)"}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80 w-full">
                    <ResponsiveContainer>
                      <BarChart data={chartDataMem} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                        <XAxis dataKey="cluster" angle={-10} textAnchor="end" height={50} />
                        <YAxis />
                        <Tooltip formatter={(val) => (unitMem === "MiB" ? `${val} MiB` : `${Number(val).toFixed(2)} GiB`)} />
                        <Legend />
                        {stackByWorkload
                          ? workloadKeys.map((k) => <Bar key={k} dataKey={k} stackId="mem" />)
                          : <Bar dataKey="total" />}
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
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
  );
}
