package com.github.kr328.clash.core.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Proxy(
    val name: String,
    val title: String = "",
    val subtitle: String = "",
    val type: Type = Type.Unknown,
    val delay: Int = 0,
) {
    enum class Type(val group: Boolean) {
        @SerialName("Direct") Direct(false),
        @SerialName("Reject") Reject(false),
        @SerialName("RejectDrop") RejectDrop(false),
        @SerialName("Compatible") Compatible(false),
        @SerialName("Pass") Pass(false),

        @SerialName("Shadowsocks") Shadowsocks(false),
        @SerialName("ShadowsocksR") ShadowsocksR(false),
        @SerialName("Snell") Snell(false),
        @SerialName("Socks5") Socks5(false),
        @SerialName("Http") Http(false),
        @SerialName("Vmess") Vmess(false),
        @SerialName("Vless") Vless(false),
        @SerialName("Trojan") Trojan(false),
        @SerialName("Hysteria") Hysteria(false),
        @SerialName("Hysteria2") Hysteria2(false),
        @SerialName("Tuic") Tuic(false),
        @SerialName("WireGuard") WireGuard(false),
        @SerialName("Dns") Dns(false),
        @SerialName("Ssh") Ssh(false),
        @SerialName("Mieru") Mieru(false),
        @SerialName("AnyTLS") AnyTLS(false),
        @SerialName("Sudoku") Sudoku(false),
        @SerialName("Masque") Masque(false),
        @SerialName("TrustTunnel") TrustTunnel(false),

        @SerialName("Relay") Relay(true),
        @SerialName("Selector") Selector(true),
        @SerialName("Fallback") Fallback(true),
        @SerialName("URLTest") URLTest(true),
        @SerialName("LoadBalance") LoadBalance(true),
        @SerialName("Smart") Smart(true),

        @SerialName("Unknown") Unknown(false);
    }
}
