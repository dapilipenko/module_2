from __future__ import annotations

import json
import os
import time

import paho.mqtt.client as mqtt

from app.generator import build_sensor_catalog, generate_measurement


def main() -> None:
    mqtt_host = os.getenv("MQTT_HOST", "localhost")
    mqtt_port = int(os.getenv("MQTT_PORT", "1883"))
    topic_prefix = os.getenv("MQTT_TOPIC_PREFIX", "airquality")
    sensor_count = int(os.getenv("SENSOR_COUNT", "52"))
    publish_interval = float(os.getenv("PUBLISH_INTERVAL_SEC", "15"))

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="air-quality-simulator")
    client.connect(mqtt_host, mqtt_port, keepalive=60)
    client.loop_start()

    catalog = build_sensor_catalog(sensor_count)

    try:
        while True:
            for sensor in catalog:
                payload = generate_measurement(sensor)
                topic = f"{topic_prefix}/{sensor.zone}/{sensor.sensor_id}/measurements"
                client.publish(topic, json.dumps(payload), qos=1)
            time.sleep(publish_interval)
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
