# Prometheus to K8s Growth Model Exporter

Export metrics from Prometheus for import into the Kubernetes Growth Modeler.

## Notes

The `kube-network` and `kube-system` namespaces will consolidated under a single workload, this can be overwritten using the `--platform-ns-file` flag.

## Prerequisites

- Python 3.x
- No third-party libraries required (uses `urllib` and `json` from the standard library)

## Example usage

```
python3 prometheus_metrics_exporter.py \
  --mapping-file clusters.json \
  --out k8s-cluster-growth.json \
  --timeout 30 \
  --insecure-skip-verify
```

Import the resulting k8s-cluster-growth.json into the Kubernetes Growth Modeler web app.

## Example mapping file

clusters.json

```json
[
    {
        "cluster_name": "cluster-1",
        "prometheus_url": "https://prometheus.cluster-1.net",
        "capacity": {
            "maxCpuCores": 874,
            "maxMemoryGiB": 3945
        }
    },
    {
        "cluster_name": "cluster-2",
        "prometheus_url": "https://prometheus.cluster-2.net",
        "capacity": {
            "maxCpuCores": 874,
            "maxMemoryGiB": 3945
        }
    }
]
```

## Example usage consolidating platform resources under a single workload

```
python3 prometheus_metrics_exporter.py \
  --mapping-file clusters.json \
  --platform-ns-file platform_namespaces.json \
  --out k8s-cluster-growth.json \
  --timeout 30 \
  --insecure-skip-verify
```

### Platform Namespaces example

platform_namespaces.json

```json
["kube-network", "monitoring", "kube-system", "twistlock", "ingress", "system-upgrade"]
```
