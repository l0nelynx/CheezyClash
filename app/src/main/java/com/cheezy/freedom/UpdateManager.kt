package com.cheezy.freedom

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

object UpdateManager {
    private const val REPO = "l0nelynx/CheezyClash"
    private const val API_URL = "https://api.github.com/repos/$REPO/releases/latest"
    private const val PREFS = "cheezy.updates"
    private const val KEY_ID = "download_id"
    private const val KEY_VER = "download_ver"

    val isEnabled: Boolean = BuildConfig.DISTRIBUTION_TYPE != "GPLAY"

    private val json = Json { ignoreUnknownKeys = true }

    data class UpdateInfo(
        val version: String,
        val downloadUrl: String,
        val isNewer: Boolean
    )

    enum class DownloadStatus {
        NOT_STARTED, DOWNLOADING, DOWNLOADED
    }

    suspend fun checkUpdate(): UpdateInfo? = withContext(Dispatchers.IO) {
        if (!isEnabled) return@withContext null
        runCatching {
            val conn = (URL(API_URL).openConnection() as HttpURLConnection).apply {
                connectTimeout = 10000
                readTimeout = 10000
                setRequestProperty("Accept", "application/vnd.github.v3+json")
            }

            val response = conn.inputStream.bufferedReader().use { it.readText() }
            val root = json.parseToJsonElement(response).jsonObject
            val tagName = root["tag_name"]?.jsonPrimitive?.content?.removePrefix("v")?.split('-')?.first() ?: return@runCatching null
            
            val assets = root["assets"]?.jsonArray?.map { it.jsonObject } ?: return@runCatching null
            val abi = android.os.Build.SUPPORTED_ABIS.firstOrNull() ?: ""
            
            val asset = assets.firstOrNull { 
                val name = it["name"]?.jsonPrimitive?.content?.lowercase() ?: ""
                name.endsWith(".apk") && name.contains(abi.lowercase())
            } ?: assets.firstOrNull {
                val name = it["name"]?.jsonPrimitive?.content?.lowercase() ?: ""
                name.endsWith(".apk") && name.contains("universal")
            } ?: assets.firstOrNull {
                it["name"]?.jsonPrimitive?.content?.endsWith(".apk") == true
            } ?: return@runCatching null
            
            val downloadUrl = asset["browser_download_url"]?.jsonPrimitive?.content ?: return@runCatching null
            
            // Strip architecture suffixes from the current version before comparison
            val currentVersion = BuildConfig.VERSION_NAME.split('-').first()

            UpdateInfo(
                version = tagName,
                downloadUrl = downloadUrl,
                isNewer = isNewerVersion(tagName, currentVersion)
            )
        }.getOrNull()
    }

    private fun isNewerVersion(new: String, current: String): Boolean {
        val newParts = new.split('.').mapNotNull { it.toIntOrNull() }
        val curParts = current.split('.').mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(newParts.size, curParts.size)) {
            val n = newParts.getOrNull(i) ?: 0
            val c = curParts.getOrNull(i) ?: 0
            if (n > c) return true
            if (n < c) return false
        }
        return false
    }

    fun getDownloadStatus(context: Context, version: String): DownloadStatus {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val savedVer = prefs.getString(KEY_VER, null)
        if (savedVer != version) return DownloadStatus.NOT_STARTED

        val id = prefs.getLong(KEY_ID, -1L)
        if (id == -1L) return DownloadStatus.NOT_STARTED

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val query = DownloadManager.Query().setFilterById(id)
        val cursor = runCatching { dm.query(query) }.getOrNull() ?: return DownloadStatus.NOT_STARTED
        
        try {
            if (cursor.moveToFirst()) {
                val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
                return when (status) {
                    DownloadManager.STATUS_SUCCESSFUL -> {
                        if (getUpdateFile(context).exists()) DownloadStatus.DOWNLOADED 
                        else DownloadStatus.NOT_STARTED
                    }
                    DownloadManager.STATUS_RUNNING, DownloadManager.STATUS_PENDING -> DownloadStatus.DOWNLOADING
                    else -> DownloadStatus.NOT_STARTED
                }
            }
        } finally {
            cursor.close()
        }
        return DownloadStatus.NOT_STARTED
    }

    fun downloadAndInstall(context: Context, info: UpdateInfo) {
        val file = getUpdateFile(context)
        if (file.exists()) file.delete()

        val request = DownloadManager.Request(Uri.parse(info.downloadUrl)).apply {
            setTitle("CheezyVPN ${info.version}")
            setDescription("Загрузка обновления...")
            setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            setDestinationUri(Uri.fromFile(file))
        }

        val dm = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        val id = dm.enqueue(request)

        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putLong(KEY_ID, id)
            .putString(KEY_VER, info.version)
            .apply()
    }

    fun installApk(context: Context) {
        val file = getUpdateFile(context)
        if (!file.exists()) return

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    private fun getUpdateFile(context: Context): File {
        return File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update.apk")
    }
}
