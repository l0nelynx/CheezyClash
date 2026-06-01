package com.cheezy.freedom.ui.main

import android.app.Application
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.cheezy.freedom.BuildConfig
import com.cheezy.freedom.UpdateManager
import com.cheezy.freedom.account.AccountState
import com.cheezy.freedom.account.AppDeps
import com.cheezy.freedom.account.SubscriptionSnapshot
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ClashVpnService
import com.cheezy.freedom.clash.ConfigManager
import com.cheezy.freedom.clash.SubscriptionInfo
import com.cheezy.freedom.ui.main.proxies.ProxyUiData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

sealed class MainEffect {
    data class LaunchVerify(val email: String?) : MainEffect()
    data class ShowSnackbar(val text: String) : MainEffect()
    data class OpenUrl(val url: String) : MainEffect()
    data object CloseDialogs : MainEffect()
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val context: Context get() = getApplication()

    private val _configName = MutableStateFlow(ConfigManager.currentName(context))
    val configName: StateFlow<String?> = _configName.asStateFlow()

    private val _userEmail = MutableStateFlow<String?>(null)
    val userEmail: StateFlow<String?> = _userEmail.asStateFlow()

    private val _tgId = MutableStateFlow<Long?>(null)
    val tgId: StateFlow<Long?> = _tgId.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    private val _isCheckingUpdate = MutableStateFlow(false)
    val isCheckingUpdate: StateFlow<Boolean> = _isCheckingUpdate.asStateFlow()

    private val _updateInfo = MutableStateFlow<UpdateManager.UpdateInfo?>(null)
    val updateInfo: StateFlow<UpdateManager.UpdateInfo?> = _updateInfo.asStateFlow()

    private val _showUrlDialog = MutableStateFlow(false)
    val showUrlDialog: StateFlow<Boolean> = _showUrlDialog.asStateFlow()

    /**
     * Whether to show "account login onboarding" at startup. In the proprietary
     * version, this is AuthActivity; in open, it's UrlDialog (where there's no
     * concept of an account). Onboarding is needed if the user has neither a
     * config nor an account state. MainScreen decides what exactly to show
     * based on AppDeps.launchers.
     */
    private val _needsAuth = MutableStateFlow(false)
    val needsAuth: StateFlow<Boolean> = _needsAuth.asStateFlow()

    // Tab data
    private val _proxyGroups = MutableStateFlow<List<Pair<String, List<ProxyUiData>>>?>(null)
    val proxyGroups: StateFlow<List<Pair<String, List<ProxyUiData>>>?> = _proxyGroups.asStateFlow()

    private val _groupIcons = MutableStateFlow<Map<String, Int>>(emptyMap())
    val groupIcons: StateFlow<Map<String, Int>> = _groupIcons.asStateFlow()

    private val _isPinging = MutableStateFlow(false)
    val isPinging: StateFlow<Boolean> = _isPinging.asStateFlow()

    /** true if the current flavor can show AuthActivity when needsAuth is true. */
    val supportsAuthFlow: Boolean get() = AppDeps.accountProvider.supportsAuthFlow

    private var isClashLoaded = false

    init {
        // Immediately load the group and icon cache from disk so the Proxies tab
        // shows the last known list during a cold start BEFORE the remote
        // connects to the :vpn process. Without this, the user sees an empty
        // screen until the first tick from the core or a manual ping.
        val cached = ConfigManager.loadProxyGroupsCache(context)
        if (cached != null) _proxyGroups.value = cached

        val cachedIcons = ConfigManager.readGroupIcons(context).mapValues { (_, resName) ->
            context.resources.getIdentifier(resName, "drawable", context.packageName)
        }
        if (cachedIcons.isNotEmpty()) _groupIcons.value = cachedIcons

        // Stream account state to UI flows. In open, it's always Anonymous → _userEmail
        // and _tgId will remain null; SettingsTab will automatically hide cheezy-only items.
        viewModelScope.launch {
            AppDeps.accountProvider.state.collect { state ->
                when (state) {
                    is AccountState.Authenticated -> {
                        // Do not overwrite email with empty/null from a partial response:
                        // if the email is missing in the cache (or a new /me),
                        // it's better to keep the one already shown.
                        state.email?.takeIf { it.isNotBlank() }?.let { _userEmail.value = it }
                        _tgId.value = state.telegramId
                    }
                    AccountState.Anonymous -> {
                        _userEmail.value = null
                        _tgId.value = null
                    }
                    AccountState.Unknown -> Unit
                }
            }
        }
    }

    private val _effects = MutableSharedFlow<MainEffect>(extraBufferCapacity = 4)
    val effects: SharedFlow<MainEffect> = _effects.asSharedFlow()

    fun dismissUpdateDialog() { _updateInfo.value = null }
    fun openUrlDialog() { _showUrlDialog.value = true }
    fun dismissUrlDialog() { _showUrlDialog.value = false }

    fun bootstrap() {
        viewModelScope.launch {
            // Restore account cache (in open this is a no-op; in proprietary it reads last_me).
            AppDeps.accountProvider.bootstrap(context)

            val currentState = AppDeps.accountProvider.state.value
            val isAuthed = currentState is AccountState.Authenticated
            val hasConfig = ConfigManager.hasConfig(context)
            if (!isAuthed && !hasConfig) {
                // In proprietary, this will launch AuthActivity; in open, it launches UrlDialog.
                _needsAuth.value = true
                return@launch
            }
            _needsAuth.value = false

            // The source of truth for title/announce is the YAML subscription; data from the API is overlaid on top.
            syncSubscriptionState()

            if (ClashState.lastUpdateTime.value == 0L) {
                ClashState.setLastUpdateTime(ConfigManager.lastUpdateTime(context))
            }

            // Subscribe to config time updates as well as the service connection state
            viewModelScope.launch {
                combine(
                    ClashState.lastUpdateTime,
                    ClashRemoteManager.connected,
                ) { timestamp, connected -> timestamp to connected }
                    .collect { (timestamp, connected) ->
                        if (timestamp > 0 && connected) {
                            reloadProxyGroups(forceLoad = false)
                        }
                    }
            }

            ConfigManager.ensureUpdateScheduled(context)

            viewModelScope.launch { migrateClashCacheIfVersionChanged() }

            if (UpdateManager.isEnabled) {
                viewModelScope.launch { _updateInfo.value = UpdateManager.checkUpdate() }
            }

            // Forced sync with the backend at startup. In open, this is a no-op success.
            AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess {
                val snap = (AppDeps.accountProvider.state.value as? AccountState.Authenticated)?.snapshot
                val email = (AppDeps.accountProvider.state.value as? AccountState.Authenticated)?.email
                if (snap != null && !snap.emailVerified) {
                    _effects.emit(MainEffect.LaunchVerify(email))
                } else {
                    handleSyncSuccess()
                }
            }.onFailure { e ->
                Log.e("Auth", "Failed to sync sub on startup", e)
                // If sync fails AND the UI still has an empty email, the network error is
                // masked as 'forgot who I am'. Show a snackbar for clarity.
                if (_userEmail.value.isNullOrBlank() && supportsAuthFlow) {
                    _effects.emit(MainEffect.ShowSnackbar(
                        "Failed to update account data. Check your connection."
                    ))
                }
            }
        }
    }

    private fun handleSyncSuccess() {
        _configName.value = ConfigManager.currentName(context)
        syncSubscriptionState()
    }

    private fun syncSubscriptionState() {
        val cachedFromYaml = ConfigManager.loadSubscription(context)
        val snap = (AppDeps.accountProvider.state.value as? AccountState.Authenticated)?.snapshot
        val merged = mergeSubscription(cachedFromYaml, snap)
        if (merged != null) {
            ClashState.setSubscription(merged)
            // Save the merged state as current to avoid data loss upon restart
            ConfigManager.saveSubscription(context, merged)
        }
    }

    private fun mergeSubscription(
        fromYaml: SubscriptionInfo?,
        snap: SubscriptionSnapshot?,
    ): SubscriptionInfo? {
        if (fromYaml == null && snap == null) return null
        val used = snap?.usedBytes ?: 0L
        return SubscriptionInfo(
            title = fromYaml?.title ?: snap?.tariff ?: "None",
            announce = fromYaml?.announce,
            upload = if (snap != null) used / 2 else (fromYaml?.upload ?: 0L),
            download = if (snap != null) (used - used / 2) else (fromYaml?.download ?: 0L),
            total = if (snap != null) snap.totalBytes else (fromYaml?.total ?: 0L),
            expire = if (snap != null) snap.expireEpochSeconds else (fromYaml?.expire ?: 0L),
        )
    }

    private suspend fun migrateClashCacheIfVersionChanged() {
        val prefs = context.getSharedPreferences("cheezy.internal", Context.MODE_PRIVATE)
        val lastVer = prefs.getString("last_run_version", "")
        val currentVer = BuildConfig.VERSION_NAME
        if (lastVer == currentVer) return

        // Delete only cache files (cache.db etc.) but keep config.yaml
        // so the app can work offline after an update.
        val keep = setOf("config.yaml", "base.yaml")
        context.filesDir.resolve("clash").listFiles()?.forEach { file ->
            if (file.name !in keep) {
                file.deleteRecursively()
            }
        }

        prefs.edit().putString("last_run_version", currentVer).apply()
        val url = ConfigManager.lastUrl(context)
        if (!url.isNullOrBlank()) {
            runCatching {
                withContext(Dispatchers.IO) {
                    AppDeps.subscriptionGateway.importByUrl(context, url).getOrThrow()
                }
                _configName.value = ConfigManager.currentName(context)
            }
        }
    }

    fun onPaymentSuccess() {
        viewModelScope.launch {
            AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
            ConfigManager.lastUrl(context)?.let { url ->
                runCatching {
                    withContext(Dispatchers.IO) {
                        AppDeps.subscriptionGateway.importByUrl(context, url).getOrThrow()
                    }
                }
            }
            _configName.value = ConfigManager.currentName(context)
            syncSubscriptionState()
            _effects.emit(MainEffect.ShowSnackbar("Оплата прошла успешно!"))
        }
    }

    fun onVpnPermissionResult(granted: Boolean) {
        if (granted) ClashVpnService.start(context)
        else ClashState.setError("VPN permission denied")
    }

    fun refresh() {
        _loading.value = true
        ClashState.setError(null)
        viewModelScope.launch {
            AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
            val url = ConfigManager.lastUrl(context)
            if (url.isNullOrBlank()) {
                ClashState.setError("Нет сохранённого URL")
                _loading.value = false
            } else {
                withContext(Dispatchers.IO) {
                    runCatching { AppDeps.subscriptionGateway.importByUrl(context, url).getOrThrow() }
                }
                _loading.value = false
                _configName.value = ConfigManager.currentName(context)
                syncSubscriptionState()
                // Subscription updated — the set of groups/icons in YAML might have changed;
                // push this to the UI, same as importByUrl(url) does.
                reloadProxyGroups(forceLoad = true)
            }
        }
    }

    fun importFromUrl(url: String) {
        _showUrlDialog.value = false
        _loading.value = true
        ClashState.setError(null)
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                AppDeps.subscriptionGateway.importByUrl(context, url)
            }
            _loading.value = false
            result.onSuccess {
                _configName.value = it
                _needsAuth.value = false
                syncSubscriptionState()
                reloadProxyGroups(forceLoad = true)
            }
                .onFailure { ClashState.setError("Загрузка не удалась: ${it.message}") }
        }
    }

    fun checkUpdate() {
        viewModelScope.launch {
            _isCheckingUpdate.value = true
            _updateInfo.value = UpdateManager.checkUpdate()
            _isCheckingUpdate.value = false
        }
    }

    fun logout() {
        viewModelScope.launch {
            AppDeps.accountProvider.signOut(context)
            if (ClashState.running.value) ClashVpnService.stop(context)
            ConfigManager.clearAll(context)
            _configName.value = null
            _userEmail.value = null
            _needsAuth.value = true
        }
    }

    fun onAuthCompleted() {
        _needsAuth.value = false
        viewModelScope.launch {
            AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
                .onFailure { Log.e("Auth", "Failed to sync sub", it) }
        }
    }

    fun authIntent(): Intent? = AppDeps.launchers.authActivityIntent(context)

    fun verifyIntent(email: String?): Intent? =
        AppDeps.launchers.authActivityIntent(context)?.apply {
            putExtra("email", email)
            putExtra("mode", "VERIFY")
        }

    fun subscriptionIntent(): Intent? = AppDeps.launchers.subscriptionActivityIntent(context)
    fun devicesIntent(): Intent? = AppDeps.launchers.devicesActivityIntent(context)

    fun startTelegramLink() {
        viewModelScope.launch {
            AppDeps.accountProvider.startTelegramLink(context)
                .onSuccess { _effects.emit(MainEffect.OpenUrl(it.deeplink)) }
                .onFailure { _effects.emit(MainEffect.ShowSnackbar("Ошибка: ${it.message}")) }
        }
    }

    fun linkByUrl(url: String, email: String) {
        viewModelScope.launch {
            _loading.value = true
            AppDeps.accountProvider.linkByUrl(context, url, email)
                .onSuccess {
                    AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
                    _effects.emit(MainEffect.ShowSnackbar("Подписка перенесена"))
                    _effects.emit(MainEffect.CloseDialogs)
                }
                .onFailure { _effects.emit(MainEffect.ShowSnackbar("Ошибка: ${it.message}")) }
            _loading.value = false
        }
    }

    fun unlinkTelegram() {
        viewModelScope.launch {
            AppDeps.accountProvider.unlinkTelegram(context)
                .onSuccess {
                    _tgId.value = null
                    _effects.emit(MainEffect.ShowSnackbar("Telegram отвязан"))
                }
                .onFailure { _effects.emit(MainEffect.ShowSnackbar("Ошибка: ${it.message}")) }
        }
    }

    fun reloadProxyGroups(forceLoad: Boolean = false) {
        viewModelScope.launch {
            if (!ClashRemoteManager.connected.value) return@launch

            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val clashHome = context.filesDir.resolve("clash")

                    // Check the current state of the core in the remote process
                    val coreNames = ClashRemoteManager.queryGroupNames(false)
                    val isRunning = ClashRemoteManager.isRunning()
                    val isAlreadyLoaded = coreNames.isNotEmpty() || isRunning

                    // If the core in another process is already running, no need to reinitialize it
                    val didReload = ConfigManager.hasConfig(context) &&
                        (!isClashLoaded && !isAlreadyLoaded || forceLoad)
                    if (didReload) {
                        ClashRemoteManager.loadConfig(clashHome.absolutePath)
                        isClashLoaded = true

                        val validGroups = ClashRemoteManager.queryGroupNames(false).toSet()
                        val saved = ConfigManager.getSavedSelections(context)
                        saved.forEach { (group, proxy) ->
                            if (group in validGroups) {
                                runCatching { ClashRemoteManager.patchSelector(group, proxy) }
                            }
                        }
                        if (saved.isNotEmpty()) kotlinx.coroutines.delay(100)
                    } else if (isAlreadyLoaded) {
                        isClashLoaded = true
                    }

                    // If loadConfig was just called, the coreNames snapshot above is outdated
                    // (taken BEFORE config loading). Reread it, otherwise during a cold
                    // start of the :vpn process finalNames=[] and the UI will get an empty
                    // list, overwriting the one shown from the cache.
                    val finalNames = if (forceLoad || didReload) {
                        ClashRemoteManager.queryGroupNames(false)
                    } else coreNames
                    val groupMap = coroutineScope {
                        finalNames.map { name ->
                            async { name to ClashRemoteManager.queryGroup(name) }
                        }.awaitAll().mapNotNull { if (it.second == null) null else it.first to it.second!! }.toMap()
                    }

                    val groups = finalNames.mapNotNull { name ->
                        val group = groupMap[name] ?: return@mapNotNull null
                        name to group.proxies.map { p ->
                            val typeName = p.type.name
                            val isSubgroup = typeName == "URLTest" || typeName == "Fallback" ||
                                             typeName == "LoadBalance" || typeName == "Selector" ||
                                             typeName == "Smart"

                            var activeChild: String? = null
                            if (isSubgroup) {
                                val subGroup = groupMap[p.name]
                                activeChild = subGroup?.now?.takeIf { it.isNotBlank() }

                                // Smart behaves like URLTest: it selects a node itself;
                                // if the core hasn't run a health-check yet and `now` is empty,
                                // we substitute the first child so the UI doesn't flicker with "—".
                                if (activeChild == null && (typeName == "URLTest" || typeName == "Fallback" || typeName == "Smart")) {
                                    activeChild = subGroup?.proxies?.firstOrNull()?.name
                                }
                            }

                            ProxyUiData(p.name, typeName, p.subtitle, group.now, activeChild)
                        }
                    }

                    // Read icons on every reload: YAML is parsed from disk, which is
                    // a cheap operation and always happens inside Dispatchers.IO.
                    // A conditional cache ("read only if map is empty") caused
                    // new groups in an updated config.yaml to remain without icons
                    // until app restart — the only way to update the cache was
                    // through forceLoad=true in importFromUrl, while the background
                    // WorkManager triggered reloadProxyGroups only with forceLoad=false.
                    val icons = ConfigManager.readGroupIcons(context).mapValues { (_, resName) ->
                        context.resources.getIdentifier(resName, "drawable", context.packageName)
                    }

                    groups to icons
                }
            }
            result.onSuccess { (groups, icons) ->
                // Protection against overwriting valid data with an empty list.
                // This happens when the core in the :vpn process hasn't warmed up
                // yet by the time ClashRemoteManager reports connected=true.
                // If we already have groups shown (from cache or previous reload),
                // don't block the UI with emptiness.
                val existing = _proxyGroups.value
                if (groups.isNotEmpty() || existing.isNullOrEmpty()) {
                    _proxyGroups.value = groups
                }
                _groupIcons.value = icons
                // Write cache to disk — the next cold start will immediately
                // show the same groups without calling the core. Don't cache
                // empty lists (it means the core hasn't responded yet — better
                // to keep the old cache).
                if (groups.isNotEmpty()) {
                    runCatching { ConfigManager.saveProxyGroupsCache(context, groups) }
                }
            }
        }
    }

    fun measurePings() {
        if (_isPinging.value) return
        // Without a running core, healthCheck will return errors/emptiness,
        // and ClashState.setPings({}) will reset pings to Ping/Pong labels in the UI.
        // Better not to start it at all.
        if (!ClashRemoteManager.connected.value || !ClashState.running.value) {
            viewModelScope.launch {
                _effects.emit(MainEffect.ShowSnackbar("Start VPN to measure ping"))
            }
            return
        }
        viewModelScope.launch {
            _isPinging.value = true
            try {
                val current = _proxyGroups.value ?: return@launch
                val visibleProxyNames = current.flatMap { (_, proxies) ->
                    proxies.flatMap { listOfNotNull(it.name, it.activeChild) }
                }.toSet()

                val targetGroups = current.map { it.first }.toMutableSet()
                current.forEach { (_, proxies) ->
                    proxies.forEach { p ->
                        if (p.type == "URLTest" || p.type == "Fallback" || p.type == "LoadBalance" || p.type == "Selector" || p.type == "Smart")
                            targetGroups.add(p.name)
                    }
                }

                withContext(Dispatchers.IO) {
                    coroutineScope {
                        targetGroups.map { name ->
                            async {
                                withTimeoutOrNull(5000L) {
                                    runCatching { ClashRemoteManager.healthCheck(name) }
                                }
                            }
                        }.awaitAll()
                    }
                    // Give some time for pings to complete on the service side
                    kotlinx.coroutines.delay(2000)

                    val collected = targetGroups.mapNotNull { name ->
                        ClashRemoteManager.queryGroup(name)?.let { name to it.proxies }
                    }
                    val measured = HashMap<String, Int>()
                    collected.forEach { (_, proxies) ->
                        proxies.forEach { p ->
                            if (p.name in visibleProxyNames) {
                                measured[p.name] = if (p.delay in 1 until 65535) p.delay else -1
                            }
                        }
                    }
                    ClashState.setPings(measured)
                }
                reloadProxyGroups()
            } finally {
                _isPinging.value = false
            }
        }
    }
}
