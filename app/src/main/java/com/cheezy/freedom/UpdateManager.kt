package com.cheezy.freedom

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Environment
import android.util.Log
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
    private val REPO = if (BuildConfig.EDITION == "OPEN") {
        "l0nelynx/CheezyClash"
    } else {
        "l0nelynx/CheezyVPN-Releases"
    }
    private val API_URL = "https://api.github.com/repos/$REPO/releases/latest"
    private const val PREFS = "cheezy.updates"
    private const val KEY_ID = "download_id"
    private const val KEY_VER = "download_ver"
    private const val TAG = "UpdateManager"

    private val ALLOWED_DOWNLOAD_HOSTS = setOf(
        "github.com",
        "objects.githubusercontent.com",
        "release-assets.githubusercontent.com",
    )

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
            if (!isTrustedDownloadUrl(downloadUrl)) {
                Log.w(TAG, "Rejecting untrusted download URL host")
                return@runCatching null
            }

            val currentVersion = BuildConfig.VERSION_NAME.split('-').first()

            UpdateInfo(
                version = tagName,
                downloadUrl = downloadUrl,
                isNewer = isNewerVersion(tagName, currentVersion)
            )
        }.getOrNull()
    }

    /** Public for unit tests. */
    internal fun isNewerVersion(new: String, current: String): Boolean {
        val newParts = new.removePrefix("v").split('.').mapNotNull { it.toIntOrNull() }
        val curParts = current.removePrefix("v").split('.').mapNotNull { it.toIntOrNull() }
        for (i in 0 until maxOf(newParts.size, curParts.size)) {
            val n = newParts.getOrNull(i) ?: 0
            val c = curParts.getOrNull(i) ?: 0
            if (n > c) return true
            if (n < c) return false
        }
        return false
    }

    internal fun isTrustedDownloadUrl(url: String): Boolean {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return false
        if (uri.scheme?.equals("https", ignoreCase = true) != true) return false
        val host = uri.host?.lowercase() ?: return false
        return host in ALLOWED_DOWNLOAD_HOSTS || host.endsWith(".githubusercontent.com")
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
        if (!isTrustedDownloadUrl(info.downloadUrl)) {
            Log.w(TAG, "Refusing to download from untrusted URL")
            return
        }
        val file = getUpdateFile(context)
        if (file.exists()) file.delete()

        val request = DownloadManager.Request(Uri.parse(info.downloadUrl)).apply {
            setTitle("${context.getString(R.string.app_name)} ${info.version}")
            setDescription(context.getString(R.string.update_notification_desc))
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

        if (!verifyApkSignature(context, file)) {
            Log.e(TAG, "Downloaded APK signature does not match installed app — refusing install")
            file.delete()
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
            return
        }

        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, "application/vnd.android.package-archive")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    /**
     * Returns true when [apkFile] is signed with the same certificate(s) as the
     * currently installed app. Rejects missing/unsigned archives.
     */
    internal fun verifyApkSignature(context: Context, apkFile: File): Boolean {
        return runCatching {
            val pm = context.packageManager
            @Suppress("DEPRECATION")
            val archiveInfo = if (android.os.Build.VERSION.SDK_INT >= 28) {
                pm.getPackageArchiveInfo(
                    apkFile.absolutePath,
                    PackageManager.GET_SIGNING_CERTIFICATES
                )
            } else {
                pm.getPackageArchiveInfo(apkFile.absolutePath, PackageManager.GET_SIGNATURES)
            } ?: return false

            val apkSigs = signaturesOf(archiveInfo) ?: return false
            val installed = if (android.os.Build.VERSION.SDK_INT >= 28) {
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                @Suppress("DEPRECATION")
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
            }
            val appSigs = signaturesOf(installed) ?: return false
            apkSigs.isNotEmpty() && apkSigs.contentEquals(appSigs)
        }.getOrDefault(false)
    }

    private fun signaturesOf(info: android.content.pm.PackageInfo): Array<android.content.pm.Signature>? {
        return if (android.os.Build.VERSION.SDK_INT >= 28) {
            val signingInfo = info.signingInfo ?: return null
            if (signingInfo.hasMultipleSigners()) {
                signingInfo.apkContentsSigners
            } else {
                signingInfo.signingCertificateHistory
            }
        } else {
            @Suppress("DEPRECATION")
            info.signatures
        }
    }

    private fun getUpdateFile(context: Context): File {
        return File(context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "update.apk")
    }
}
