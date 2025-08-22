#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Single-cluster Prometheus → Kubernetes Cluster Growth Model (Python 3)
- CPU by namespace:    sum by (namespace) (agent:kube_pod_container_resource_requests_cpu_cores:sum)
- Memory by namespace: sum by (namespace) (kube_pod_container_resource_limits{resource="memory"})
  (bytes → GiB)

All namespaces become workloads under one cluster (given by --cluster-name).
"""

import argparse
import json
import os
import sys
import uuid
import ssl
import urllib.parse
import urllib.request

CPU_QUERY = 'sum by (namespace) (kube_pod_container_resource_requests{resource="cpu"})'
MEM_QUERY = 'sum by (namespace) (kube_pod_container_resource_limits{resource="memory"})'

def _uid():
    return uuid.uuid4().hex

def _to_f(x):
    try:
        return float(x)
    except Exception:
        return 0.0

def _bytes_to_gib(b):
    return _to_f(b) / 1024.0 / 1024.0 / 1024.0

def prom_instant_query(base_url, query, bearer_token=None, timeout=30, verify_tls=True):
    if not base_url.endswith('/'):
        base_url += '/'
    url = base_url + 'api/v1/query?' + urllib.parse.urlencode({'query': query})
    headers = {'Accept': 'application/json'}
    if bearer_token:
        headers['Authorization'] = 'Bearer ' + bearer_token

    ctx = None
    if url.startswith('https') and not verify_tls:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        body = resp.read()
    data = json.loads(body.decode('utf-8'))
    if data.get('status') != 'success':
        raise RuntimeError('Prometheus returned non-success status: %r' % data.get('status'))
    return data.get('data', {}).get('result', [])

def main():
    ap = argparse.ArgumentParser(description='Export single-cluster CPU/Memory by namespace to web-app JSON.')
    ap.add_argument('--prom-url', required=True, help='Prometheus base URL for this cluster (e.g. http://prom:9090)')
    ap.add_argument('--cluster-name', required=True, help='Name of this Kubernetes cluster')
    ap.add_argument('--out', default='k8s-cluster-growth.json', help='Output JSON file (default: %(default)s)')
    ap.add_argument('--max-cpu', type=float, default=0.0, help='Optional cluster max CPU (cores)')
    ap.add_argument('--max-mem', type=float, default=0.0, help='Optional cluster max Memory (GiB)')
    ap.add_argument('--include', default=None, help='Optional JSON array file of namespaces to include')
    ap.add_argument('--timeout', type=int, default=30, help='HTTP timeout seconds (default: 30)')
    ap.add_argument('--insecure-skip-verify', action='store_true', help='Skip TLS verification (HTTPS)')
    args = ap.parse_args()

    bearer = os.environ.get('PROM_BEARER_TOKEN')

    include_set = None
    if args.include:
        try:
            with open(args.include, 'r') as f:
                arr = json.load(f)
                if isinstance(arr, list):
                    include_set = set(arr)
        except Exception as e:
            print("Failed to read --include file: %s" % e, file=sys.stderr)
            sys.exit(1)

    # Query Prometheus
    cpu_vec = prom_instant_query(args.prom_url, CPU_QUERY, bearer, args.timeout, not args.insecure_skip_verify)
    mem_vec = prom_instant_query(args.prom_url, MEM_QUERY, bearer, args.timeout, not args.insecure_skip_verify)

    # Aggregate per-namespace
    ns_usage = {}  # ns -> {cpuCores, memGiB}
    for s in cpu_vec:
        ns = (s.get('metric') or {}).get('namespace', '')
        if not ns or (include_set and ns not in include_set):
            continue
        v = s.get('value', [])
        cpu = _to_f(v[1] if len(v) > 1 else 0.0)
        rec = ns_usage.setdefault(ns, {'cpuCores': 0.0, 'memGiB': 0.0})
        rec['cpuCores'] += cpu

    for s in mem_vec:
        ns = (s.get('metric') or {}).get('namespace', '')
        if not ns or (include_set and ns not in include_set):
            continue
        v = s.get('value', [])
        mem_gib = _bytes_to_gib(v[1] if len(v) > 1 else 0.0)
        rec = ns_usage.setdefault(ns, {'cpuCores': 0.0, 'memGiB': 0.0})
        rec['memGiB'] += mem_gib

    # Build single cluster object
    cluster = {
        'id': _uid(),
        'name': args.cluster_name,
        'maxCpuCores': float(args.max_cpu) if args.max_cpu else 0.0,
        'maxMemoryGiB': float(args.max_mem) if args.max_mem else 0.0,
        'workloads': []
    }

    # Workloads (one per namespace)
    for ns, usage in sorted(ns_usage.items(), key=lambda kv: (-kv[1]['cpuCores'], kv[0])):
        cluster['workloads'].append({
            'id': _uid(),
            'name': ns,
            'cpuCores': float(f"{usage['cpuCores']:.4f}"),
            'memoryGiB': float(f"{usage['memGiB']:.4f}"),
            'replicas': 1
        })

    out = [cluster]
    with open(args.out, 'w') as f:
        json.dump(out, f, indent=2)
        f.write('\n')

    print("Wrote 1 cluster (%s) → %s" % (args.cluster_name, args.out))

if __name__ == '__main__':
    main()
