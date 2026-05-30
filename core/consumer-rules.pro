-keep class kotlinx.coroutines.CompletableDeferred { *; }
-keep class kotlin.Unit { *; }
-keep class com.cheezy.freedom.core.bridge.** { *; }
-keep class com.cheezy.freedom.core.model.** { *; }
-keepattributes *Annotation*, InnerClasses

-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
