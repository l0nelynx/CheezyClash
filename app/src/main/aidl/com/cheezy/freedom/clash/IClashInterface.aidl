package com.cheezy.freedom.clash;

import com.cheezy.freedom.clash.IClashCallback;
import com.cheezy.freedom.clash.ILogcatCallback;

interface IClashInterface {
    void registerCallback(IClashCallback callback);
    void unregisterCallback(IClashCallback callback);

    boolean isRunning();
    void stopVpn();

    void loadConfig(String path);

    String queryGroupNames(boolean excludeNotSelectable);
    String queryGroup(String name, String sort);
    boolean patchSelector(String group, String name);
    void healthCheck(String name);

    void subscribeLogcat(ILogcatCallback callback);
}
