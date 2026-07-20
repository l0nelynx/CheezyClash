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

**CheezyClash** is a modern and user-friendly graphical interface for **Clash.Meta** (Mihomo) on Android and desktop. It aims to provide a seamless proxy management experience with advanced routing capabilities.

**Desktop (experimental):** see [`desktop/`](desktop/) — Electron client with mihomo sidecar from the same go.mod as Android (proxy MVP + TUN helper).

### 🌟 Features

- **Based on Clash.Meta (Mihomo):** Leveraging the powerful core of [Mihomo](https://github.com/MetaCubeX/mihomo).
- **Smart Group Support:** Intelligent proxy grouping and selection using the [Mihomo fork](https://github.com/vernesong/mihomo) with **LightGBM** model support.
- **LAN Proxy Sharing:** Easily share your proxy connection with other devices in your local network.
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

Release builds include **Firebase Crashlytics** for automatic crash reporting.

### 📄 License

This project is licensed under the [MIT License](LICENSE).

### ⭐ Support

If you like this project, please give it a **Star** ⭐

---

<a name="русский"></a>

**CheezyClash** — современный и удобный графический интерфейс для **Clash.Meta** (Mihomo) на Android и desktop. Простой прокси-клиент с мощными возможностями маршрутизации.

### 🌟 Особенности

- **На базе Clash.Meta (Mihomo):** Использует возможности ядра [Mihomo](https://github.com/MetaCubeX/mihomo).
- **Поддержка Smart Group:** Умное управление группами прокси на базе [форка ядра](https://github.com/vernesong/mihomo) с использованием модели **LightGBM**.
- **Раздача прокси в локальной сети:** Делитесь соединением с другими устройствами в вашей сети.
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

В release-сборках подключён **Firebase Crashlytics** для автоматического сбора крашей.

### 📄 Лицензия

Этот проект распространяется под лицензией [MIT License](LICENSE).

### ⭐ Support

Если вам нравится этот проект, пожалуйста, поставьте **Star** ⭐

---

<p align="center">
  Thanks to the <a href="https://github.com/remnawave/panel">Remnawave</a> community · Спасибо комьюнити <a href="https://github.com/remnawave/panel">Remnawave</a>
</p>
