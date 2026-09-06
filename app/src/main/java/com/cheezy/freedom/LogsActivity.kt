package com.cheezy.freedom

import android.os.Bundle
import android.content.Intent
import androidx.core.content.FileProvider
import androidx.compose.ui.platform.LocalContext
import androidx.compose.material.icons.filled.Share
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
import androidx.compose.ui.res.stringResource
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
import kotlinx.coroutines.flow.flowOn
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.foundation.interaction.DragInteraction
import java.util.concurrent.atomic.AtomicLong

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
private val logSequence = AtomicLong()

enum class LogSource(@androidx.annotation.StringRes val labelRes: Int) {
    CORE(R.string.logs_filter_core),
    SYSTEM(R.string.logs_filter_system),
    APP(R.string.logs_filter_app)
}

data class LogEntry(
    val level: LogMessage.Level,
    val message: String,
    val source: LogSource,
    val tag: String = "",
    val time: String = "",
    val id: Long = logSequence.incrementAndGet(),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LogsScreen() {
    val context = LocalContext.current
    val exportTitle = stringResource(R.string.logs_export)
    var search by remember { mutableStateOf("") }
    var exporting by remember { mutableStateOf(false) }
    var selectedSource by remember { mutableStateOf(LogSource.CORE) }
    var minLevel by remember { mutableStateOf(LogMessage.Level.Debug) }
    
    val coreLogs = remember { mutableStateListOf<LogEntry>() }
    val systemLogs = remember { mutableStateListOf<LogEntry>() }
    val appLogs = remember { mutableStateListOf<LogEntry>() }
    
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var autoScroll by remember { mutableStateOf(true) }

    LaunchedEffect(lifecycle) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
            launch {
                ClashRemoteManager.subscribeLogcat().collect { msg ->
                    coreLogs.add(LogEntry(msg.level, msg.message.stripPrivacyInfo(), LogSource.CORE))
                    if (coreLogs.size > MAX_LOG_LINES) coreLogs.removeAt(0)
                }
            }
            launch {
                systemLogLines().collect { line ->
                    val entry = parseLogcatLine(line) ?: return@collect
                    val clean = entry.copy(message = entry.message.stripPrivacyInfo())
                    if (clean.tag.contains("ClashMetaForAndroid", ignoreCase = true)) {
                        systemLogs.add(clean.copy(source = LogSource.SYSTEM))
                        if (systemLogs.size > MAX_LOG_LINES) systemLogs.removeAt(0)
                    }
                    appLogs.add(clean.copy(source = LogSource.APP))
                    if (appLogs.size > MAX_LOG_LINES) appLogs.removeAt(0)
                }
            }
        }
    }

    val liveLogs by remember {
        derivedStateOf {
            when (selectedSource) {
                LogSource.CORE -> coreLogs
                LogSource.SYSTEM -> systemLogs
                LogSource.APP -> appLogs
            }.filter { it.level.ordinal >= minLevel.ordinal }
        }
    }
    var pausedLogs by remember { mutableStateOf<List<LogEntry>?>(null) }
    LaunchedEffect(autoScroll) { pausedLogs = if (autoScroll) null else liveLogs.toList() }
    LaunchedEffect(selectedSource, minLevel) { pausedLogs = null; autoScroll = true }
    LaunchedEffect(listState) {
        listState.interactionSource.interactions.collect {
            if (it is DragInteraction.Start) autoScroll = false
        }
    }
    val filteredLogs = (pausedLogs ?: liveLogs).filter { it.message.contains(search, true) || it.tag.contains(search, true) }
    LaunchedEffect(filteredLogs.lastOrNull()?.id, autoScroll) {
        if (autoScroll && filteredLogs.isNotEmpty()) listState.scrollToItem(filteredLogs.lastIndex)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.title_logs)) },
                actions = {
                    IconButton(enabled = !exporting && filteredLogs.isNotEmpty(), onClick = {
                        val snapshot = filteredLogs.toList()
                        exporting = true
                        scope.launch {
                            try {
                                val uri = withContext(Dispatchers.IO) {
                                    val dir = context.cacheDir.resolve("log-exports").apply { mkdirs() }
                                    dir.listFiles()?.filter { System.currentTimeMillis() - it.lastModified() > 86_400_000 }?.forEach { it.delete() }
                                    val file = java.io.File.createTempFile("logs-", ".txt", dir)
                                    file.writeText(snapshot.joinToString("\n") { "${it.time} ${it.level} ${it.tag}: ${it.message}" }.stripPrivacyInfo())
                                    FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                                }
                                val intent = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_STREAM, uri)
                                    clipData = android.content.ClipData.newRawUri("Logs", uri)
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                context.startActivity(Intent.createChooser(intent, exportTitle))
                            } catch (error: Exception) {
                                if (error is kotlinx.coroutines.CancellationException) throw error
                                android.widget.Toast.makeText(context, R.string.logs_export_failed, android.widget.Toast.LENGTH_LONG).show()
                            } finally { exporting = false }
                        }
                    }) { Icon(Icons.Default.Share, stringResource(R.string.logs_export)) }
                    IconButton(onClick = { autoScroll = !autoScroll }) {
                        Icon(
                            imageVector = Icons.Default.VerticalAlignBottom,
                            contentDescription = stringResource(R.string.logs_autoscroll),
                            tint = if (autoScroll) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    IconButton(onClick = {
                        pausedLogs = null
                        coreLogs.clear()
                        systemLogs.clear()
                        appLogs.clear()
                    }) {
                        Icon(Icons.Default.Clear, stringResource(R.string.logs_clear))
                    }
                }
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            OutlinedTextField(value = search, onValueChange = { search = it }, singleLine = true,
                label = { Text(stringResource(R.string.logs_search)) }, modifier = Modifier.fillMaxWidth().padding(8.dp))
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
                        label = { Text(stringResource(source.labelRes)) }
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
                        text = stringResource(R.string.logs_empty),
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize().padding(horizontal = 8.dp),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        items(filteredLogs, key = { it.id }) { entry ->
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
                                Icon(Icons.Default.ArrowDownward, stringResource(R.string.logs_scroll_down))
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Destroying the process unblocks readLine even when logcat is completely idle. */
private fun systemLogLines(): Flow<String> = callbackFlow {
    val process = Runtime.getRuntime().exec(arrayOf("logcat", "-v", "time", "-T", "1", "--pid=${Process.myPid()}", "*:V"))
    val reader = launch(Dispatchers.IO) {
        try {
            process.inputStream.bufferedReader().use { input ->
                while (isActive) { val line = input.readLine() ?: break; trySend(line) }
            }
        } catch (_: java.io.IOException) { /* Process closed on lifecycle stop. */ }
        finally { close() }
    }
    awaitClose { process.destroy(); reader.cancel() }
}.flowOn(Dispatchers.IO)

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

private fun String.stripPrivacyInfo(): String = LogPrivacy.redact(this)

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

