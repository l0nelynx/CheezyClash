package com.cheezy.freedom

internal object LogPrivacy {
    private val url = Regex("""https?://[^\s'"]+""")
    private val ip = Regex("""\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b""")
    private val authorization = Regex("""(?im)\b(?:proxy-)?authorization\s*[:=]\s*[^\r\n]+""")
    private val credential = Regex("""(?i)\b(token|password|passwd|secret|uuid)\s*[:=]\s*[^\s,;]+""")
    fun redact(text: String): String = text.replace(url, "<url>").replace(ip, "<ip>")
        .replace(authorization, "authorization: <redacted>")
        .replace(credential) { "${it.groupValues[1]}=<redacted>" }
}
