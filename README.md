# Варіант 1: Система моніторингу якості повітря в місті

Навчальний IoT-проєкт для міської мережі з 50+ сенсорів, що вимірюють `PM2.5`, `PM10`, `CO2`, `NO2`, температуру та вологість. Репозиторій побудований навколо `openHAB` як операційної платформи моніторингу та покриває всі вимоги модуля: стандартизацію та інтероперабельність, data pipeline, edge AI, DevOps/CI/CD і етико-правовий аналіз.

## Що входить у рішення

- інтероперабельність через `FIWARE NGSI-LD`
- уніфікований формат телеметрії `SenML` (`RFC 8428`)
- багатошаровий data pipeline: ingestion -> processing -> storage -> visualization
- edge AI для локальної класифікації рівня забруднення
- локальний стек `Docker Compose` для демонстрації
- `openHAB` для правил, операторського інтерфейсу та сповіщень
- workflow `GitHub Actions` для CI/CD і staging deployment
- `Privacy Impact Assessment` для міської системи моніторингу

## Архітектурна ідея

- На рівні сенсора малопотужний вузол читає показники повітря і передає пакет `SenML`.
- На рівні gateway виконується буферизація, нормалізація, локальна класифікація ризику і автономні алерти.
- У хмарному сегменті телеметрія потрапляє в `InfluxDB`, агрегати зберігаються в `PostgreSQL`, `openHAB` відповідає за операторський UI та правила, а `Grafana` дає аналітичні графіки й карти.
- Для інтеграції з зовнішніми міськими платформами використовується канонічна модель контексту `NGSI-LD`.

## Швидкий старт

1. Запустити локальний стенд:

   ```bash
   docker compose up --build
   ```

2. Відкрити сервіси:

- MQTT broker: `localhost:1883`
- openHAB: `http://localhost:8080`
- InfluxDB: `http://localhost:8086`
- Grafana: `http://localhost:3000`
- PostgreSQL: `localhost:5432`

3. У Grafana використати логін `admin` / пароль `admin`.

Примітка:

- `openHAB` використовує Docker named volumes для `/openhab/userdata` і `/openhab/addons`, щоб уникати проблем першої ініціалізації `version.properties`.

## Структура репозиторію

- `README.md` - короткий опис проєкту та інструкція запуску
- `docs/architecture.md` - архітектура, стандарти і Mermaid-діаграми
- `docs/data-pipeline.md` - формати даних, сховище, аналітичні запити
- `docs/edge-ai.md` - edge AI, автономні рішення та оновлення моделі
- `docs/devops-cicd.md` - CI/CD, OTA, контейнеризація і моніторинг
- `docs/dashboard-mockup.md` - макет dashboard з картою і графіками
- `docs/openhab-integration.md` - роль `openHAB`, текстові конфіги та правила
- `docs/privacy-impact-assessment.md` - етико-правовий аналіз і PIA
- `.github/workflows/ci-cd.yml` - автоматизація перевірки, build і staging deploy
- `docker-compose.yml` - локальне розгортання
- `simulator/` - edge simulator для 50+ віртуальних сенсорів
- `ingestor/` - сервіс приймання `SenML` і запису в `InfluxDB`
- `aggregator/` - MQTT-агрегатор для зональних станів, які споживає `openHAB`
- `openhab/` - текстові конфіги `things/items/rules/sitemap` для `openHAB`
- `sql/` - схема агрегованих даних і приклади аналітичних запитів

## Обрані стандарти

- `FIWARE NGSI-LD` для інтероперабельності між міськими платформами
- `SenML` для компактного уніфікованого подання вимірювань
- `MQTT` для gateway -> cloud ingestion
- `CoAP` для sensor -> gateway у мережах з низьким енергоспоживанням
- `HTTP`/`REST` для інтеграції з dashboard, OTA і NGSI-LD API

## Додатково

- Для фінальної здачі Markdown-документи можна експортувати у `PDF` або `DOCX`.
- Старий файл `variant1-pia-health-monitor.md` оновлено як вказівник на актуальний PIA, щоб не ламати наявну вкладку в IDE.
- `openHAB` у цьому проєкті використовується як практичний шар автоматизації та операторського моніторингу поверх `MQTT`.
