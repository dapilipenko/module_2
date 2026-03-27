from __future__ import annotations

import json
import os

import paho.mqtt.client as mqtt

from app.aggregate import build_city_summary, build_zone_summary, parse_senml


latest_by_zone: dict[str, dict[str, dict[str, object]]] = {}


def publish_summaries(client: mqtt.Client, output_prefix: str) -> None:
    zone_summaries: dict[str, dict[str, object]] = {}
    for zone, sensors in latest_by_zone.items():
        if not sensors:
            continue
        summary = build_zone_summary(zone, list(sensors.values()))
        zone_summaries[zone] = summary
        client.publish(
            f"{output_prefix}/zones/{zone}/state",
            json.dumps(summary),
            qos=1,
            retain=True,
        )

    if zone_summaries:
        city = build_city_summary(zone_summaries)
        client.publish(
            f"{output_prefix}/city/summary",
            json.dumps(city),
            qos=1,
            retain=True,
        )


def on_message(client: mqtt.Client, userdata: dict[str, str], msg: mqtt.MQTTMessage) -> None:
    payload = parse_senml(msg.payload.decode("utf-8"))
    zone = str(payload.get("zone", "unknown"))
    sensor_id = str(payload.get("sensor_id", "unknown"))
    latest_by_zone.setdefault(zone, {})[sensor_id] = payload
    publish_summaries(client, userdata["output_prefix"])


def main() -> None:
    mqtt_host = os.getenv("MQTT_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
    mqtt_input_topic = os.getenv("MQTT_INPUT_TOPIC", "airquality/+/+/measurements")
    mqtt_output_prefix = os.getenv("MQTT_OUTPUT_PREFIX", "openhab")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="air-quality-openhab-aggregator")
    client.user_data_set({"output_prefix": mqtt_output_prefix})
    client.on_message = on_message
    client.connect(mqtt_host, mqtt_port, keepalive=60)
    client.subscribe(mqtt_input_topic, qos=1)
    client.loop_forever()


if __name__ == "__main__":
    main()
