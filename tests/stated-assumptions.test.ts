import assert from "node:assert/strict";
import test from "node:test";
import { prioritizeStatedAssumptions } from "../server/stated-assumptions.ts";

test("prioritizes a quoted guarantee while preserving limits and existing identity", () => {
  const load = { id: "load", text: "The broker has spare peak capacity." };
  const guarantee = {
    id: "delivery",
    text: "No invoice is delivered twice if a worker reconnects within 90 seconds.",
    loadBearing: true,
  };
  const proposal =
    "We will deploy independent workers. Our guarantee is that " +
    guarantee.text[0].toLowerCase() +
    guarantee.text.slice(1);
  assert.deepEqual(prioritizeStatedAssumptions(proposal, [load, guarantee]), [
    guarantee,
    load,
  ]);
});

test("leaves implicit engineering claims in their model-ranked order", () => {
  const claims = [
    { id: "first", text: "Partition offsets survive a broker restart." },
    { id: "second", text: "Consumers can catch up while exports run." },
  ];
  const proposal =
    "We plan to switch to partitioned queues. The broker retains offsets across restarts.";
  assert.deepEqual(prioritizeStatedAssumptions(proposal, claims), claims);
});
