package com.cheezy.freedom.ui.main

import android.app.Application
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.cheezy.freedom.BuildConfig
import com.cheezy.freedom.R
import com.cheezy.freedom.UpdateManager
import com.cheezy.freedom.account.AccountState
import com.cheezy.freedom.account.AppDeps
import com.cheezy.freedom.account.SubscriptionSnapshot
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ClashVpnService
import com.cheezy.freedom.clash.ConfigManager
import com.cheezy.freedom.clash.ConfigOverrideManager
import com.cheezy.freedom.clash.LocalProxyOverride
import com.cheezy.freedom.clash.Profile
import com.cheezy.freedom.clash.ProfileManager
import com.cheezy.freedom.clash.ProfileStore
import com.cheezy.freedom.clash.SubscriptionInfo
import com.cheezy.freedom.ui.main.dialogs.ShareVpnInfo
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
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

sealed class MainEffect {
    data class LaunchVerify(val email: String?) : MainEffect()
    data class ShowSnackbar(val text: String) : MainEffect()
    data class OpenUrl(val url: String) : MainEffect()
    data class LaunchIntent(val intent: Intent) : MainEffect()
    data object CloseDialogs : MainEffect()
}

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val context: Context get() = getApplication()

    private val _configName = MutableStateFlow(ProfileStore.active(context)?.name)
    val configName: StateFlow<String?> = _configName.asStateFlow()

    // Profile catalog for the Profiles tab.
    private val _profiles = MutableStateFlow(ProfileStore.list(context))
    val profiles: StateFlow<List<Profile>> = _profiles.asStateFlow()

    private val _activeProfileId = MutableStateFlow(ProfileStore.activeId(context))
    val activeProfileId: StateFlow<String?> = _activeProfileId.asStateFlow()

    // Ids currently being refreshed (per-row spinners in the Profiles tab).
    private val _refreshingProfiles = MutableStateFlow<Set<String>>(emptySet())
    val refreshingProfiles: StateFlow<Set<String>> = _refreshingProfiles.asStateFlow()

    // Prefill for the add/URL dialog (used by the "add subscription" deep link).
    private val _urlDialogPrefill = MutableStateFlow("")
    val urlDialogPrefill: StateFlow<String> = _urlDialogPrefill.asStateFlow()

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
    /**
     * Set when a claim/login AuthActivity is started via [startActivity] (not the
     * auth-gate Activity Result launcher). Cleared on Main resume after checking
     * whether auth/config appeared.
     */
    private var _pendingAuthReturn = false

    // Tab data
    private val _proxyGroups = MutableStateFlow<List<Pair<String, List<ProxyUiData>>>?>(null)
    val proxyGroups: StateFlow<List<Pair<String, List<ProxyUiData>>>?> = _proxyGroups.asStateFlow()

    private val _groupIcons = MutableStateFlow<Map<String, Int>>(emptyMap())
    val groupIcons: StateFlow<Map<String, Int>> = _groupIcons.asStateFlow()

    private val _isPinging = MutableStateFlow(false)
    val isPinging: StateFlow<Boolean> = _isPinging.asStateFlow()

    private val _shareInfo = MutableStateFlow(ShareVpnInfo.EMPTY)
    val shareInfo: StateFlow<ShareVpnInfo> = _shareInfo.asStateFlow()

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
                    is AccountState.Unregistered -> {
                        _userEmail.value = null
                        _tgId.value = null
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
    fun openUrlDialog(prefill: String = "") {
        _urlDialogPrefill.value = prefill
        _showUrlDialog.value = true
    }
    fun dismissUrlDialog() {
        _showUrlDialog.value = false
        _urlDialogPrefill.value = ""
    }

    private fun refreshProfilesState() {
        _profiles.value = ProfileStore.list(context)
        _activeProfileId.value = ProfileStore.activeId(context)
        _configName.value = ProfileStore.active(context)?.name
    }

    fun bootstrap(skipAuthGate: Boolean = false) {
        viewModelScope.launch {
            // Migrate a pre-multiprofile single config into profile #1 (idempotent).
            withContext(Dispatchers.IO) { ProfileManager.migrateLegacyIfNeeded(context) }
            refreshProfilesState()

            // Restore account cache (in open this is a no-op; in proprietary it reads last_me).
            AppDeps.accountProvider.bootstrap(context)

            val currentState = AppDeps.accountProvider.state.value
            val isAuthed = currentState is AccountState.Authenticated
            val hasConfig = ConfigManager.hasConfig(context)
            if (!isAuthed && !hasConfig && !skipAuthGate) {
                // In proprietary, this will launch AuthActivity; in open, it launches UrlDialog.
                // Skipped when a claim/login deeplink already owns the auth UI (avoids stacking
                // a plain login screen on top of ClaimWizard).
                _needsAuth.value = true
                return@launch
            }
            _needsAuth.value = false

            // Warm up the core: pre-load the config into the :vpn process while the
            // user is on the home screen, so pressing Connect only has to build the
            // TUN, not parse the whole config. Guarded by an existing group cache so
            // we don't trigger a first-time geodata download at startup.
            warmUpCore()

            // The source of truth for title/announce is the YAML subscription; data from the API is overlaid on top.
            syncSubscriptionState()

            if (ClashState.lastUpdateTime.value == 0L) {
                ClashState.setLastUpdateTime(ProfileStore.active(context)?.lastUpdateTime ?: 0L)
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

            ProfileManager.ensureUpdateScheduled(context)

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
                        context.getString(R.string.error_account_sync_failed)
                    ))
                }
            }
        }
    }

    /**
     * Eagerly loads the config into the core once the :vpn service is bound, so a
     * later Connect tap skips the expensive parse. Idempotent on the service side
     * (dedup by config signature). Only runs when a group cache already exists —
     * that means the core has loaded this config successfully before (geodata
     * present), so we won't kick off a slow first-time download in the background.
     */
    private fun warmUpCore() {
        if (ClashState.running.value) return
        if (!ConfigManager.hasConfig(context)) return
        if (ConfigManager.loadProxyGroupsCache(context).isNullOrEmpty()) return
        viewModelScope.launch {
            ClashRemoteManager.connected.first { it }
            if (ClashState.running.value) return@launch
            val activeDir = ProfileStore.activeDir(context).absolutePath
            withContext(Dispatchers.IO) { ClashRemoteManager.loadConfig(activeDir) }
        }
    }

    private fun handleSyncSuccess() {
        refreshProfilesState()
        syncSubscriptionState()
    }

    private fun syncSubscriptionState() {
        val active = ProfileStore.active(context)
        val cachedFromYaml = active?.subscription
        val snap = (AppDeps.accountProvider.state.value as? AccountState.Authenticated)?.snapshot
        val merged = mergeSubscription(cachedFromYaml, snap)
        if (merged != null) {
            ClashState.setSubscription(merged)
            // Persist merged state onto the active profile to avoid data loss on restart.
            if (active != null) {
                ProfileStore.upsert(context, active.copy(subscription = merged))
                _profiles.value = ProfileStore.list(context)
            }
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

        // On a core/app version change only the core's own runtime cache (cache.db,
        // in the shared HOME) may be format-incompatible between mihomo builds, so
        // clear just that. Everything else — each profile's config.yaml/base.yaml and
        // its rule-provider caches (profiles/<id>/providers/) — is preserved, so a
        // cold start after an update doesn't have to re-download rule sets.
        context.filesDir.resolve("clash/cache.db").let { if (it.exists()) it.deleteRecursively() }

        prefs.edit().putString("last_run_version", currentVer).apply()
    }

    fun onPaymentSuccess() {
        viewModelScope.launch {
            // syncFromBackend re-imports the managed subscription (proprietary).
            AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
            refreshProfilesState()
            syncSubscriptionState()
            reloadProxyGroups(forceLoad = true)
            _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.sb_payment_success)))
        }
    }

    fun onVpnPermissionResult(granted: Boolean) {
        if (granted) startVpnService()
        else ClashState.setError("VPN permission denied")
    }

    /** Pull-to-refresh on Home: refresh the active profile's subscription. */
    fun refresh() {
        _loading.value = true
        ClashState.setError(null)
        viewModelScope.launch {
            AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
            if (ProfileStore.activeId(context) == null) {
                ClashState.setError(context.getString(R.string.error_no_active_profile))
                _loading.value = false
            } else {
                withContext(Dispatchers.IO) { ProfileManager.refreshActive(context) }
                _loading.value = false
                refreshProfilesState()
                syncSubscriptionState()
                reloadProxyGroups(forceLoad = true)
            }
        }
    }

    /** Onboarding / add-subscription dialog confirm: add [url] as a new profile. */
    fun importFromUrl(url: String) = addProfile(url)

    fun startVpnService() {
        ClashVpnService.start(context)
    }

    fun stopVpnService() {
        ClashVpnService.stop(context)
    }

    fun addProfile(url: String) {
        _showUrlDialog.value = false
        _urlDialogPrefill.value = ""
        _loading.value = true
        ClashState.setError(null)
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                AppDeps.subscriptionGateway.addProfile(context, url)
            }
            _loading.value = false
            result.onSuccess {
                _needsAuth.value = false
                refreshProfilesState()
                syncSubscriptionState()
                reloadProxyGroups(forceLoad = true)
            }.onFailure { ClashState.setError(context.getString(R.string.error_load_failed, it.message ?: "")) }
        }
    }

    /** Profiles tab: make [id] the active profile (restarts the tunnel if running). */
    fun switchProfile(id: String) {
        if (ProfileStore.activeId(context) == id) return
        viewModelScope.launch {
            withContext(Dispatchers.IO) { ProfileManager.switchTo(context, id) }
            refreshProfilesState()
            syncSubscriptionState()
            reloadProxyGroups(forceLoad = true)
        }
    }

    /** Profiles tab: delete a user profile. */
    fun removeProfile(id: String) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) { ProfileManager.remove(context, id) }
            refreshProfilesState()
            syncSubscriptionState()
            reloadProxyGroups(forceLoad = true)
        }
    }

    /** Profiles tab: manual refresh of a single profile. Managed profiles refresh
     *  via the backend sync; user profiles re-download their URL directly. */
    fun refreshProfile(id: String) {
        if (id in _refreshingProfiles.value) return
        viewModelScope.launch {
            _refreshingProfiles.value = _refreshingProfiles.value + id
            try {
                val managed = ProfileStore.get(context, id)?.managed == true
                val result = withContext(Dispatchers.IO) {
                    if (managed) AppDeps.subscriptionGateway.syncFromBackend(context)
                    else ProfileManager.refreshProfile(context, id)
                }
                result.onFailure {
                    _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.error_refresh_failed, it.message ?: "")))
                }
                refreshProfilesState()
                syncSubscriptionState()
                if (ProfileStore.activeId(context) == id) reloadProxyGroups(forceLoad = true)
            } finally {
                _refreshingProfiles.value = _refreshingProfiles.value - id
            }
        }
    }

    /** Routes an incoming deep link (parsed in MainScreen). */
    fun handleDeepLink(link: DeepLink) {
        when (link) {
            is DeepLink.Add -> {
                val claim = AppDeps.launchers.claimDeepLinkIntent(context, link.url)
                if (claim != null) {
                    // ClaimWizard is AuthActivity with extras — do not also open plain login.
                    _needsAuth.value = false
                    _pendingAuthReturn = true
                    _effects.tryEmit(MainEffect.LaunchIntent(claim))
                } else {
                    openUrlDialog(prefill = link.url)
                }
            }
            is DeepLink.Login -> {
                val intent = AppDeps.launchers.loginDeepLinkIntent(context, link.payload)
                if (intent != null) {
                    _needsAuth.value = false
                    _pendingAuthReturn = true
                    _effects.tryEmit(MainEffect.LaunchIntent(intent))
                }
                // else: unsupported (open / backend not ready) — silently ignore.
            }
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
            refreshProfilesState()
            _userEmail.value = null
            _needsAuth.value = true
        }
    }

    fun onAuthCompleted() {
        _needsAuth.value = false
        viewModelScope.launch {
            // Re-evaluate account state: after URL import (unregistered mode) the provider
            // was last bootstrapped as Anonymous (no config existed yet); now a config is on
            // disk, so re-bootstrap to pick up Unregistered/Authenticated.
            AppDeps.accountProvider.bootstrap(context)
            // Refresh profile state directly so the connect button enables.
            // In unregistered mode syncFromBackend fails ("No access token") and never
            // reaches handleSyncSuccess, so configName would otherwise stay null.
            refreshProfilesState()
            syncSubscriptionState()
            AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
                .onFailure { Log.e("Auth", "Failed to sync sub", it) }
        }
    }

    /** True when cancelling AuthActivity should close the app (nothing usable yet). */
    fun shouldExitOnAuthCancel(): Boolean {
        val isAuthed = AppDeps.accountProvider.state.value is AccountState.Authenticated
        return !isAuthed && !ConfigManager.hasConfig(context)
    }

    /**
     * After a claim/login AuthActivity started with startActivity returns to Main,
     * refresh account state if the user signed in / imported a config; otherwise
     * re-open the auth gate when the device still has nothing usable.
     */
    fun onMainResumed() {
        if (!_pendingAuthReturn) return
        _pendingAuthReturn = false
        viewModelScope.launch {
            AppDeps.accountProvider.bootstrap(context)
            val isAuthed = AppDeps.accountProvider.state.value is AccountState.Authenticated
            val hasConfig = ConfigManager.hasConfig(context)
            if (isAuthed || hasConfig) {
                onAuthCompleted()
            } else {
                _needsAuth.value = true
            }
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
                .onFailure { _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.error_generic, it.message ?: ""))) }
        }
    }

    fun linkByUrl(url: String, email: String) {
        viewModelScope.launch {
            _loading.value = true
            AppDeps.accountProvider.linkByUrl(context, url, email)
                .onSuccess {
                    AppDeps.subscriptionGateway.syncFromBackend(context).onSuccess { handleSyncSuccess() }
                    _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.sb_subscription_transferred)))
                    _effects.emit(MainEffect.CloseDialogs)
                }
                .onFailure { _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.error_generic, it.message ?: ""))) }
            _loading.value = false
        }
    }

    fun unlinkTelegram() {
        viewModelScope.launch {
            AppDeps.accountProvider.unlinkTelegram(context)
                .onSuccess {
                    _tgId.value = null
                    _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.sb_telegram_unlinked)))
                }
                .onFailure { _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.error_generic, it.message ?: ""))) }
        }
    }

    fun reloadProxyGroups(forceLoad: Boolean = false) {
        viewModelScope.launch {
            if (!ClashRemoteManager.connected.value) return@launch

            val result = withContext(Dispatchers.IO) {
                runCatching {
                    val activeDir = ProfileStore.activeDir(context)

                    // Check the current state of the core in the remote process
                    val coreNames = ClashRemoteManager.queryGroupNames(false)
                    val isRunning = ClashRemoteManager.isRunning()
                    val isAlreadyLoaded = coreNames.isNotEmpty() || isRunning

                    // If the core in another process is already running, no need to reinitialize it
                    val didReload = ConfigManager.hasConfig(context) &&
                            (!isClashLoaded && !isAlreadyLoaded || forceLoad)
                    if (didReload) {
                        ClashRemoteManager.loadConfig(activeDir.absolutePath)
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
                _effects.emit(MainEffect.ShowSnackbar(context.getString(R.string.sb_start_vpn_for_ping)))
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

    fun selectProxy(groupName: String, proxyName: String) {
        viewModelScope.launch {
            val ok = withContext(Dispatchers.IO) {
                ClashRemoteManager.patchSelector(groupName, proxyName)
            }
            if (ok) reloadProxyGroups()
        }
    }

    fun pingGroup(groupName: String) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                withTimeoutOrNull(5_000L) {
                    runCatching { ClashRemoteManager.healthCheck(groupName) }
                }
                kotlinx.coroutines.delay(2000)
                val existing = HashMap(ClashState.pings.value)
                ClashRemoteManager.queryGroup(groupName)?.let { group ->
                    group.proxies.forEach { p ->
                        existing[p.name] = if (p.delay in 1 until 65535) p.delay else -1
                    }
                }
                ClashState.setPings(existing)
            }
        }
    }

    fun pingProxy(groupName: String, proxyName: String) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                withTimeoutOrNull(5_000L) {
                    runCatching { ClashRemoteManager.healthCheck(proxyName) }
                }
                kotlinx.coroutines.delay(2000)
                ClashRemoteManager.queryGroup(groupName)?.let { group ->
                    val found = group.proxies.firstOrNull { it.name == proxyName }
                    if (found != null) {
                        val existing = HashMap(ClashState.pings.value)
                        existing[found.name] = if (found.delay in 1 until 65535) found.delay else -1
                        ClashState.setPings(existing)
                    }
                }
            }
        }
    }

    fun refreshShareInfo() {
        viewModelScope.launch {
            val info = withContext(Dispatchers.IO) {
                ConfigOverrideManager.readShareInfo(context)
            }
            _shareInfo.value = info
        }
    }

    fun toggleLocalProxy(enabled: Boolean) {
        viewModelScope.launch {
            withContext(Dispatchers.IO) {
                ConfigOverrideManager.setEnabled(context, LocalProxyOverride.id, enabled)
            }
            refreshShareInfo()
        }
    }
}
