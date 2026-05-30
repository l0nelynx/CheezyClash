# Baseline Profile

Что это: список классов и методов, которые ART AOT-компилирует при установке
APK. Cold-start ускоряется на 20-30%, плюс убирается часть JIT-лагов в первые
секунды после запуска.

## Как сгенерировать (один раз / при больших UI-изменениях)

1. Запусти эмулятор Android Studio (API 28+ с Google APIs).
   Лучше — `Pixel 6 / API 34` или похожий.
2. Открой терминал в корне проекта:

   ```
   gradlew :app:generateDirectBaselineProfile
   ```

3. Жди ~3-5 минут (Gradle ставит app, бежит сценарий из
   `baselineprofile/src/main/java/.../BaselineProfileGenerator.kt`, копирует
   результат).
4. После успеха появится файл:

   ```
   app/src/directRelease/generated/baselineProfiles/baseline-prof.txt
   ```

5. **Закоммить его в git** — следующие release-сборки автоматически вкомпилят
   профиль в APK. Без коммита профиль будет существовать только локально.

## Чем покрывается профиль

См. `BaselineProfileGenerator.kt`. Сейчас:

- Cold-start приложения → MainScreen.
- Переключение вкладок Home → Proxies → Settings → Home.

НЕ покрывается (нужны system-permissions / реальная сеть):

- Подключение к VPN (`ClashVpnService` bind и старт TUN).
- Загрузка подписки.
- Auth.

Если когда-нибудь будут профилироваться эти флоу — нужно расширять `generate()`
и грантить разрешения через `device.executeShellCommand("pm grant ...")`.

## Что НЕ нужно делать

- Не пытайся генерировать профиль на gplay-флейворе через `generateGplayBaselineProfile`
  — там зависимости от Play Services, в эмуляторе без GMS они недоступны.
  Для gplay используется Cloud Profile (генерируется Play Store автоматически из
  телеметрии пользователей).
- Не запускай `:baselineprofile` тесты как обычный androidTest — это
  Macrobenchmark, он запускается только через `generateXxxBaselineProfile`-таски.

## Если генератор падает

Самые частые причины:

- **Эмулятор слишком медленный** → `device.wait(...)` не успевает найти "Главная".
  Увеличить таймауты в `BaselineProfileGenerator.kt`.
- **Текст вкладок изменился** в `MainScreen.kt` (`MainTab.HOME.title` и т.п.) — синхронизировать
  с `By.text(...)` селекторами в генераторе.
- **API < 28** на эмуляторе → Macrobenchmark не поддерживает, поднять API.

## Версия профиля устаревает?

После любых крупных UI-изменений (новые экраны, переработка home/proxies)
имеет смысл регенерировать. Без регенерации старый профиль продолжает работать,
но новые классы будут JIT-иться при первом обращении.
