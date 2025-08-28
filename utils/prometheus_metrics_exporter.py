#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# Prometheus → Multi‑cluster JSON for the K8s Growth Web App (Python 3)
# - Reads a mapping file (JSON array) with entries:
#     { "cluster_name": "...", "prometheus_url": "...", "capacity": { "maxCpuCores": <float>, "maxMemoryGiB": <float> } }
# - Queries each Prometheus for CPU requests and Memory limits per namespace
# - Folds namespaces {"kube-network","monitoring","kube-system"} into "cluster-services"
# - Outputs a single JSON array of clusters compatible with the web app
# Constraints: no 'requests' package; no annotations

import argparse
import json
import os
import ssl
import sys
import uuid
import urllib.parse
import urllib.request

CPU_QUERY = 'sum by (namespace) (kube_pod_container_resource_requests{resource="cpu"})'
MEM_QUERY = 'sum by (namespace) (kube_pod_container_resource_limits{resource="memory"})'

DEFAULT_PLATFORM_NS = {"kube-network", "kube-system"}
PLATFORM_BUCKET = "cluster-services"


def _uid():
    return uuid.uuid4().hex


def _to_f(x):
    try:
        return float(x)
    except Exception:
        return 0.0


def _bytes_to_gib(b):
    return _to_f(b) / (1024.0 ** 2)


def build_url(base_url, path, params):
    if not base_url.endswith('/'):
        base_url += '/'
    return base_url + path.lstrip('/') + '?' + urllib.parse.urlencode(params)


def http_get_json(url, timeout, verify_tls, bearer_token):
    headers = {"Accept": "application/json"}
    if bearer_token:
        headers["Authorization"] = "Bearer " + bearer_token
    req = urllib.request.Request(url, headers=headers)

    ctx = None
    if url.startswith("https") and not verify_tls:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        data = resp.read()
    return json.loads(data.decode("utf-8"))


def prom_instant_query(base_url, query, timeout, verify_tls, bearer_token):
    url = build_url(base_url, "api/v1/query", {"query": query})
    data = http_get_json(url, timeout, verify_tls, bearer_token)
    if data.get("status") != "success":
        raise RuntimeError("Prometheus non-success status from %s: %r" % (base_url, data.get("status")))
    return data.get("data", {}).get("result", [])


def aggregate_namespace_usage(cpu_vec, mem_vec, platform_ns):
    # Returns dict: ns -> {"cpuCores": float, "memGiB": float}
    usage = {}

    for s in cpu_vec:
        metric = s.get("metric") or {}
        ns = metric.get("namespace", "")
        if not ns:
            continue
        val = s.get("value") or []
        cpu = _to_f(val[1] if len(val) > 1 else 0.0)
        key = PLATFORM_BUCKET if ns in platform_ns else ns
        rec = usage.setdefault(key, {"cpuCores": 0.0, "memGiB": 0.0})
        rec["cpuCores"] += cpu

    for s in mem_vec:
        metric = s.get("metric") or {}
        ns = metric.get("namespace", "")
        if not ns:
            continue
        val = s.get("value") or []
        mem_gib = _bytes_to_gib(val[1] if len(val) > 1 else 0.0)
        key = PLATFORM_BUCKET if ns in platform_ns else ns
        rec = usage.setdefault(key, {"cpuCores": 0.0, "memGiB": 0.0})
        rec["memGiB"] += mem_gib

    return usage


def build_cluster_object(cluster_name, usage, capacity):
    caps = capacity or {}
    cluster = {
        "id": _uid(),
        "name": cluster_name,
        "maxCpuCores": float(caps.get("maxCpuCores", 0) or 0),
        "maxMemoryGiB": float(caps.get("maxMemoryGiB", 0) or 0),
        "workloads": []
    }
    # stable, meaningful order: high CPU first, then alpha
    for ns, rec in sorted(usage.items(), key=lambda kv: (-kv[1]["cpuCores"], kv[0])):
        cluster["workloads"].append({
            "id": _uid(),
            "name": ns,
            "cpuCores": float("%0.4f" % rec["cpuCores"]),
            "memoryGiB": float("%0.4f" % rec["memGiB"]),
            "replicas": 1
        })
    return cluster


def main():
    ap = argparse.ArgumentParser(description="Export per-namespace CPU requests and memory limits from multiple Prometheus endpoints → web-app JSON")
    ap.add_argument("--mapping-file", required=True, help="JSON file array of {cluster_name, prometheus_url, capacity} entries")
    ap.add_argument("--out", default="k8s-cluster-growth.json", help="Output JSON file (default: %(default)s)")
    ap.add_argument("--timeout", type=int, default=30, help="HTTP timeout seconds (default: 30)")
    ap.add_argument("--insecure-skip-verify", action="store_true", help="Skip TLS verification for HTTPS endpoints")
    ap.add_argument("--platform-ns-file", help="Optional JSON file containing list of platform namespaces to combine")
    args = ap.parse_args()

    # bearer token from env (applied to all Prom servers if present)
    bearer = os.environ.get("PROM_BEARER_TOKEN")

    # read mapping
    try:
        with open(args.mapping_file, "r") as f:
            mapping = json.load(f)
    except Exception as e:
        print("Failed to read mapping file: %s" % e, file=sys.stderr)
        sys.exit(1)

    if args.platform_ns_file:
        try:
            with open(args.platform_ns_file, "r") as f:
                platform_ns = json.load(f)
            if not isinstance(platform_ns, list):
                raise ValueError("platform-ns-file must contain a JSON list of namespaces")
        except Exception as e:
            print(f"Failed to read platform-ns-file, falling back to default: {e}", file=sys.stderr)
            platform_ns = DEFAULT_PLATFORM_NS
    else:
        platform_ns = DEFAULT_PLATFORM_NS

    if not isinstance(mapping, list):
        print("--mapping-file must be a JSON array of objects", file=sys.stderr)
        sys.exit(1)

    clusters = []
    for entry in mapping:
        if not isinstance(entry, dict):
            continue
        cname = entry.get("cluster_name")
        purl = entry.get("prometheus_url")
        capacity = entry.get("capacity") or {}
        if not cname or not purl:
            continue

        try:
            cpu_vec = prom_instant_query(purl, CPU_QUERY, args.timeout, not args.insecure_skip_verify, bearer)
            mem_vec = prom_instant_query(purl, MEM_QUERY, args.timeout, not args.insecure_skip_verify, bearer)
        except Exception as e:
            print("[WARN] %s: failed to query Prometheus: %s" % (cname, e), file=sys.stderr)
            continue

        usage = aggregate_namespace_usage(cpu_vec, mem_vec, platform_ns)
        cluster_obj = build_cluster_object(cname, usage, capacity)
        clusters.append(cluster_obj)

    # sort for stability
    clusters.sort(key=lambda c: c.get("name", ""))

    try:
        with open(args.out, "w") as f:
            json.dump(clusters, f, indent=2)
            f.write("\n")
    except Exception as e:
        print("Failed to write output: %s" % e, file=sys.stderr)
        sys.exit(1)

    print("Wrote %d clusters → %s" % (len(clusters), args.out))


if __name__ == "__main__":
    main()
