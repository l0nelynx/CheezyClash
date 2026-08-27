/* Compiled ONLY in CMake Debug. No release fault entry points or signal handlers. */
#include <jni.h>
#include <dlfcn.h>
#include <signal.h>
#include <stdlib.h>

JNIEXPORT jboolean JNICALL
Java_com_cheezy_freedom_diagnostics_CrashTestReceiver_nativeCrash(JNIEnv *env, jobject self, jint mode) {
    if (mode == 3) abort();
    if (mode == 4) raise(SIGSEGV);
    if (mode == 1 || mode == 2) {
        void *library = dlopen("libclash.so", RTLD_NOW | RTLD_NOLOAD);
        if (!library) return JNI_FALSE;
        void (*fault)(int) = dlsym(library, "debugCrash");
        if (fault) fault(mode);
        dlclose(library);
        return fault ? JNI_TRUE : JNI_FALSE;
    }
    return JNI_FALSE;
}
