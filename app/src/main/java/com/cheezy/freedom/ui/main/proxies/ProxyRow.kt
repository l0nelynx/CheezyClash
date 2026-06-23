@file:OptIn(androidx.compose.material3.ExperimentalMaterial3ExpressiveApi::class)

package com.cheezy.freedom.ui.main.proxies

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material3.CircularWavyProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@Composable
fun GroupHeader(
    item: ProxyListItem.Header,
    onToggle: () -> Unit,
    onPing: (() -> Unit)? = null,
    isPinging: Boolean = false,
) {
    val rotation by animateFloatAsState(if (item.isExpanded) 180f else 0f, label = "arrowRotation")

    Surface(
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clickable(onClick = onToggle)
                .padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            GroupIcon(item.iconResId)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "${item.proxiesCount} прокси · ${item.currentProxy.ifBlank { "—" }}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Medium
                )
            }
            if (onPing != null) {
                IconButton(
                    onClick = onPing,
                    enabled = !isPinging,
                    modifier = Modifier.size(40.dp)
                ) {
                    if (isPinging) {
                        CircularWavyProgressIndicator(modifier = Modifier.size(18.dp))
                    } else {
                        Icon(
                            Icons.Default.Speed,
                            contentDescription = "Ping group",
                            modifier = Modifier.size(22.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            Icon(
                imageVector = Icons.Default.KeyboardArrowDown,
                contentDescription = null,
                modifier = Modifier.rotate(rotation)
            )
        }
    }
}

@Composable
private fun GroupIcon(resId: Int) {
    if (resId != 0) {
        Image(
            painter = painterResource(resId),
            contentDescription = null,
            modifier = Modifier.size(28.dp),
            colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onSurfaceVariant)
        )
        Spacer(Modifier.width(12.dp))
    }
}

@Composable
fun ProxyRow(
    item: ProxyListItem.ProxyItem,
    onClick: () -> Unit,
    onPing: (() -> Unit)? = null,
    isPinging: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val pingColor = when {
        item.pingMs == null -> MaterialTheme.colorScheme.onSurfaceVariant
        item.pingMs <= 0 -> MaterialTheme.colorScheme.error
        item.pingMs < 500 -> Color(0xFF4CAF50)
        item.pingMs < 700 -> Color(0xFFFFA000)
        else -> MaterialTheme.colorScheme.error
    }

    Surface(
        color = if (item.isSelected) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                else Color.Transparent,
        modifier = modifier
    ) {
        ListItem(
            headlineContent = {
                Text(
                    text = item.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (item.isSelected) FontWeight.Bold else FontWeight.Normal,
                    color = if (item.isSelected) MaterialTheme.colorScheme.primary else Color.Unspecified
                )
            },
            supportingContent = {
                val sub = listOfNotNull(
                    item.type.takeIf { it.isNotBlank() },
                    item.subtitle.takeIf { it.isNotBlank() },
                ).joinToString(" · ")
                if (sub.isNotBlank()) {
                    Text(text = sub, style = MaterialTheme.typography.bodySmall)
                }
            },
            leadingContent = {
                RadioButton(selected = item.isSelected, onClick = onClick)
            },
            trailingContent = {
                when {
                    isPinging -> {
                        CircularWavyProgressIndicator(modifier = Modifier.size(16.dp))
                    }
                    onPing != null && item.pingMs == null -> {
                        Box(
                            modifier = Modifier
                                .clickable(onClick = onPing)
                                .padding(horizontal = 6.dp, vertical = 4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.Bolt,
                                contentDescription = "Ping proxy",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.55f)
                            )
                        }
                    }
                    else -> {
                        val delayText = when {
                            item.pingMs == null -> "—"
                            item.pingMs <= 0 -> "timeout"
                            else -> "${item.pingMs} ms"
                        }
                        Box(
                            modifier = if (onPing != null) {
                                Modifier
                                    .clickable(onClick = onPing)
                                    .padding(horizontal = 6.dp, vertical = 4.dp)
                            } else {
                                Modifier.padding(horizontal = 6.dp, vertical = 4.dp)
                            },
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = delayText,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = pingColor
                            )
                        }
                    }
                }
            },
            modifier = Modifier.clickable(onClick = onClick)
        )
    }
}
