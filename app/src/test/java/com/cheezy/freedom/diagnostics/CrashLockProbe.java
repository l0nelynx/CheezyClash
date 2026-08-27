package com.cheezy.freedom.diagnostics;

import java.io.RandomAccessFile;
import java.nio.channels.FileLock;

/** Separate JVM: verifies OS locks, not only the in-process synchronized guard. */
public final class CrashLockProbe {
    public static void main(String[] args) throws Exception {
        try (RandomAccessFile file = new RandomAccessFile(args[0], "rw");
             FileLock lock = file.getChannel().lock()) {
            System.out.println("locked");
            System.out.flush();
            System.in.read();
        }
    }
}
