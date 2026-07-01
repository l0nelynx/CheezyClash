package com.cheezy.freedom.ui.main.profiles

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.cheezy.freedom.R
import com.cheezy.freedom.account.AppDeps
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.Profile
import com.cheezy.freedom.ui.main.MainViewModel
import com.cheezy.freedom.util.formatBytes
import com.cheezy.freedom.util.formatExpire
import com.cheezy.freedom.util.formatLastUpdate

@Composable
fun ProfilesTab(viewModel: MainViewModel = viewModel()) {
    val profiles by viewModel.profiles.collectAsState()
    val activeId by viewModel.activeProfileId.collectAsState()
    val refreshing by viewModel.refreshingProfiles.collectAsState()
    // The active profile's live subscription (merged with backend snapshot in
    // proprietary) is richer than the copy stored on disk — use it for the active
    // row so its stats match the Home tab.
    val liveSub by ClashState.subscription.collectAsState()
    val canManage = AppDeps.accountProvider.supportsMultipleProfiles

    var pendingDelete by remember { mutableStateOf<Profile?>(null) }

    if (profiles.isEmpty()) {
        Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Text(
                text = stringResource(R.string.profiles_empty),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        return
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 4.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        items(profiles, key = { it.id }) { profile ->
            val isActive = profile.id == activeId
            ProfileCard(
                profile = profile,
                subscription = if (isActive) (liveSub ?: profile.subscription) else profile.subscription,
                isActive = isActive,
                isRefreshing = profile.id in refreshing,
                canDelete = canManage && !profile.managed,
                onSelect = { viewModel.switchProfile(profile.id) },
                onRefresh = { viewModel.refreshProfile(profile.id) },
                onDelete = { pendingDelete = profile }
            )
        }
    }

    pendingDelete?.let { target ->
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.profiles_delete)) },
            text = { Text(stringResource(R.string.profiles_delete_confirm, target.name)) },
            confirmButton = {
                androidx.compose.material3.TextButton(onClick = {
                    viewModel.removeProfile(target.id)
                    pendingDelete = null
                }) { Text(stringResource(R.string.profiles_delete)) }
            },
            dismissButton = {
                androidx.compose.material3.TextButton(onClick = { pendingDelete = null }) {
                    Text(stringResource(R.string.url_cancel))
                }
            }
        )
    }
}

@Composable
private fun ProfileCard(
    profile: Profile,
    subscription: com.cheezy.freedom.clash.SubscriptionInfo?,
    isActive: Boolean,
    isRefreshing: Boolean,
    canDelete: Boolean,
    onSelect: () -> Unit,
    onRefresh: () -> Unit,
    onDelete: () -> Unit,
) {
    val container =
        if (isActive) MaterialTheme.colorScheme.primaryContainer
        else MaterialTheme.colorScheme.surfaceContainerLow

    ElevatedCard(
        modifier = Modifier.fillMaxWidth().clickable(onClick = onSelect),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.elevatedCardColors(containerColor = container),
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = if (isActive) 3.dp else 0.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.Top,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = profile.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (profile.managed) ManagedBadge()
                }
                Spacer(Modifier.height(6.dp))
                ProfileStats(subscription = subscription, lastUpdateTime = profile.lastUpdateTime)
            }

            if (isRefreshing) {
                Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                }
            } else {
                ProfileMenu(canDelete = canDelete, onRefresh = onRefresh, onDelete = onDelete)
            }
        }
    }
}

@Composable
private fun ProfileMenu(
    canDelete: Boolean,
    onRefresh: () -> Unit,
    onDelete: () -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { expanded = true }) {
            Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.profiles_menu))
        }
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.profiles_refresh)) },
                leadingIcon = { Icon(Icons.Default.Refresh, contentDescription = null) },
                onClick = { expanded = false; onRefresh() }
            )
            if (canDelete) {
                DropdownMenuItem(
                    text = { Text(stringResource(R.string.profiles_delete)) },
                    leadingIcon = {
                        Icon(
                            Icons.Default.Delete,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.error
                        )
                    },
                    onClick = { expanded = false; onDelete() }
                )
            }
        }
    }
}

@Composable
private fun ProfileStats(
    subscription: com.cheezy.freedom.clash.SubscriptionInfo?,
    lastUpdateTime: Long,
) {
    val sub = subscription
    val used = sub?.let { it.upload + it.download } ?: 0L

    // Traffic. Some plans expose a total (limit), others only count usage (total=0)
    // with the real cap living in the announce text. Show used / limit when a limit
    // exists, otherwise just the used amount — never hide usage.
    val trafficLabel: String
    val trafficValue: String?
    when {
        sub == null -> { trafficLabel = ""; trafficValue = null }
        sub.total > 0 -> {
            trafficLabel = stringResource(R.string.profiles_stat_traffic)
            trafficValue = "${formatBytes(used)} / ${formatBytes(sub.total)}"
        }
        used > 0 -> {
            trafficLabel = stringResource(R.string.profiles_stat_used)
            trafficValue = formatBytes(used)
        }
        else -> { trafficLabel = ""; trafficValue = null }
    }
    // Expiry (only for time-limited plans)
    val expireValue = sub?.expire?.takeIf { it > 0 }?.let { formatExpire(it) }
    // Last updated
    val updatedValue = lastUpdateTime.takeIf { it > 0 }?.let { formatLastUpdate(it) }

    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        trafficValue?.let { StatLine(trafficLabel, it) }
        expireValue?.let { StatLine(stringResource(R.string.profiles_stat_expires), it) }
        updatedValue?.let { StatLine(stringResource(R.string.profiles_stat_updated), it) }
    }
}

@Composable
private fun StatLine(label: String, value: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun ManagedBadge() {
    Surface(
        shape = RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.secondaryContainer
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Icon(
                Icons.Default.CloudDone,
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = MaterialTheme.colorScheme.onSecondaryContainer
            )
            Text(
                text = stringResource(R.string.profiles_managed_badge),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSecondaryContainer
            )
        }
    }
}
