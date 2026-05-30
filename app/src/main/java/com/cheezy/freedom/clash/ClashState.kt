package com.cheezy.freedom.clash

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

object ClashState {
    private val _running = MutableStateFlow(false)
    val running: StateFlow<Boolean> = _running

    private val _lastError = MutableStateFlow<String?>(null)
    val lastError: StateFlow<String?> = _lastError

    private val _trafficNow = MutableStateFlow(0L)
    val trafficNow: StateFlow<Long> = _trafficNow

    private val _subscription = MutableStateFlow<SubscriptionInfo?>(null)
    val subscription: StateFlow<SubscriptionInfo?> = _subscription

    private val _activeProxy = MutableStateFlow<String?>(null)
    val activeProxy: StateFlow<String?> = _activeProxy

    private val _lastUpdateTime = MutableStateFlow(0L)
    val lastUpdateTime: StateFlow<Long> = _lastUpdateTime

    private val _pings = MutableStateFlow<Map<String, Int>>(emptyMap())
    val pings: StateFlow<Map<String, Int>> = _pings

    private val _tunAddress = MutableStateFlow<String?>(null)
    val tunAddress: StateFlow<String?> = _tunAddress

    private val _localIp = MutableStateFlow<String?>(null)
    val localIp: StateFlow<String?> = _localIp

    fun setRunning(value: Boolean) {
        _running.value = value
        if (!value) {
            _trafficNow.value = 0L
            _activeProxy.value = null
            _pings.value = emptyMap()
            _tunAddress.value = null
            _localIp.value = null
        }
    }

    fun setTunAddress(value: String?) {
        _tunAddress.value = value
    }

    fun setLocalIp(value: String?) {
        _localIp.value = value
    }

    fun setPings(value: Map<String, Int>) {
        _pings.value = value
    }

    fun setActiveProxy(value: String?) {
        _activeProxy.value = value
    }

    fun setError(value: String?) {
        _lastError.value = value
    }

    fun setTraffic(bytesPerSecond: Long) {
        _trafficNow.value = bytesPerSecond
    }

    fun setSubscription(value: SubscriptionInfo?) {
        _subscription.value = value
    }

    fun setLastUpdateTime(value: Long) {
        _lastUpdateTime.value = value
    }
}
