package com.cheezy.freedom.ui.main.settings

import android.app.Application
import android.content.Intent
import android.content.pm.PackageManager
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.core.graphics.drawable.toBitmap
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.cheezy.freedom.clash.ConfigManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

data class AppInfo(
    val packageName: String,
    val label: String,
    val icon: ImageBitmap?,
)

class AccessControlViewModel(app: Application) : AndroidViewModel(app) {

    private val context get() = getApplication<Application>()

    private val _overrideEnabled = MutableStateFlow(ConfigManager.isAccessControlEnabled(context))
    val overrideEnabled: StateFlow<Boolean> = _overrideEnabled

    // Tab "Включить в VPN": config-excluded apps that are installed on the device.
    // User checks them to force-include (bring back into the tunnel).
    private val _includeApps = MutableStateFlow<List<AppInfo>>(emptyList())
    val includeApps: StateFlow<List<AppInfo>> = _includeApps

    // Tab "Исключить из VPN": all launcher apps NOT in the config's exclude list.
    // User checks them to force-exclude (remove from the tunnel).
    private val _excludeApps = MutableStateFlow<List<AppInfo>>(emptyList())
    val excludeApps: StateFlow<List<AppInfo>> = _excludeApps

    private val _forceIncluded = MutableStateFlow(ConfigManager.getUserForceIncluded(context))
    val forceIncluded: StateFlow<Set<String>> = _forceIncluded

    private val _forceExcluded = MutableStateFlow(ConfigManager.getUserForceExcluded(context))
    val forceExcluded: StateFlow<Set<String>> = _forceExcluded

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading

    init {
        loadApps()
    }

    private fun loadApps() = viewModelScope.launch(Dispatchers.IO) {
        _loading.value = true
        val pm = context.packageManager

        @Suppress("DEPRECATION")
        val launcherPackages = pm
            .queryIntentActivities(
                Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0
            )
            .map { it.activityInfo.packageName }
            .toSet()

        val configExcluded = ConfigManager.readExcludePackages(context).toSet()

        fun loadInfo(pkg: String): AppInfo? = runCatching {
            val info = pm.getApplicationInfo(pkg, 0)
            AppInfo(
                packageName = pkg,
                label = pm.getApplicationLabel(info).toString(),
                icon = pm.getApplicationIcon(pkg).toBitmap(128, 128).asImageBitmap()
            )
        }.getOrNull()

        _includeApps.value = configExcluded
            .mapNotNull { loadInfo(it) }
            .sortedBy { it.label.lowercase() }

        _excludeApps.value = (launcherPackages - configExcluded)
            .mapNotNull { loadInfo(it) }
            .sortedBy { it.label.lowercase() }

        _loading.value = false
    }

    fun setOverrideEnabled(enabled: Boolean) {
        _overrideEnabled.value = enabled
        ConfigManager.setAccessControlEnabled(context, enabled)
    }

    fun toggleForceInclude(pkg: String) {
        val updated = _forceIncluded.value.toMutableSet()
        if (!updated.add(pkg)) updated.remove(pkg)
        _forceIncluded.value = updated
        ConfigManager.saveUserForceIncluded(context, updated)
    }

    fun toggleForceExclude(pkg: String) {
        val updated = _forceExcluded.value.toMutableSet()
        if (!updated.add(pkg)) updated.remove(pkg)
        _forceExcluded.value = updated
        ConfigManager.saveUserForceExcluded(context, updated)
    }
}
