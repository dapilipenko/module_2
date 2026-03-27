from __future__ import annotations

import json
from datetime import datetime, timezone


def extract_sensor_id(base_name: str) -> str:
    parts = [part for part in base_name.split(":") if part]
    return parts[-1]


def parse_senml(payload: str) -> dict[str, object]:
    pack = json.loads(payload)
    if not isinstance(pack, list) or not pack:
        raise ValueError("SenML payload must be a non-empty list")

    base_name = str(pack[0].get("bn", ""))
    base_time = int(pack[0].get("bt", int(datetime.now(tz=timezone.utc).timestamp())))
    result: dict[str, object] = {
        "sensor_id": extract_sensor_id(base_name),
        "timestamp": base_time,
    }

    for entry in pack:
        name = entry.get("n")
        if not name:
            continue
        if "v" in entry:
            result[str(name)] = entry["v"]
        elif "vs" in entry:
            result[str(name)] = entry["vs"]

    return result
