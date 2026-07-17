package com.cheezy.freedom.clash

import java.util.Base64
import org.yaml.snakeyaml.Yaml
import java.io.File

/**
 * Pure YAML / header parsers extracted from [ConfigManager] for unit testing
 * and to keep I/O-facing code thinner.
 */
object ConfigYamlParsers {

    fun parseFilename(header: String?): String? {
        if (header.isNullOrBlank()) return null
        val match = Regex("""filename\*?=(?:UTF-8'')?"?([^";]+)"?""", RegexOption.IGNORE_CASE).find(header)
        return match?.groupValues?.get(1)?.trim()?.takeIf { it.isNotBlank() }
    }

    fun decodeMaybeBase64(value: String?): String? {
        if (value.isNullOrBlank()) return null
        if (!value.startsWith("base64:")) return value
        val payload = value.removePrefix("base64:").trim()
        return runCatching {
            String(Base64.getDecoder().decode(payload), Charsets.UTF_8)
        }.getOrElse { value }
    }

    fun mergeUserInfo(info: SubscriptionInfo, header: String?): SubscriptionInfo {
        if (header.isNullOrBlank()) return info
        val parts = header.split(';').mapNotNull {
            val kv = it.trim().split('=', limit = 2)
            if (kv.size == 2) kv[0].trim().lowercase() to kv[1].trim() else null
        }.toMap()
        return info.copy(
            upload = parts["upload"]?.toLongOrNull() ?: 0,
            download = parts["download"]?.toLongOrNull() ?: 0,
            total = parts["total"]?.toLongOrNull() ?: 0,
            expire = parts["expire"]?.toLongOrNull() ?: 0,
        )
    }

    fun loadConfigMap(configFile: File): Map<String, Any?>? {
        if (!configFile.exists()) return null
        @Suppress("UNCHECKED_CAST")
        return runCatching {
            Yaml().load<Any>(configFile.readText()) as? Map<String, Any?>
        }.getOrNull()
    }

    fun readTunStack(dir: File): String? {
        val config = loadConfigMap(dir.resolve("config.yaml")) ?: return null
        val tun = config["tun"] as? Map<*, *> ?: return null
        return tun["stack"]?.toString()?.trim('"', '\'')
    }

    fun readFakeIpRange(configFile: File): String? {
        val config = loadConfigMap(configFile) ?: return null
        val dns = config["dns"] as? Map<*, *> ?: return null
        return dns["fake-ip-range"]?.toString()?.trim('"', '\'')
    }

    fun readGroupIcons(configFile: File): Map<String, String> {
        if (!configFile.exists()) return emptyMap()
        return runCatching {
            @Suppress("UNCHECKED_CAST")
            val yaml = Yaml().load<Any>(configFile.readText()) as? Map<String, Any?> ?: return emptyMap()
            val groups = yaml["proxy-groups"] as? List<Any?> ?: return emptyMap()
            val result = LinkedHashMap<String, String>()
            for (item in groups) {
                val map = item as? Map<*, *> ?: continue
                val name = map["name"]?.toString() ?: continue
                val icon = map["icon-cheezy"]?.toString() ?: continue
                val resName = icon.removePrefix("@drawable/").trim()
                if (resName.isNotBlank()) result[name] = resName
            }
            result
        }.getOrDefault(emptyMap())
    }

    fun readExcludePackages(dir: File): List<String> {
        val config = loadConfigMap(dir.resolve("config.yaml")) ?: return emptyList()
        val tun = config["tun"] as? Map<*, *> ?: return emptyList()
        val list = tun["exclude-package"] as? List<*> ?: return emptyList()
        return list.mapNotNull { it?.toString()?.trim('"', '\'') }
    }

    /**
     * Pure access-control set math: start from [base], remove [forceIncluded],
     * add [forceExcluded]. When [enabled] is false, returns [base] unchanged.
     */
    fun computeEffectiveExcludePackages(
        base: Collection<String>,
        enabled: Boolean,
        forceIncluded: Set<String>,
        forceExcluded: Set<String>,
    ): List<String> {
        if (!enabled) return base.toList()
        return (base.toMutableSet().also {
            it -= forceIncluded
            it += forceExcluded
        }).toList()
    }
}
