# CheezyClash

![GitHub Downloads)](https://img.shields.io/github/downloads/l0nelynx/CheezyClash/total)

[![Stars](https://img.shields.io/github/stars/l0nelynx/CheezyClash?style=for-the-badge)](https://github.com/l0nelynx/CheezyClash/stargazers)

[![Channel](https://img.shields.io/badge/Telegram-Chat-blue?style=flat-square&logo=telegram)](https://t.me/CheezyClash)

[English](#english) | [Русский](#русский)

---

<a name="english"></a>

[//]: # (## English)
**CheezyClash** is a modern and user-friendly graphical interface for **Clash.Meta** (Mihomo) on Android. It aims to provide a seamless proxy management experience with advanced routing capabilities.

**Desktop (experimental):** see [`desktop/`](desktop/) — Electron client with mihomo sidecar from the same go.mod as Android (proxy MVP + TUN helper).
### 🌟 Features
- **Based on Clash.Meta (Mihomo):** Leveraging the powerful core of [Mihomo](https://github.com/MetaCubeX/mihomo).
- **Smart Group Support:** Intelligent proxy grouping and selection using the [Mihomo fork](https://github.com/vernesong/mihomo) with **LightGBM** model support.
- **LAN Proxy Sharing:** Easily share your proxy connection with other devices in your local network.
- **Remnawave Integration:** 
  - HWID transmission support for [Remnawave Panel](https://github.com/remnawave/panel).
  - Support for subscription headers: `profile-title`, `announce`, `profile-update-interval`, `subscription-userinfo`  (`total`, `expire`, `tag`).
- **Modern UI:** Clean, intuitive, and native Android experience.
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

**Release secrets:** `SIGNING_KEY`, `KEY_STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, optional `TELEGRAM_TOKEN` / `TELEGRAM_TO`, and `PROPRIETARY_DISPATCH_TOKEN` (PAT with `actions: write` on private `l0nelynx/CheezyVPN_android` — required for the auto proprietary release).

### Firebase (Analytics + Crashlytics)

1. Firebase Console → one project → add Android apps for release IDs `com.cheezy.freedom.clash` and `com.cheezy.freedom`. For local debug builds also register `com.cheezy.freedom.clash.debug` and `com.cheezy.freedom.debug` (debug `applicationIdSuffix`), or merge all four clients into one json.
2. Download the config (or merge both clients) into [`app/google-services.json`](app/google-services.json). Template: [`app/google-services.json.example`](app/google-services.json.example).
3. Rebuild — Gradle applies `google-services` + Crashlytics plugins only when that file exists. Without it, the app builds normally with Firebase omitted.

Crash reporting covers the main process and `:vpn`. No custom analytics events yet (auto-collection only).

**FCM (push):** implemented only in the private CheezyVPN proprietary overlay (`firebase-messaging` + `CheezyFirebaseMessagingService`). Open builds do not include push.
### 📄 License
This project is licensed under the [MIT License](LICENSE).
### ⭐ Support
If you like this project, please give it a **Star**

---

<a name="русский"></a>

[//]: # (## Русский)
**CheezyClash** — это современный и удобный графический интерфейс для **Clash.Meta** (Mihomo) на Android. Простой прокси-клиент с мощными возможностями маршрутизации.
### 🌟 Особенности
- **На базе Clash.Meta (Mihomo):** Использует возможности ядра [Mihomo](https://github.com/MetaCubeX/mihomo).
- **Поддержка Smart Group:** Умное управление группами прокси на базе [форка ядра](https://github.com/vernesong/mihomo) с использованием модели **LightGBM**.
- **Раздача прокси в локальной сети:** Делитесь соединением с другими устройствами в вашей сети.
- **Интеграция с Remnawave:** 
  - Поддержка передачи HWID для [Remnawave Panel](https://github.com/remnawave/panel).
  - Поддержка заголовков подписки: `profile-title`, `announce`, `profile-update-interval`, `subscription-userinfo` (`total`, `expire`, `tag`).
- **Современный интерфейс:** Простой и понятный дизайн, оптимизированный под Android.
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

**Секреты релиза:** `SIGNING_KEY`, `KEY_STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`, опционально `TELEGRAM_TOKEN` / `TELEGRAM_TO`, и `PROPRIETARY_DISPATCH_TOKEN` (PAT с `actions: write` на приватный `l0nelynx/CheezyVPN_android` — нужен для авто-релиза proprietary).

### Firebase (Analytics + Crashlytics)

1. Firebase Console → один проект → Android apps для release: `com.cheezy.freedom.clash` и `com.cheezy.freedom`. Для локального debug также зарегистрируйте `com.cheezy.freedom.clash.debug` и `com.cheezy.freedom.debug` (`applicationIdSuffix`), либо объедините все четыре `client` в один json.
2. Скачать конфиг (или объединить оба `client`) в [`app/google-services.json`](app/google-services.json). Шаблон: [`app/google-services.json.example`](app/google-services.json.example).
3. Пересобрать — плагины `google-services` и Crashlytics подключаются только если файл есть. Без него сборка идёт как обычно, без Firebase.

Краши собираются и в main, и в `:vpn`. Кастомных событий пока нет (только auto-collection).

**FCM (push):** только в private CheezyVPN proprietary overlay (`firebase-messaging` + `CheezyFirebaseMessagingService`). В open-сборках push нет.
### 📄 Лицензия
Этот проект распространяется под лицензией [MIT License](LICENSE).
### ⭐ Support
Если вам нравится этот проект, пожалуйста, поставьте **Star**
