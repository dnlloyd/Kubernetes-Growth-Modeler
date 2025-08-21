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
import {
  Plus,
  Trash2,
  BarChart3,
  Download,
  Upload,
  // Save,
  Calculator,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  // Cell,
} from "recharts";

// ---------- Helpers ----------
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const STORAGE_KEY = "k8s-cluster-growth-model-v1";

function clampNum(n: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = Number.isFinite(+n) ? +n : 0;
  return Math.min(Math.max(num, min), max);
}

// ---------- App ----------
export default function ClusterGrowthModeler() {
  const [clusters, setClusters] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    // seed with a friendly starter
    return [
      {
        id: uid(),
        name: "cluster-1",
        workloads: [
          { id: uid(), name: "web-frontend", cpuCores: 2, memoryGiB: 4, replicas: 5 },
          { id: uid(), name: "api-backend", cpuCores: 3, memoryGiB: 6, replicas: 3 },
          { id: uid(), name: "postgres", cpuCores: 4, memoryGiB: 16, replicas: 1 },
        ],
      },
      {
        id: uid(),
        name: "cluster-2",
        workloads: [
          { id: uid(), name: "ingress-nginx", cpuCores: 1, memoryGiB: 1, replicas: 4 },
          { id: uid(), name: "metrics", cpuCores: 2, memoryGiB: 8, replicas: 2 },
        ],
      },
    ];
  });

  const [stackByWorkload, setStackByWorkload] = useState(true);
  const [unitCPU, setUnitCPU] = useState("cores"); // cores | millicores
  const [unitMem, setUnitMem] = useState("GiB"); // GiB | MiB

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clusters));
    } catch (_) {}
  }, [clusters]);

  // ---------- Derived totals ----------
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

  // ---------- Unit conversion ----------
  const fmtCPU = (cores: number) => {
    if (unitCPU === "millicores") return `${Math.round(cores * 1000)} m`;
    return `${cores.toFixed(2)} cores`;
  };
  const fmtMem = (gib: number) => {
    if (unitMem === "MiB") return `${Math.round(gib * 1024)} MiB`;
    return `${gib.toFixed(2)} GiB`;
  };

  const toUnitCPU = (cores: number) => (unitCPU === "millicores" ? cores * 1000 : cores);
  const toUnitMem = (gib: number) => (unitMem === "MiB" ? gib * 1024 : gib);

  // ---------- Mutators ----------
  const addCluster = () => {
    setClusters((prev) => [
      ...prev,
      { id: uid(), name: `cluster-${prev.length + 1}`, workloads: [] },
    ]);
  };

  const removeCluster = (cid) => {
    setClusters((prev) => prev.filter((c) => c.id !== cid));
  };

  const updateClusterName = (cid, name) => {
    setClusters((prev) => prev.map((c) => (c.id === cid ? { ...c, name } : c)));
  };

  const addWorkload = (cid) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.id === cid
          ? {
              ...c,
              workloads: [
                ...c.workloads,
                { id: uid(), name: `workload-${c.workloads.length + 1}`,
                  cpuCores: 1, memoryGiB: 1, replicas: 1 },
              ],
            }
          : c
      )
    );
  };

  const removeWorkload = (cid, wid) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.id === cid ? { ...c, workloads: c.workloads.filter((w) => w.id !== wid) } : c
      )
    );
  };

  const setWorkloadField = (cid, wid, field, value) => {
    setClusters((prev) =>
      prev.map((c) =>
        c.id === cid
          ? {
              ...c,
              workloads: c.workloads.map((w) =>
                w.id === wid
                  ? {
                      ...w,
                      [field]: field === "name" ? value : clampNum(value),
                    }
                  : w
              ),
            }
          : c
      )
    );
  };

  // ---------- Import / Export ----------
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(clusters, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "k8s-cluster-growth.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJSON = async (file) => {
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("Invalid format");
      setClusters(data);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  };

  // ---------- Chart Data ----------
  const chartDataCPU = useMemo(() => {
    if (stackByWorkload) {
      // stacked by workload per cluster
      return clusters.map((c) => {
        const row = { cluster: c.name };
        c.workloads.forEach((w) => {
          const key = `${w.name}`;
          row[key] = toUnitCPU(w.cpuCores * w.replicas);
        });
        return row;
      });
    }
    return clusterTotals.map((t) => ({
      cluster: t.name,
      total: toUnitCPU(t.cpuCores),
    }));
  }, [clusters, clusterTotals, stackByWorkload, unitCPU]);

  const chartDataMem = useMemo(() => {
    if (stackByWorkload) {
      return clusters.map((c) => {
        const row = { cluster: c.name };
        c.workloads.forEach((w) => {
          const key = `${w.name}`;
          row[key] = toUnitMem(w.memoryGiB * w.replicas);
        });
        return row;
      });
    }
    return clusterTotals.map((t) => ({
      cluster: t.name,
      total: toUnitMem(t.memoryGiB),
    }));
  }, [clusters, clusterTotals, stackByWorkload, unitMem]);

  const workloadKeys = useMemo(() => {
    // For legend ordering
    const set = new Set();
    clusters.forEach((c) => c.workloads.forEach((w) => set.add(w.name)));
    return [...set];
  }, [clusters]);

  // ---------- UI ----------
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Kubernetes Cluster Growth Modeler</h1>
            <p className="text-slate-600">Model CPU & Memory across clusters and workload groups. Totals update live. Data persists locally.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={addCluster}>
              <Plus className="mr-2 h-4 w-4" /> Add Cluster
            </Button>
            <Button variant="outline" onClick={exportJSON}>
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50">
              <Upload className="h-4 w-4" />
              <span>Import JSON</span>
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => importJSON(e.target.files?.[0])}
              />
            </label>
          </div>
        </header>

        <Card className="border-slate-200 shadow-sm">
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              <Stat title="Total CPU" value={fmtCPU(grandTotals.cpuCores)} subtitle="All clusters" />
              <Stat title="Total Memory" value={fmtMem(grandTotals.memoryGiB)} subtitle="All clusters" />
              <div className="rounded-2xl border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Units</div>
                    <div className="text-xs text-slate-500">View conversions only</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <UnitToggle
                      label="CPU"
                      value={unitCPU}
                      a="cores"
                      b="millicores"
                      onChange={setUnitCPU}
                    />
                    <UnitToggle
                      label="Memory"
                      value={unitMem}
                      a="GiB"
                      b="MiB"
                      onChange={setUnitMem}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <Switch id="stack"
                          checked={stackByWorkload}
                          onCheckedChange={setStackByWorkload} />
                  <Label htmlFor="stack" className="text-sm">Stack charts by workload groups</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clusters */}
        <div className="grid gap-6 lg:grid-cols-2">
          {clusters.map((cluster) => (
            <motion.div key={cluster.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="w-full max-w-md">
                    <Label htmlFor={`name-${cluster.id}`} className="text-xs text-slate-500">Cluster Name</Label>
                    <Input
                      id={`name-${cluster.id}`}
                      className="mt-1"
                      value={cluster.name}
                      onChange={(e) => updateClusterName(cluster.id, e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <BadgeStat
                      icon={<Calculator className="h-4 w-4" />}
                      label="CPU"
                      value={fmtCPU(clusterTotals.find((t) => t.id === cluster.id)?.cpuCores || 0)}
                    />
                    <BadgeStat
                      icon={<BarChart3 className="h-4 w-4" />}
                      label="Mem"
                      value={fmtMem(clusterTotals.find((t) => t.id === cluster.id)?.memoryGiB || 0)}
                    />
                    <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => removeCluster(cluster.id)} aria-label="Remove cluster">
                      <Trash2 className="h-5 w-5" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Workloads table */}
                  <div className="overflow-hidden rounded-2xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left">
                        <tr className="text-slate-600">
                          <th className="px-3 py-2">Workload</th>
                          <th className="px-3 py-2">CPU (cores/replica)</th>
                          <th className="px-3 py-2">Memory (GiB/replica)</th>
                          <th className="px-3 py-2">Replicas</th>
                          <th className="px-3 py-2 text-right">Totals</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {cluster.workloads.length === 0 && (
                          <tr>
                            <td colSpan={6} className="px-3 py-6 text-center text-slate-500">No workloads yet. Add one below.</td>
                          </tr>
                        )}
                        {cluster.workloads.map((w) => {
                          const totalCPU = w.cpuCores * w.replicas;
                          const totalMem = w.memoryGiB * w.replicas;
                          return (
                            <tr key={w.id} className="border-t hover:bg-slate-50/40">
                              <td className="px-3 py-2">
                                <Input
                                  value={w.name}
                                  onChange={(e) => setWorkloadField(cluster.id, w.id, "name", e.target.value)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <NumberField
                                  value={w.cpuCores}
                                  min={0}
                                  step={0.1}
                                  onChange={(v) => setWorkloadField(cluster.id, w.id, "cpuCores", v)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <NumberField
                                  value={w.memoryGiB}
                                  min={0}
                                  step={0.1}
                                  onChange={(v) => setWorkloadField(cluster.id, w.id, "memoryGiB", v)}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <NumberField
                                  value={w.replicas}
                                  min={0}
                                  step={1}
                                  onChange={(v) => setWorkloadField(cluster.id, w.id, "replicas", Math.round(v))}
                                />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <div className="flex flex-col items-end leading-tight">
                                  <span className="font-medium">{fmtCPU(totalCPU)}</span>
                                  <span className="text-xs text-slate-500">{fmtMem(totalMem)}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" onClick={() => removeWorkload(cluster.id, w.id)} aria-label="Remove workload">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between">
                    <Button variant="secondary" onClick={() => addWorkload(cluster.id)}>
                      <Plus className="mr-2 h-4 w-4" /> Add Workload
                    </Button>
                    <div className="text-xs text-slate-500">
                      Totals update automatically. Inputs are per-replica resources.
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Charts */}
        <Tabs defaultValue="cpu" className="w-full">
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
                      {stackByWorkload ? (
                        workloadKeys.map((k) => (
                          <Bar key={k} dataKey={k} stackId="cpu" />
                        ))
                      ) : (
                        <Bar dataKey="total" />
                      )}
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
                      {stackByWorkload ? (
                        workloadKeys.map((k) => (
                          <Bar key={k} dataKey={k} stackId="mem" />
                        ))
                      ) : (
                        <Bar dataKey="total" />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <footer className="pb-10 text-center text-xs text-slate-500">
          Tip: switch to millicores/MiB to match kube conventions when comparing to PromQL or requests/limits.
        </footer>
      </div>
    </div>
  );
}

// ---------- Small Components ----------
function Stat({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
    </div>
  );
}

function BadgeStat({ icon, label, value }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1 text-xs">
      {icon}
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function UnitToggle({ label, value, a, b, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <div className="flex overflow-hidden rounded-xl border">
        <button
          className={`px-3 py-1 text-xs ${value === a ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
          onClick={() => onChange(a)}
          type="button"
        >
          {a}
        </button>
        <button
          className={`px-3 py-1 text-xs ${value === b ? "bg-slate-900 text-white" : "bg-white hover:bg-slate-50"}`}
          onClick={() => onChange(b)}
          type="button"
        >
          {b}
        </button>
      </div>
    </div>
  );
}

function NumberField({ value, onChange, step = 0.1, min = 0 }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
}
