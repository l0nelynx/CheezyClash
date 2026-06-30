package com.cheezy.freedom.clash;

interface IClashCallback {
    void onStateChanged(boolean running, String lastError);
    void onPhaseChanged(int phase);
    void onTrafficUpdated(long bytesPerSecond);
    void onActiveProxyChanged(String proxy);
    void onIpAddressesUpdated(String tunAddr, String localAddr);
}
