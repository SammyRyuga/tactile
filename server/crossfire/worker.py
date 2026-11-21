"""Run the pinned Crossfire core inside Tactile's authenticated request boundary."""
import asyncio
from contextvars import ContextVar
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from threading import Thread
from types import ModuleType

UPSTREAM = Path(__file__).with_name("upstream")
sys.path.insert(0, str(UPSTREAM))
if dependencies := os.getenv("TACTILE_CROSSFIRE_LIBS"):
    sys.path.insert(1, dependencies)


def integration(name, **exports):
    module = ModuleType(name)
    module.__dict__.update(exports)
    sys.modules[name] = module
    return module


def send(kind, **payload):
    print(json.dumps({"kind": kind, **payload}, ensure_ascii=True), flush=True)


class Bridge:
    def __init__(self):
        self.pending = {}
        self.count = 0
        self.loop = asyncio.get_running_loop()
        Thread(target=self.read, daemon=True).start()

    def read(self):
        for line in sys.stdin:
            self.loop.call_soon_threadsafe(self.resolve, json.loads(line))

    def resolve(self, reply):
        future = self.pending.get(reply["id"])
        if not future or future.done():
            return
        if "value" in reply:
            future.set_result(reply["value"])
        else:
            future.set_exception(RuntimeError("Tactile gateway request failed."))

    async def request(self, operation, **payload):
        self.count += 1
        identifier = self.count
        future = self.loop.create_future()
        self.pending[identifier] = future
        send("request", id=identifier, operation=operation, **payload)
        try:
            return await future
        finally:
            self.pending.pop(identifier, None)

    async def generate(self, system_prompt, messages, response_schema=None):
        value = await self.request(
            "generate",
            instructions=system_prompt,
            messages=messages,
            schema=response_schema.model_json_schema() if response_schema else None,
        )
        if response_schema is None:
            return value
        value = value.strip()
        if value.startswith("```") and value.endswith("```"):
            value = value.split("\n", 1)[1][:-3].strip()
        return response_schema.model_validate_json(value)


async def run(command):
    bridge = Bridge()
    cases = {}

    async def publish(_case_id, event, data):
        send("event", event=event, data=data)

    async def close(_case_id):
        pass

    integration("events", publish=publish, close=close)
    integration("store", get=cases.get, set=lambda case: cases.update({case.id: case}))
    integration("providers", __path__=[str(UPSTREAM / "providers")], get_provider=lambda: bridge)
    integration("providers.openai_compat", THINKING_TIMEOUT_SECONDS=35, reasoning_sink=ContextVar("reasoning_sink"))

    from core import loop
    from core.models import Case, Claim, EvidenceItem
    from evidence import fetch, search, verify
    from core.evaluators import researcher

    async def read_public_page(url, timeout=5.0):
        if fetch.is_serp_url(url):
            return ""
        return await asyncio.wait_for(bridge.request("fetch", url=url), timeout=timeout)

    async def search_gateway(_claim_id, query):
        hits = await bridge.request("search", query=query)
        retrieved_at = datetime.now(timezone.utc).isoformat()
        return [
            EvidenceItem(
                source_url=hit["url"],
                title=hit["title"],
                snippet=hit["passage"],
                retrieved_at=retrieved_at,
                source_class=search.classify_source(hit["url"]),
                provider="tactile",
            )
            for hit in hits if hit["passage"].strip()
        ]

    fetch.fetch_page = read_public_page
    verify.fetch_page = read_public_page
    researcher.fetch_page = read_public_page
    search._search_engines = search_gateway

    if command["operation"] == "revise":
        from core.reformulate import reformulate_prompt_with_steelman

        case = Case(
            id="tactile-revision",
            raw_input=command["proposal"],
            claims=[
                Claim(id=change["id"], statement=change["claim"], salvaged_claim=change["salvage"])
                for change in command["changes"]
            ],
        )
        proposal, _ = await reformulate_prompt_with_steelman(
            case, [claim.id for claim in case.claims], bridge, command.get("guidance")
        )
        send("case", case={"proposal": proposal})
        return

    if command["operation"] == "extract":
        clarification = command.get("clarification") or {}
        case = await loop.extract_claims(
            command["proposal"],
            bridge,
            context=command.get("context"),
            clarify_round=clarification.get("round", 0),
            previous_question=clarification.get("previousQuestion"),
        )
    else:
        case = Case(
            id="tactile-request",
            raw_input=command["proposal"],
            context=command.get("context"),
            claims=[Claim.model_validate(claim) for claim in command["claims"]],
            **command["metadata"],
        )
        cases[case.id] = case
        await loop.run_pipeline(case.id, bridge)

    case_data = case.model_dump(mode="json")
    for finding in case_data["findings"]:
        finding.pop("thinking", None)
    send("case", case=case_data)


if __name__ == "__main__":
    os.environ["DEMO_MODE"] = "false"
    try:
        asyncio.run(run(json.loads(sys.stdin.readline())))
        os._exit(0)
    except Exception:
        send("error")
        sys.exit(1)
