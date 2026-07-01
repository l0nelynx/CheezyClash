package com.cheezy.freedom.ui.main

/**
 * Deep links the app understands:
 *  - `cheezy://add/<sub_url>`   — add a subscription (both flavors).
 *  - `cheezy://login/<payload>` — account login (proprietary only; routed via
 *    [com.cheezy.freedom.account.AppLaunchers.loginDeepLinkIntent], a no-op in
 *    open). Parsed here so both link types are recognized up front and the
 *    proprietary side only has to fill in the launcher later.
 *
 * The payload (everything after the host segment) is percent-decoded. Senders
 * should percent-encode the subscription URL, e.g.
 * `cheezy://add/https%3A%2F%2Fexample.com%2Fsub`.
 */
sealed interface DeepLink {
    data class Add(val url: String) : DeepLink
    data class Login(val payload: String) : DeepLink
}

private const val ADD_PREFIX = "cheezy://add/"
private const val LOGIN_PREFIX = "cheezy://login/"

fun parseDeepLink(raw: String?): DeepLink? {
    if (raw.isNullOrBlank()) return null
    return when {
        raw.startsWith(ADD_PREFIX) ->
            percentDecode(raw.removePrefix(ADD_PREFIX)).trim()
                .takeIf { it.isNotBlank() }?.let { DeepLink.Add(it) }
        raw.startsWith(LOGIN_PREFIX) ->
            percentDecode(raw.removePrefix(LOGIN_PREFIX)).trim()
                .takeIf { it.isNotBlank() }?.let { DeepLink.Login(it) }
        else -> null
    }
}

/**
 * Decodes %XX escapes only, leaving `+` untouched (unlike URLDecoder) so base64
 * tokens and query strings survive. Assumes ASCII URLs (subscription links are).
 */
private fun percentDecode(s: String): String {
    if (!s.contains('%')) return s
    val out = StringBuilder(s.length)
    var i = 0
    while (i < s.length) {
        val c = s[i]
        if (c == '%' && i + 3 <= s.length) {
            val code = s.substring(i + 1, i + 3).toIntOrNull(16)
            if (code != null) {
                out.append(code.toChar())
                i += 3
                continue
            }
        }
        out.append(c)
        i++
    }
    return out.toString()
}
