package com.cheezy.freedom

import android.os.Bundle
import android.os.Process
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDownward
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.FilterList
import androidx.compose.material.icons.filled.VerticalAlignBottom
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cheezy.freedom.clash.ClashRemoteManager
import com.cheezy.freedom.ui.theme.CheezyVPNTheme
import com.github.kr328.clash.core.model.LogMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LogsActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CheezyVPNTheme {
                LogsScreen()
            }
        }
    }
}

private const val MAX_LOG_LINES = 1000

enum class LogSource(val displayName: String) {
    CORE("Ядро"),
    SYSTEM("Система (ClashMeta)"),
    APP("Приложение (All)")
}

data class LogEntry(
    val level: LogMessage.Level,
    val message: String,
    val source: LogSource,
    val tag: String = "",
    val time: String = ""
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LogsScreen() {
    var selectedSource by remember { mutableStateOf(LogSource.CORE) }
    var minLevel by remember { mutableStateOf(LogMessage.Level.Debug) }
    
    val coreLogs = remember { mutableStateListOf<LogEntry>() }
    val systemLogs = remember { mutableStateListOf<LogEntry>() }
    val appLogs = remember { mutableStateListOf<LogEntry>() }
    
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    var autoScroll by remember { mutableStateOf(true) }

    // Subscribe to Core Logs
    LaunchedEffect(Unit) {
        ClashRemoteManager.subscribeLogcat().collect { msg ->
            val cleanMessage = msg.message.stripPrivacyInfo()
            coreLogs.add(LogEntry(msg.level, cleanMessage, LogSource.CORE))
            if (coreLogs.size > MAX_LOG_LINES) coreLogs.removeAt(0)
        }
    }

    // Subscribe to System Logcat (includes ClashMetaForAndroid and App logs)
    LaunchedEffect(Unit) {
        withContext(Dispatchers.IO) {
            val myPid = Process.myPid()
            // Using -T 1 to get only new logs and keep pipe open
            val process = Runtime.getRuntime().exec(arrayOf("logcat", "-v", "time", "-T", "1", "--pid=$myPid", "*:V"))
            val reader = process.inputStream.bufferedReader()
            try {
                while (isActive) {
                    val line = reader.readLine() ?: break
                    val entry = parseLogcatLine(line) ?: continue
                    
                    val cleanEntry = entry.copy(message = entry.message.stripPrivacyInfo())
                    
                    withContext(Dispatchers.Main) {
                        if (cleanEntry.tag.contains("ClashMetaForAndroid", ignoreCase = true)) {
                            systemLogs.add(cleanEntry.copy(source = LogSource.SYSTEM))
                            if (systemLogs.size > MAX_LOG_LINES) systemLogs.removeAt(0)
                        }
                        
                        appLogs.add(cleanEntry.copy(source = LogSource.APP))
                        if (appLogs.size > MAX_LOG_LINES) appLogs.removeAt(0)
                    }
                }
            } finally {
                process.destroy()
            }
        }
    }

    val filteredLogs = remember(selectedSource, minLevel, coreLogs.size, systemLogs.size, appLogs.size) {
        val sourceList = when (selectedSource) {
            LogSource.CORE -> coreLogs
            LogSource.SYSTEM -> systemLogs
            LogSource.APP -> appLogs
        }
        sourceList.filter { it.level.ordinal >= minLevel.ordinal }
    }

    // Scroll to bottom when new logs arrive if autoScroll is enabled
    LaunchedEffect(filteredLogs.size) {
        if (autoScroll && filteredLogs.isNotEmpty()) {
            listState.scrollToItem(filteredLogs.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Логи") },
                actions = {
                    IconButton(onClick = { autoScroll = !autoScroll }) {
                        Icon(
                            imageVector = Icons.Default.VerticalAlignBottom,
                            contentDescription = "Автоскролл",
                            tint = if (autoScroll) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = {
                        coreLogs.clear()
                        systemLogs.clear()
                        appLogs.clear()
                    }) {
                        Icon(Icons.Default.Clear, "Очистить")
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            // Source Selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                LogSource.entries.forEach { source ->
                    FilterChip(
                        selected = selectedSource == source,
                        onClick = { selectedSource = source },
                        label = { Text(source.displayName) }
                    )
                }
            }

            // Level Selector
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 8.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    LogMessage.Level.Debug,
                    LogMessage.Level.Info,
                    LogMessage.Level.Warning,
                    LogMessage.Level.Error
                ).forEach { level ->
                    FilterChip(
                        selected = minLevel == level,
                        onClick = { minLevel = level },
                        label = { Text(level.name.uppercase()) }
                    )
                }
            }

            Box(modifier = Modifier.weight(1f)) {
                if (filteredLogs.isEmpty()) {
                    Text(
                        text = "Логи отсутствуют для данных фильтров",
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        items(filteredLogs) { entry ->
                            LogItemRow(entry)
                        }
                    }

                    // Auto-scroll button
                    Box(modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
                        androidx.compose.animation.AnimatedVisibility(
                            visible = listState.canScrollForward,
                            enter = fadeIn(),
                            exit = fadeOut()
                        ) {
                            FloatingActionButton(
                                onClick = {
                                    autoScroll = true
                                    scope.launch {
                                        if (filteredLogs.isNotEmpty()) {
                                            listState.animateScrollToItem(filteredLogs.size - 1)
                                        }
                                    }
                                },
                                containerColor = MaterialTheme.colorScheme.primaryContainer,
                                contentColor = MaterialTheme.colorScheme.onPrimaryContainer,
                                modifier = Modifier.size(48.dp)
                            ) {
                                Icon(Icons.Default.ArrowDownward, "Вниз")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LogItemRow(entry: LogEntry) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                colorFor(entry.level).copy(alpha = 0.05f),
                RoundedCornerShape(4.dp)
            )
            .padding(4.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = entry.level.name.uppercase(),
                color = colorFor(entry.level),
                fontWeight = FontWeight.Bold,
                fontSize = 10.sp,
                modifier = Modifier
                    .background(colorFor(entry.level).copy(alpha = 0.2f), RoundedCornerShape(2.dp))
                    .padding(horizontal = 4.dp, vertical = 1.dp)
            )
            if (entry.time.isNotBlank()) {
                Spacer(Modifier.width(4.dp))
                Text(entry.time, fontSize = 10.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (entry.tag.isNotBlank()) {
                Spacer(Modifier.width(4.dp))
                Text(entry.tag, fontSize = 10.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.primary)
            }
        }
        Text(
            text = entry.message,
            color = MaterialTheme.colorScheme.onSurface,
            fontFamily = FontFamily.Monospace,
            fontSize = 11.sp,
            lineHeight = 14.sp
        )
    }
}

private fun String.stripPrivacyInfo(): String {
    return this.replace(Regex("""https?://[^\s'"]+"""), "<url>")
        .replace(Regex("""\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"""), "<ip>")
}

private fun parseLogcatLine(line: String): LogEntry? {
    // Basic logcat parser for "-v time" format: 
    // "05-08 17:06:53.882 D/Tag(PID): Message"
    try {
        if (line.length < 20) return null
        val time = line.substring(0, 18)
        val rest = line.substring(19)
        val levelChar = rest.firstOrNull() ?: return null
        val level = when (levelChar) {
            'D' -> LogMessage.Level.Debug
            'I' -> LogMessage.Level.Info
            'W' -> LogMessage.Level.Warning
            'E' -> LogMessage.Level.Error
            else -> LogMessage.Level.Debug
        }
        
        val tagEnd = rest.indexOf(':')
        if (tagEnd == -1) return LogEntry(level, line, LogSource.APP, time = time)
        
        val tag = rest.substring(2, tagEnd).trim()
        val message = rest.substring(tagEnd + 1).trim()
        
        return LogEntry(level, message, LogSource.APP, tag, time)
    } catch (e: Exception) {
        return LogEntry(LogMessage.Level.Debug, line, LogSource.APP)
    }
}

private fun colorFor(level: LogMessage.Level): Color = when (level) {
    LogMessage.Level.Error -> Color(0xFFE53935)
    LogMessage.Level.Warning -> Color(0xFFFB8C00)
    LogMessage.Level.Info -> Color(0xFF1E88E5)
    LogMessage.Level.Debug -> Color(0xFF6A1B9A)
    else -> Color.Gray
}

