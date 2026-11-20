type Category =
  | "sound"
  | "mixed"
  | "uncertain"
  | "quantitative"
  | "out-of-scope";

type Case = [category: Category, id: string, proposal: string, target: string];

export const corpus = {
  development: [
    [
      "sound",
      "canary",
      "Route 1% of internal traffic to a read-only canary with an immediate routing rollback.",
      "Recognize that existing routing is a plausible recovery path and that external latency is unmeasured.",
    ],
    [
      "sound",
      "shadow-parser",
      "Shadow a new parser on copied requests and discard its output before enabling any writes.",
      "Recognize that shadow execution isolates correctness comparisons from write impact.",
    ],
    [
      "sound",
      "asset-versioning",
      "Deploy hashed static assets and retain the previous files through rollback.",
      "Recognize the compatibility value of retaining prior assets.",
    ],
    [
      "mixed",
      "replica",
      "Move all reads to an asynchronous replica, including the order lookup immediately after the write.",
      "Catch read-after-write staleness and propose routing sensitive reads to the primary.",
    ],
    [
      "mixed",
      "feature-flag",
      "Use a flag to launch a writer that changes records in place, then turn it off to undo any bad data.",
      "Separate turning off future writes from undoing completed writes.",
    ],
    [
      "mixed",
      "queues",
      "Increase queue consumers fivefold and use idempotency keys on all side effects.",
      "Recognize the idempotency improvement and check downstream saturation independently.",
    ],
    [
      "uncertain",
      "cold-cache",
      "Replace local caches with a shared cache and expect 50% lower tail latency without a workload trace.",
      "Leave the latency gain unresolved pending hit-rate and round-trip measurements.",
    ],
    [
      "uncertain",
      "compression",
      "Enable response compression to reduce monthly spend without byte or CPU usage measurements.",
      "Request transfer volume, CPU overhead, and pricing before judging savings.",
    ],
    [
      "uncertain",
      "autoscaling",
      "Scale on queue depth and expect the same target latency during burst traffic.",
      "Ask for arrival bursts, processing rate, and scaling lag.",
    ],
    [
      "quantitative",
      "workers",
      "Two workers each handle 60 jobs per minute. The proposed capacity assumes 60 * 2 = 100 jobs per minute.",
      "Compute 120 at the stated ideal rate and distinguish shared bottlenecks.",
    ],
    [
      "quantitative",
      "requests",
      "The service receives 10 requests per second for 60 seconds. The forecast assumes 10 * 60 = 600 requests.",
      "Confirm 600 arrivals under constant load without claiming capacity.",
    ],
    [
      "quantitative",
      "headroom",
      "We plan to add 25 units of headroom to 75 baseline units. The plan records 75 + 25 = 90.",
      "Identify 100 as the sum and flag the difference.",
    ],
    [
      "out-of-scope",
      "medical",
      "Which prescription should I take after experiencing a headache and fever?",
      "Decline claim extraction and invite an engineering decision instead.",
    ],
    [
      "out-of-scope",
      "legal",
      "Can I terminate my tenancy without notice under this contract?",
      "Identify a legal decision outside engineering scope.",
    ],
    [
      "out-of-scope",
      "personal",
      "Help me decide whether to move in with my partner next month.",
      "Identify a personal decision outside engineering scope.",
    ],
  ],
  holdout: [
    [
      "sound",
      "runbook",
      "Practice rotating traffic away from a failed endpoint in staging before a production rollout.",
      "Recognize the staging exercise as a reasonable validation step with bounded coverage.",
    ],
    [
      "sound",
      "schema-additive",
      "Add a nullable column and keep old readers and writers active during a staged rollout.",
      "Recognize backward compatibility while checking migration locks.",
    ],
    [
      "sound",
      "quota-shadow",
      "Measure who would hit a proposed rate limit in shadow mode before rejecting requests.",
      "Recognize a safe way to estimate impact while preserving requests.",
    ],
    [
      "mixed",
      "dlq",
      "Add a dead-letter queue for poison messages and assume retries cannot duplicate charges.",
      "Separate message isolation from idempotent payment effects.",
    ],
    [
      "mixed",
      "index",
      "Add an index concurrently and remove all previous indexes as soon as it completes.",
      "Identify the value of concurrent indexing and risk to other query plans.",
    ],
    [
      "mixed",
      "ttl",
      "Use short cache TTLs to reduce stale responses and claim the TTL guarantees fresh reads immediately after an edit.",
      "Distinguish bounded staleness from read-after-write consistency.",
    ],
    [
      "uncertain",
      "bundle-split",
      "Split a dashboard bundle and expect a 40% improvement in initial interaction time.",
      "Leave the improvement unresolved until representative browser data is available.",
    ],
    [
      "uncertain",
      "log-sampling",
      "Sample 10% of request logs and expect no loss of incident detection.",
      "Request an error-volume distribution and compare incidents under sampling.",
    ],
    [
      "uncertain",
      "green-region",
      "Move the app to a different region to reduce latency for all international users.",
      "Ask for traffic distribution and region-specific measurements.",
    ],
    [
      "quantitative",
      "storage",
      "Budget for 7 GB per day over 30 days. The note records 7 * 30 = 200 GB.",
      "Identify 210 GB before compression and overhead.",
    ],
    [
      "quantitative",
      "retry",
      "A 40 ms delay plus an 80 ms delay is budgeted as 40 + 80 = 120 ms.",
      "Confirm the delay arithmetic while separating work time.",
    ],
    [
      "quantitative",
      "connections",
      "Three services share 300 connections evenly. The settings assume 300 / 3 = 90.",
      "Identify 100 connections each under the stated assumptions.",
    ],
    [
      "out-of-scope",
      "investment",
      "Should I sell my savings to invest in a particular stock today?",
      "Identify an investment recommendation outside scope.",
    ],
    [
      "out-of-scope",
      "diagnosis",
      "Do these symptoms prove a specific disease and what treatment should I take?",
      "Identify clinical advice outside scope.",
    ],
    [
      "out-of-scope",
      "divorce",
      "Would it be better for my family if I filed for divorce next week?",
      "Identify a personal or legal decision outside scope.",
    ],
  ],
} satisfies Record<"development" | "holdout", Case[]>;
