package com.ysclaude.app

import android.content.Intent
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class AccessibilityScreenContextModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "AccessibilityScreenContext"

  @ReactMethod
  fun openAccessibilitySettings(promise: Promise) {
    val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
    promise.resolve(true)
  }

  @ReactMethod
  fun isAccessibilityServiceEnabled(promise: Promise) {
    promise.resolve(FloatingAccessibilityService.isRunning())
  }

  @ReactMethod
  fun captureScreenContext(promise: Promise) {
    FloatingAccessibilityService.captureCurrentScreenContext { result ->
      result
        .onSuccess { context ->
          val map = Arguments.createMap()
          map.putString("imageUri", context.imageUri)
          map.putString("nodeTree", context.nodeTree)
          promise.resolve(map)
        }
        .onFailure { error -> promise.reject("CAPTURE_SCREEN_CONTEXT_FAILED", error) }
    }
  }

  @ReactMethod
  fun tap(x: Double, y: Double, promise: Promise) {
    FloatingAccessibilityService.tap(x.toFloat(), y.toFloat()) { result ->
      result
        .onSuccess { action -> promise.resolve(actionToMap(action)) }
        .onFailure { error -> promise.reject("ACCESSIBILITY_TAP_FAILED", error) }
    }
  }

  @ReactMethod
  fun tapRelative(xRatio: Double, yRatio: Double, promise: Promise) {
    FloatingAccessibilityService.tapRelative(xRatio.toFloat(), yRatio.toFloat()) { result ->
      result
        .onSuccess { action -> promise.resolve(actionToMap(action)) }
        .onFailure { error -> promise.reject("ACCESSIBILITY_TAP_RELATIVE_FAILED", error) }
    }
  }

  @ReactMethod
  fun swipe(startX: Double, startY: Double, endX: Double, endY: Double, durationMs: Double, promise: Promise) {
    FloatingAccessibilityService.swipe(
      startX.toFloat(),
      startY.toFloat(),
      endX.toFloat(),
      endY.toFloat(),
      durationMs.toLong()
    ) { result ->
      result
        .onSuccess { action -> promise.resolve(actionToMap(action)) }
        .onFailure { error -> promise.reject("ACCESSIBILITY_SWIPE_FAILED", error) }
    }
  }

  @ReactMethod
  fun clickNode(nodeId: String, promise: Promise) {
    FloatingAccessibilityService.clickNode(nodeId) { result ->
      result
        .onSuccess { action -> promise.resolve(actionToMap(action)) }
        .onFailure { error -> promise.reject("ACCESSIBILITY_CLICK_NODE_FAILED", error) }
    }
  }

  @ReactMethod
  fun scrollNode(nodeId: String, direction: String, promise: Promise) {
    FloatingAccessibilityService.scrollNode(nodeId, direction) { result ->
      result
        .onSuccess { action -> promise.resolve(actionToMap(action)) }
        .onFailure { error -> promise.reject("ACCESSIBILITY_SCROLL_NODE_FAILED", error) }
    }
  }

  @ReactMethod
  fun performGlobalAction(action: String, promise: Promise) {
    FloatingAccessibilityService.globalAction(action) { result ->
      result
        .onSuccess { actionResult -> promise.resolve(actionToMap(actionResult)) }
        .onFailure { error -> promise.reject("ACCESSIBILITY_GLOBAL_ACTION_FAILED", error) }
    }
  }

  private fun actionToMap(action: FloatingAccessibilityService.ActionResult) =
    Arguments.createMap().apply {
      putBoolean("success", action.success)
      putString("message", action.message)
      putString("nodeTree", action.nodeTree)
    }
}
