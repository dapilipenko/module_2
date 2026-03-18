## Multi-protocol Gateway (MQTT + Zigbee mock)

Цей проєкт демонструє Multi-protocol Gateway на базі OpenHAB 4.x. Він об'єднує MQTT та Zigbee (емуляція через HTTP) в єдиний hub з REST API та уніфікованою панеллю керування.

### Архітектура
- MQTT broker (Mosquitto) + MQTT simulator (3 сенсори)
- Zigbee mock (HTTP API для пристроїв)
- OpenHAB як центральний hub (bindings, rules, items, UI)
- MQTT Explorer для перегляду MQTT трафіку

### Сервіси та порти
- OpenHAB: http://localhost:8080
- Mosquitto: 1883 (MQTT), 9001 (WebSocket)
- Zigbee mock: http://localhost:3000
- MQTT Explorer: http://localhost:4000

### Структура репозиторію
- docker-compose.yaml — сервісний стек
- mosquitto/config/mosquitto.conf — конфіг брокера
- zigbee-mock/ — HTTP емулятор Zigbee
- openhab_conf/things/mqtt.things — MQTT binding і канали
- openhab_conf/things/zigbee-mock.things — HTTP binding до Zigbee mock
- openhab_conf/items/gateway.items — уніфікована модель Items
- openhab_conf/rules/bridge.rules — правила синхронізації протоколів
- openhab_conf/sitemaps/default.sitemap — UI панель Gateway
- openhab_conf/persistence/mapdb.persist — persistence

### Швидкий старт
1. Запуск: `docker compose up -d --build`
2. Відкрити UI: http://localhost:8080
3. Відкрити MQTT Explorer: http://localhost:4000
4. Перевірити Zigbee mock: http://localhost:3000/devices

### MQTT топіки (емулятор)
- sensors/temp → { "temperature": 22.5, "battery": 92 }
- sensors/humidity → { "humidity": 48.3, "battery": 88 }
- lights/lamp1/state → { "on": true, "level": 56 }

### Zigbee mock HTTP API
- GET /devices — список пристроїв
- GET /devices/{id} — стан пристрою
- PUT /devices/{id} — оновлення стану
- POST /pair — додавання пристрою

### REST API (OpenHAB)
- GET /rest/things — discovery
- GET /rest/items/<ItemName> — статус
- POST /rest/items/<ItemName> — команда

### Як працює міст
- MQTT сенсори → MQTT Binding → Items MQTT_* → правила → Items Gateway_* → Zigbee mock (PUT)
- Zigbee mock → HTTP Binding → Items Zigbee_* → правила → Items Gateway_* → MQTT publish
- Команди з UI/REST → Items Gateway_Light/Gateway_Dimmer → правила → MQTT + Zigbee

### Тести/перевірка
- UI: перевірити, що Gateway_Temperature оновлюється кожні ~5 секунд
- REST: POST /rest/items/Gateway_Light з ON/OFF
- Zigbee: GET /devices/zb_switch_1 до/після команди
