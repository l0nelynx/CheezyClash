// Top-level build file where you can add configuration options common to all sub-projects/modules.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.android.test) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    // baselineprofile plugin is applied in :app and :baselineprofile;
    // registration at root ensures classpath is resolved from libs.
    alias(libs.plugins.androidx.baselineprofile) apply false
}
val compileSdkVersion by extra("android-37")
