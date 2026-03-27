from __future__ import annotations

import json
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.senml import parse_senml


class SenmlParserTests(unittest.TestCase):
    def test_parse_senml_extracts_sensor_and_values(self) -> None:
        payload = json.dumps(
            [
                {
                    "bn": "urn:ngsi-ld:AirQualityObserved:sensor-014:",
                    "bt": 1774586400,
                    "n": "pm25",
                    "u": "ug/m3",
                    "v": 18.4,
                },
                {"n": "pm10", "u": "ug/m3", "v": 31.2},
                {"n": "zone", "vs": "industrial"},
                {"n": "lat", "u": "deg", "v": 50.4652},
                {"n": "lon", "u": "deg", "v": 30.5126},
            ]
        )
        result = parse_senml(payload)
        self.assertEqual(result["sensor_id"], "sensor-014")
        self.assertEqual(result["zone"], "industrial")
        self.assertEqual(result["pm25"], 18.4)
        self.assertEqual(result["timestamp"], 1774586400)

    def test_parse_requires_non_empty_list(self) -> None:
        with self.assertRaises(ValueError):
            parse_senml("[]")


if __name__ == "__main__":
    unittest.main()
