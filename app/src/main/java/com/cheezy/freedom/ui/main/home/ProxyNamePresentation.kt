package com.cheezy.freedom.ui.main.home

internal data class ProxyNamePresentation(
    val flag: String?,
    val displayName: String,
)

private const val REGIONAL_INDICATOR_START = 0x1F1E6
private const val REGIONAL_INDICATOR_END = 0x1F1FF
private const val VARIATION_SELECTOR_16 = '\uFE0F'

internal fun String.toProxyNamePresentation(): ProxyNamePresentation {
    var flagStart = 0
    while (flagStart < length && this[flagStart].isWhitespace()) flagStart++

    val first = codePointAtOrNull(flagStart)
    if (first == null || first !in REGIONAL_INDICATOR_START..REGIONAL_INDICATOR_END) {
        return ProxyNamePresentation(flag = null, displayName = this)
    }

    val secondStart = flagStart + Character.charCount(first)
    val second = codePointAtOrNull(secondStart)
    if (second == null || second !in REGIONAL_INDICATOR_START..REGIONAL_INDICATOR_END) {
        return ProxyNamePresentation(flag = null, displayName = this)
    }

    var flagEnd = secondStart + Character.charCount(second)
    if (getOrNull(flagEnd) == VARIATION_SELECTOR_16) flagEnd++

    val displayName = substring(flagEnd).trimStart()
    if (displayName.isBlank()) {
        return ProxyNamePresentation(flag = null, displayName = this)
    }

    return ProxyNamePresentation(
        flag = substring(flagStart, flagEnd),
        displayName = displayName,
    )
}

private fun String.codePointAtOrNull(index: Int): Int? =
    if (index in indices) Character.codePointAt(this, index) else null
