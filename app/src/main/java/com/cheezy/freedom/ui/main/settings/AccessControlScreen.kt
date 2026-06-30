@file:OptIn(ExperimentalMaterial3Api::class)

package com.cheezy.freedom.ui.main.settings

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.material.icons.filled.Android
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VpnLock
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.viewmodel.compose.viewModel
import com.cheezy.freedom.R
import com.cheezy.freedom.clash.ClashState
import com.cheezy.freedom.clash.ClashVpnService

@Composable
fun AccessControlScreen(
    onDismiss: () -> Unit,
    viewModel: AccessControlViewModel = viewModel()
) {
    val context = LocalContext.current
    val overrideEnabled by viewModel.overrideEnabled.collectAsState()
    val vpnRunning by ClashState.running.collectAsState()
    val includeApps by viewModel.includeApps.collectAsState()
    val excludeApps by viewModel.excludeApps.collectAsState()
    val forceIncluded by viewModel.forceIncluded.collectAsState()
    val forceExcluded by viewModel.forceExcluded.collectAsState()
    val loading by viewModel.loading.collectAsState()

    var selectedTab by remember { mutableIntStateOf(0) }
    var searchQuery by remember { mutableStateOf("") }

    val currentList = if (selectedTab == 0) includeApps else excludeApps
    val filtered = remember(currentList, searchQuery) {
        if (searchQuery.isBlank()) currentList
        else currentList.filter { app ->
            app.label.contains(searchQuery, ignoreCase = true) ||
                app.packageName.contains(searchQuery, ignoreCase = true)
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Scaffold(
                topBar = {
                    TopAppBar(
                        title = { Text(stringResource(R.string.ac_title)) },
                        navigationIcon = {
                            IconButton(onClick = onDismiss) {
                                Icon(Icons.Default.Close, contentDescription = stringResource(R.string.ac_close))
                            }
                        }
                    )
                }
            ) { padding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                ) {
                    ListItem(
                        headlineContent = { Text(stringResource(R.string.ac_override_title)) },
                        supportingContent = { Text(stringResource(R.string.ac_override_subtitle)) },
                        trailingContent = {
                            Switch(
                                checked = overrideEnabled,
                                onCheckedChange = { viewModel.setOverrideEnabled(it) }
                            )
                        },
                        modifier = Modifier.clickable { viewModel.setOverrideEnabled(!overrideEnabled) }
                    )
                    HorizontalDivider()

                    if (vpnRunning && overrideEnabled) {
                        RestartBanner(onRestart = {
                            ClashVpnService.stop(context)
                            ClashVpnService.start(context)
                        })
                    }

                    if (!overrideEnabled) {
                        Box(
                            modifier = Modifier.fillMaxSize(),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(
                                horizontalAlignment = Alignment.CenterHorizontally,
                                modifier = Modifier.padding(32.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.VpnLock,
                                    contentDescription = null,
                                    modifier = Modifier.size(48.dp),
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.height(16.dp))
                                Text(
                                    stringResource(R.string.ac_enable_title),
                                    style = MaterialTheme.typography.titleSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    stringResource(R.string.ac_enable_subtitle),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    textAlign = TextAlign.Center
                                )
                            }
                        }
                        return@Scaffold
                    }

                    OutlinedTextField(
                        value = searchQuery,
                        onValueChange = { searchQuery = it },
                        placeholder = { Text(stringResource(R.string.ac_search_placeholder)) },
                        singleLine = true,
                        leadingIcon = {
                            Icon(Icons.Default.Search, contentDescription = null)
                        },
                        trailingIcon = if (searchQuery.isNotEmpty()) {
                            {
                                IconButton(onClick = { searchQuery = "" }) {
                                    Icon(Icons.Default.Clear, contentDescription = stringResource(R.string.ac_clear))
                                }
                            }
                        } else null,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    )

                    TabRow(selectedTabIndex = selectedTab) {
                        Tab(
                            selected = selectedTab == 0,
                            onClick = { selectedTab = 0 },
                            text = { Text(stringResource(R.string.ac_tab_include)) }
                        )
                        Tab(
                            selected = selectedTab == 1,
                            onClick = { selectedTab = 1 },
                            text = { Text(stringResource(R.string.ac_tab_exclude)) }
                        )
                    }

                    when {
                        loading -> {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                CircularProgressIndicator()
                            }
                        }

                        filtered.isEmpty() -> {
                            Box(
                                modifier = Modifier.fillMaxSize(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = if (currentList.isEmpty()) stringResource(R.string.ac_empty_none) else stringResource(R.string.ac_empty_no_match),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        else -> {
                            LazyColumn(modifier = Modifier.fillMaxSize()) {
                                items(filtered, key = { it.packageName }) { app ->
                                    val checked = if (selectedTab == 0) {
                                        app.packageName in forceIncluded
                                    } else {
                                        app.packageName in forceExcluded
                                    }
                                    AppListItem(
                                        app = app,
                                        checked = checked,
                                        onToggle = {
                                            if (selectedTab == 0) viewModel.toggleForceInclude(app.packageName)
                                            else viewModel.toggleForceExclude(app.packageName)
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RestartBanner(onRestart: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer,
            contentColor = MaterialTheme.colorScheme.onSecondaryContainer
        ),
        shape = MaterialTheme.shapes.large
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Text(
                text = stringResource(R.string.ac_restart_hint),
                style = MaterialTheme.typography.bodySmall,
                modifier = Modifier.weight(1f)
            )
            FilledTonalButton(
                onClick = onRestart,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(
                    horizontal = 12.dp, vertical = 6.dp
                )
            ) {
                Text(stringResource(R.string.ac_restart_action), style = MaterialTheme.typography.labelSmall)
            }
        }
    }
}

@Composable
private fun AppListItem(app: AppInfo, checked: Boolean, onToggle: () -> Unit) {
    ListItem(
        headlineContent = {
            Text(
                text = app.label,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        supportingContent = {
            Text(
                text = app.packageName,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        },
        leadingContent = {
            AppIcon(icon = app.icon, label = app.label)
        },
        trailingContent = {
            Checkbox(checked = checked, onCheckedChange = { onToggle() })
        },
        modifier = Modifier.clickable(onClick = onToggle)
    )
}

@Composable
private fun AppIcon(icon: ImageBitmap?, label: String) {
    if (icon != null) {
        Image(
            bitmap = icon,
            contentDescription = label,
            modifier = Modifier.size(40.dp)
        )
    } else {
        Icon(
            imageVector = Icons.Default.Android,
            contentDescription = null,
            modifier = Modifier.size(40.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
