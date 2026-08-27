<p align="center">
  <img src=".github/logo.svg" width="96" alt="CheezyClash logo" />
</p>

<h1 align="center">CheezyClash</h1>

<p align="center">
  <a href="https://github.com/l0nelynx/CheezyClash/releases"><img src="https://img.shields.io/github/downloads/l0nelynx/CheezyClash/total" alt="GitHub Downloads"></a>
  <a href="https://github.com/l0nelynx/CheezyClash/stargazers"><img src="https://img.shields.io/github/stars/l0nelynx/CheezyClash?style=for-the-badge" alt="Stars"></a>
  <a href="https://t.me/CheezyClash"><img src="https://img.shields.io/badge/Telegram-Chat-blue?style=flat-square&logo=telegram" alt="Telegram"></a>
</p>

<p align="center">
  📚 <strong>Documentation:</strong> <a href="https://l0nelynx.github.io/CheezyClash-docs/">l0nelynx.github.io/CheezyClash-docs</a> — install (Windows, macOS, Linux, Android), desktop UI, FAQ
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#русский">Русский</a>
</p>

---

<a name="english"></a>

**CheezyClash** is a modern open-source Mihomo client for Android, Windows, macOS, and Linux with a clean and simple interface and native Remnawave subscription headers and HWID support.

**Desktop (experimental):** see [`desktop/`](desktop/) — Electron client with mihomo sidecar from the same go.mod as Android (proxy MVP + TUN helper).

### 🌟 Features

- **Based on Clash.Meta (Mihomo):** Leveraging the powerful core of [Mihomo](https://github.com/MetaCubeX/mihomo).
- **Smart Group Support:** Intelligent proxy grouping and selection based on the [Mihomo fork](https://github.com/vernesong/mihomo) with **LightGBM** model support.
- **LAN Proxy Sharing:** Easily share your proxy connection with other devices in your local network.
- **Xray-compatible Mux:** Support for **Mux.Cool** multiplexing on VLESS connections without flow.
- **WAP Mode:** Route traffic through an APN/WAP upstream proxy with automatic or manual configuration.
- **TUN Access Control:** Block or bypass selected apps in TUN mode.
- **Remnawave Integration:**
  - HWID transmission on **all platforms** (Android, Windows, macOS, Linux) for [Remnawave Panel](https://github.com/remnawave/panel).
  - Support for subscription headers: `profile-title`, `announce`, `profile-update-interval`, `subscription-userinfo` (`total`, `expire`, `tag`).
- **Modern UI:** Clean, intuitive experience on Android and desktop.
- *More features are coming soon*

### 🛠 Requirements

- **Android Version:**
  - Minimum: Android 9.0 (API 28)
  - Recommended: Android 17 (Target API 37)
- **Architectures:**
  - `arm64-v8a`
  - `armeabi-v7a`
  - `x86_64`

### 🔧 Build & CI

Native builds require Python 3 (symbol pairing/verification), Go 1.23+ and the
Android NDK version pinned in `core/build.gradle.kts`, in addition to the Android toolchain.

**Local build (open flavor):**

```bash
./gradlew assembleDirectOpenDebug
```

**Flavors:** `distribution` (`gplay` | `direct`) × `edition` (`open`). Proprietary edition is applied via `-PproprietaryGradle` from the private CheezyVPN repo.

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [PR Check](.github/workflows/pr-check.yml) | PR / push to `main` | Compile, unit tests, lint |
| [Build Clash Core](.github/workflows/build-core.yml) | Go/core changes | Build `libclash.so`, cache, publish `libclash-<hash>.zip` release |
| [Release](.github/workflows/release.yml) | Tag `v*` | Signed open APK + GitHub Release; then dispatches proprietary release |

Prebuilt `libclash-<go_hash>.zip` assets are consumed by CheezyVPN CI (proprietary builds). After a successful open release, CI sends `repository_dispatch` (`open_release`) to private CheezyVPN so it can bump `upstream`, tag the same `v*`, and publish the proprietary APK.

**Release secrets:** `SIGNING_KEY`, `KEY_STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, optional `TELEGRAM_TOKEN` / `TELEGRAM_TO`.

Auto dispatch to the proprietary overlay (private `l0nelynx/CheezyVPN_android`) is best-effort and is skipped when the required CI secret is not configured.

### Firebase

Builds with `app/google-services.json` include Firebase Analytics and Crashlytics.
“Send analytics and reports” is **ON by default** and controls both Firebase
Analytics and Crashlytics. It is inside “Analytics and crashes”, the last settings
item. An existing opt-out is preserved and also disables Analytics after updating.
Additional Go / `:vpn` crash and system-ANR reports contain source versions, safe
metadata and sanitized stack frames, never panic/exception messages, configs,
subscriptions, traffic addresses, Logcat, registers or memory. They appear as
**non-fatals**, outside the main process crash-free metric.

Capture: JVM/Go on Android 9–10; system exit reasons/ANR on Android 11; native
tombstones when available on Android 12+. Private no-backup raw dumps are removed
after processing. The sanitized queue is capped at 16 reports / 7 days / 64 KiB
each. Background collection does not require opening the UI or starting the VPN;
SDK delivery may wait for the next process launch. Turning the switch off stops
Analytics collection and clears local Analytics data / resets its app instance ID.
It also clears our crash queue and requests deletion of unsent Crashlytics reports;
full automatic Crashlytics upload disabling applies on the next launch. The shared
setting persists across launches. Already sent data cannot be recalled, and
Crashlytics can still maintain its own local cache.

Without `google-services.json` Firebase and diagnostic capture/jobs are disabled,
and the switch is hidden. Test this mode explicitly with `-PfirebaseEnabled=false`.
See [diagnostic architecture, symbols and device checks](docs/crash-reporting.md).

### 📄 License

This project is licensed under the [MIT License](LICENSE).

### ⭐ Support

If you like this project, please give it a **Star** ⭐

---

<a name="русский"></a>

**CheezyClash** — современный клиент Mihomo с открытым исходным кодом для Android, Windows, macOS и Linux, простым и понятным интерфейсом, нативной поддержкой заголовков подписок Remnawave и HWID.

### 🌟 Особенности

- **На базе Clash.Meta (Mihomo):** Использует возможности ядра [Mihomo](https://github.com/MetaCubeX/mihomo).
- **Поддержка Smart Group:** Интеллектуальная группировка и выбор прокси на базе [форка Mihomo](https://github.com/vernesong/mihomo) с поддержкой модели **LightGBM**.
- **Раздача прокси в локальной сети:** Делитесь соединением с другими устройствами в вашей сети.
- **Xray-совместимый Mux:** Поддержка мультиплексирования **Mux.Cool** для VLESS-соединений без flow.
- **WAP-режим:** Маршрутизация трафика через APN/WAP upstream proxy с автоматической или ручной настройкой.
- **Контроль приложений в TUN:** Блокировка или обход прокси для выбранных приложений в TUN-режиме.
- **Интеграция с Remnawave:**
  - Передача HWID на **всех платформах** (Android, Windows, macOS, Linux) для [Remnawave Panel](https://github.com/remnawave/panel).
  - Поддержка заголовков подписки: `profile-title`, `announce`, `profile-update-interval`, `subscription-userinfo` (`total`, `expire`, `tag`).
- **Современный интерфейс:** Простой и понятный дизайн на Android и desktop.
- *И другие скоро*

### 🛠 Требования

- **Версия Android:**
  - Минимальная: Android 9.0 (API 28)
  - Рекомендуемая: Android 17 (Target API 37)
- **Архитектуры:**
  - `arm64-v8a`
  - `armeabi-v7a`
  - `x86_64`

### 🔧 Сборка и CI

Для native-сборки дополнительно нужны Python 3 (проверка пар бинарников/символов),
Go 1.23+ и версия Android NDK, указанная в `core/build.gradle.kts`.

**Локально (open flavor):**

```bash
./gradlew assembleDirectOpenDebug
```

**Флаворы:** `distribution` (`gplay` | `direct`) × `edition` (`open`). Proprietary-редакция подключается через `-PproprietaryGradle` из приватного CheezyVPN.

| Workflow | Триггер | Назначение |
|----------|---------|------------|
| [PR Check](.github/workflows/pr-check.yml) | PR / push в `main` | Компиляция, unit-тесты, lint |
| [Build Clash Core](.github/workflows/build-core.yml) | Изменения Go/core | Сборка `libclash.so`, кеш, релиз `libclash-<hash>.zip` |
| [Release](.github/workflows/release.yml) | Тег `v*` | Подписанный open APK + GitHub Release; затем dispatch proprietary-релиза |

Готовые `libclash-<go_hash>.zip` используются CI CheezyVPN (proprietary-сборки). После успешного open-релиза CI шлёт `repository_dispatch` (`open_release`) в приватный CheezyVPN: bump `upstream`, тот же тег `v*`, публикация proprietary APK.

**Секреты релиза:** `SIGNING_KEY`, `KEY_STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, опционально `TELEGRAM_TOKEN` / `TELEGRAM_TO`.

Авто-dispatch в proprietary overlay (приватный `l0nelynx/CheezyVPN_android`) — best-effort: если CI secret не задан, шаг будет пропущен.

### Firebase

В сборках с `app/google-services.json` доступны Firebase Analytics и Crashlytics.
Переключатель «Отправлять аналитику и отчёты» **включён по умолчанию** и управляет
Firebase Analytics и Crashlytics одновременно. Он находится в окне «Аналитика и
сбои», последнем пункте настроек. Ранее выключенная настройка сохраняется и после
обновления отключает также Analytics. Дополнительный сбор охватывает падения
Go / `:vpn` и системные ANR: исходные версии, безопасные метаданные и очищенные
стеки. Тексты panic/exception, конфиги, подписки, адреса трафика, Logcat, память и
регистры не передаются. Такие события отображаются как **non-fatal**, отдельно
от crash-free метрики основного процесса.

Android 9–10: JVM/Go; Android 11: также системные причины завершения и ANR;
Android 12+: native tombstone, если он сохранён системой. Сырые дампы находятся
только в приватной no-backup области и удаляются после обработки. Очищенная
очередь ограничена 16 отчётами / 7 днями / 64 KiB на отчёт. Фоновый сбор не
открывает UI и не запускает VPN; отправка SDK может ждать следующего запуска
процесса. Выключение прекращает сбор Analytics, очищает его локальные данные и
сбрасывает идентификатор экземпляра приложения. Также очищается наша очередь и
запрашивается удаление неотправленных отчётов Crashlytics. Полное отключение
автоматической отправки Crashlytics применяется со следующего запуска. Общая
настройка сохраняется после перезапуска; уже переданные данные не отзываются,
локальный кеш Crashlytics возможен.

Без `google-services.json` Firebase, дополнительный сбор и задания отключены,
переключатель скрыт. Для проверки этого режима: `-PfirebaseEnabled=false`.
[Архитектура, символы и проверки на устройствах](docs/crash-reporting.md).

### 📄 Лицензия

Этот проект распространяется под лицензией [MIT License](LICENSE).

### ⭐ Support

Если вам нравится этот проект, пожалуйста, поставьте **Star** ⭐

---

<p align="center">
  Built for <a href="https://t.me/remnawave">❤️ Remnawave community</a> · Создано для <a href="https://t.me/remnawave">❤️ сообщества Remnawave</a>
</p>
