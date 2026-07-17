# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# SnakeYAML uses reflection to instantiate constructors during YAML parsing.
# Keep the whole package; the library is small enough that this is not a size concern.
-keep class org.yaml.snakeyaml.** { *; }
-dontwarn org.yaml.snakeyaml.**

# kotlinx.serialization — keep generated serializers when minify is enabled later.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keep,includedescriptorclasses class com.cheezy.freedom.**$$serializer { *; }
-keepclassmembers class com.cheezy.freedom.** {
    *** Companion;
}
-keepclasseswithmembers class com.cheezy.freedom.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# AIDL stubs / Parcelable models used across processes.
-keep class com.cheezy.freedom.clash.IClashInterface { *; }
-keep class com.cheezy.freedom.clash.IClashCallback { *; }
-keep class com.cheezy.freedom.clash.ILogcatCallback { *; }
-keep class com.github.kr328.clash.core.model.** { *; }