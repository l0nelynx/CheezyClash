package com.cheezy.freedom.clash

import android.content.Context
import java.security.SecureRandom

object LocalProxyOverride : ConfigOverride {
    override val id: String = "local-proxy"

    private const val PREFS = "cheezy.overrides"
    private const val KEY_USER = "local-proxy.user"
    private const val KEY_PASS = "local-proxy.pass"

    private val ALLOWED_IPS = listOf(
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
    )

    /** Auth entry (`user:pass`) injected before [apply] by ConfigOverrideManager. */
    @Volatile
    internal var authEntry: String? = null

    /**
     * Ensures stable credentials exist in prefs and returns `user:pass`.
     * Generates a random password on first use.
     */
    fun ensureCredentials(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        var user = prefs.getString(KEY_USER, null)
        var pass = prefs.getString(KEY_PASS, null)
        if (user.isNullOrBlank() || pass.isNullOrBlank()) {
            user = "cheezy"
            pass = generatePassword(12)
            prefs.edit()
                .putString(KEY_USER, user)
                .putString(KEY_PASS, pass)
                .apply()
        }
        return "$user:$pass"
    }

    fun readCredentials(context: Context): Pair<String, String>? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val user = prefs.getString(KEY_USER, null) ?: return null
        val pass = prefs.getString(KEY_PASS, null) ?: return null
        if (user.isBlank() || pass.isBlank()) return null
        return user to pass
    }

    private fun generatePassword(length: Int): String {
        val alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        val rnd = SecureRandom()
        return buildString(length) {
            repeat(length) { append(alphabet[rnd.nextInt(alphabet.length)]) }
        }
    }

    override fun apply(yaml: MutableMap<String, Any?>) {
        yaml["mixed-port"] = 2080
        yaml["authentication"] = listOf(authEntry ?: "cheezy:changeme")
        yaml["lan-allowed-ips"] = ALLOWED_IPS
        yaml["allow-lan"] = true
    }

    override fun isForcedByBase(baseYaml: Map<String, Any?>): Boolean =
        baseYaml["allow-lan"] == true
}
