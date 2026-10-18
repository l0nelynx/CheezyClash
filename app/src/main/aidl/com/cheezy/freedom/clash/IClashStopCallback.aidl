package com.cheezy.freedom.clash;

/** Acknowledges completed teardown, rather than just receipt of a stop command. */
oneway interface IClashStopCallback {
    void onStopped(int phase, String lastError);
}
