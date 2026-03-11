package com.shaikhirfaan.app

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class JarvisServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "JarvisService"

    @ReactMethod
    fun start() {
        val intent = Intent(reactContext, JarvisForegroundService::class.java)
        ContextCompat.startForegroundService(reactContext, intent)
    }

    @ReactMethod
    fun stop() {
        val intent = Intent(reactContext, JarvisForegroundService::class.java)
        reactContext.stopService(intent)
    }
}
