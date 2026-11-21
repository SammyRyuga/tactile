// This checker runs on a user-supplied measurement file and never sends traffic.
export const measurementChecker = `#!/usr/bin/env python3
"""Evaluate a single measured metric from a CSV with a numeric value column."""
import argparse
import csv
import math
import statistics
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("capture", help="CSV file with a value column in the claim's units")
parser.add_argument("--limit", type=float, required=True, help="Acceptance threshold in the same units")
parser.add_argument("--direction", choices=["at-most", "at-least"], required=True)
parser.add_argument("--statistic", choices=["mean", "p95", "min", "max"], default="p95")
parser.add_argument("--minimum-samples", type=int, required=True)
args = parser.parse_args()
if args.minimum_samples < 1 or not math.isfinite(args.limit):
    parser.error("Specify a positive sample minimum and a finite threshold.")
try:
    with open(args.capture, newline="", encoding="utf-8-sig") as file:
        rows = csv.DictReader(file)
        values = [float(row["value"]) for row in rows]
except (OSError, KeyError, ValueError, TypeError) as error:
    sys.exit(f"Cannot read measurement CSV: {error}")
if len(values) < args.minimum_samples or not all(map(math.isfinite, values)):
    sys.exit("Capture does not have enough valid samples.")
values.sort()
if args.statistic == "p95":
    observed = values[math.ceil(0.95 * len(values)) - 1]
else:
    observed = {"mean": statistics.fmean, "min": min, "max": max}[args.statistic](values)
passed = observed <= args.limit if args.direction == "at-most" else observed >= args.limit
print(f"{args.statistic}={observed:.8g}, n={len(values)}, limit={args.limit:.8g}: {'PASS' if passed else 'FAIL'}")
sys.exit(0 if passed else 1)
`;
