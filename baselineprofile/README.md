# Baseline Profile

Список классов и методов, которые ART AOT-компилирует при установке APK.
Cold-start ускоряется; часть JIT-лагов в первые секунды уходит.

## Один профиль на open + proprietary

Профиль описывает методы DEX (`Lcom/cheezy/freedom/...`), не `applicationId`.
Файлы лежат в общем source set:

```
app/src/directRelease/generated/baselineProfiles/
  baseline-prof.txt
  startup-prof.txt
```

AGP мержит `directRelease` в оба варианта: `directOpenRelease` и
`directProprietaryRelease`. Gplay локально не профилируем (Cloud Profile в Play).

Генерируем **один раз** против open (`com.cheezy.freedom.clash`) — без Auth overlay.

## Как сгенерировать

1. Эмулятор API 28+ (лучше Pixel 6 / API 34).
2. Из корня репо:

   ```
   gradlew :app:generateDirectOpenReleaseBaselineProfile
   gradlew :app:promoteBaselineProfileToDirectRelease
   ```

3. Закоммить обновлённые файлы в `app/src/directRelease/generated/baselineProfiles/`.

Плагин сначала пишет в `directOpenRelease/...`; `promote…` копирует в shared
`directRelease`. Без promote / без коммита release APK теряет AOT.

## Сценарий генератора

См. `BaselineProfileGenerator.kt` — один сценарий на каждую итерацию:

1. Cold start + `pm grant` уведомлений.
2. Пауза 2 с (чтобы успел UrlDialog) → один `Back` → пауза 5 с.
3. Медленные свайпы HorizontalPager по вкладкам и обратно.

Не покрывается: VPN connect, импорт подписки, proprietary AuthActivity (~ок для
общего UI).

## Когда регенерировать `.txt`

- Крупные изменения навигации / стартового экрана / тяжёлых Compose-экранов.
- **Не** нужно при смене строк, иконок, цветов — генератор на `testTag`, старый
  `.txt` продолжает работать (новые методы просто JIT’ятся).

## Чего не делать

- Не генерировать gplay через `generateGplay…BaselineProfile`.
- Не запускать `:baselineprofile` как обычный androidTest — только через
  `generateDirectOpenReleaseBaselineProfile`.
- Не коммитить профили из `directOpenRelease` / `gplay*` — канон только
  `directRelease`.

## Если генератор падает

- Медленный эмулятор → увеличить таймауты в `BaselineProfileGenerator.kt`.
- Переименовали `testTag` на вкладках → синхронизировать с генератором.
- API < 28 → Macrobenchmark не поддерживает.
