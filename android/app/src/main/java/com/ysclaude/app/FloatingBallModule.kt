package com.ysclaude.app

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.GradientDrawable
import android.hardware.display.DisplayManager
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.content.pm.ServiceInfo
import android.text.TextUtils
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.bumptech.glide.Glide
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import androidx.core.app.NotificationCompat
import java.io.File
import java.io.FileOutputStream
import kotlin.math.abs
import kotlin.math.max
import kotlin.random.Random

class FloatingBallModule(
  private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "FloatingBall"

  private val mainHandler = Handler(Looper.getMainLooper())
  private val windowManager = reactContext.getSystemService(Context.WINDOW_SERVICE) as WindowManager
  private val defaultBallImageSize = readAssetPixelSize(NORMAL_IDLE)
  private val touchTargetSize = dp(96)
  private val toolSize = dp(38)
  private val expandedWidth = dp(206)
  private val expandedHeight = dp(138)
  private val bubbleWidth = dp(268)
  private val inputWidth = dp(286)
  private val touchSlop = ViewConfiguration.get(reactContext).scaledTouchSlop
  private val dragSlop = max(touchSlop, dp(24))
  private val toolColors = listOf(
    Color.rgb(255, 232, 238),
    Color.rgb(232, 241, 255),
    Color.rgb(232, 248, 238),
    Color.rgb(255, 244, 214)
  )

  private var rootView: FrameLayout? = null
  private var ballView: ImageView? = null
  private var bubbleView: TextView? = null
  private var bubbleParams: WindowManager.LayoutParams? = null
  private var inputView: LinearLayout? = null
  private var inputParams: WindowManager.LayoutParams? = null
  private var toolbarViews: List<TextView> = emptyList()
  private var layoutParams: WindowManager.LayoutParams? = null
  private var ballWidth = defaultBallImageSize.width
  private var ballHeight = defaultBallImageSize.height
  private var isExpanded = false
  private var isEdgeHanging = false
  private var edgeSide = EdgeSide.RIGHT
  private var currentNormalIndex = -1
  private var lastDownRawX = 0f
  private var lastDownRawY = 0f
  private var downEventTime = 0L
  private var downParamX = 0
  private var downParamY = 0
  private var didDrag = false
  private var didLongPress = false

  private val longPressRunnable = Runnable {
    didLongPress = true
    if (isExpanded) {
      hideToolbar()
    } else {
      showToolbar()
    }
  }

  private val returnToIdleRunnable = Runnable {
    loadState(if (isEdgeHanging) EDGE_IDLE else NORMAL_IDLE)
  }

  private val hideMessageRunnable = Runnable {
    hideMessageInternal()
  }

  private val randomStateRunnable = object : Runnable {
    override fun run() {
      if (rootView != null && !isExpanded) {
        val pool = if (isEdgeHanging) EDGE_RANDOM_STATES else NORMAL_RANDOM_STATES
        val next = pool.random()
        loadState(next)
        mainHandler.removeCallbacks(returnToIdleRunnable)
        mainHandler.postDelayed(returnToIdleRunnable, 2600)
      }
      scheduleRandomState()
    }
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    promise.resolve(canDrawOverlays())
  }

  @ReactMethod
  fun openOverlaySettings(promise: Promise) {
    try {
      val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactContext.packageName}")
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_OVERLAY_SETTINGS_FAILED", error)
    }
  }

  @ReactMethod
  fun show(promise: Promise) {
    mainHandler.post {
      try {
        if (!canDrawOverlays()) {
          promise.reject("OVERLAY_PERMISSION_REQUIRED", "Floating ball overlay permission is not granted")
          return@post
        }
        showInternal()
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("SHOW_FLOATING_BALL_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun hide(promise: Promise) {
    mainHandler.post {
      try {
        hideInternal()
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("HIDE_FLOATING_BALL_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun isShowing(promise: Promise) {
    promise.resolve(rootView != null)
  }

  @ReactMethod
  fun showMessage(text: String, promise: Promise) {
    mainHandler.post {
      try {
        showMessageInternal(text)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("SHOW_FLOATING_MESSAGE_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun hideMessage(promise: Promise) {
    mainHandler.post {
      try {
        hideMessageInternal()
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("HIDE_FLOATING_MESSAGE_FAILED", error)
      }
    }
  }

  @ReactMethod
  fun openApp(promise: Promise) {
    try {
      openAppInternal()
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_APP_FAILED", error)
    }
  }

  @ReactMethod
  fun captureScreen(promise: Promise) {
    if (ScreenCaptureService.hasPendingCapture()) {
      promise.reject("SCREEN_CAPTURE_BUSY", "Screen capture is already active")
      return
    }

    ScreenCaptureService.setPendingPromise(promise)
    val intent = Intent(reactContext, ScreenCapturePermissionActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    try {
      reactContext.startActivity(intent)
    } catch (error: Exception) {
      ScreenCaptureService.clearPendingPromise()
      promise.reject("OPEN_SCREEN_CAPTURE_FAILED", error)
    }
  }

  private fun canDrawOverlays(): Boolean {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(reactContext)
  }

  private fun showInternal() {
    if (rootView != null) return

    val root = FrameLayout(reactContext).apply {
      clipChildren = false
      clipToPadding = false
      setBackgroundColor(Color.TRANSPARENT)
      setOnTouchListener(::handleTouch)
    }

    val image = ImageView(reactContext).apply {
      scaleType = ImageView.ScaleType.CENTER
      setOnTouchListener(::handleTouch)
    }
    root.addView(image, collapsedBallLayoutParams())

    val labels = listOf("📷", "✎", "↻", "↗")
    val actions = listOf(ACTION_SCREEN_SHARE, ACTION_TEXT_INPUT, ACTION_GET_REPLY, ACTION_OPEN_APP)
    val tools = (1..4).map { index ->
      TextView(reactContext).apply {
        text = labels[index - 1]
        textSize = 18f
        setTextColor(Color.rgb(86, 82, 92))
        gravity = Gravity.CENTER
        background = circleDrawable(toolColors[index - 1])
        elevation = dp(5).toFloat()
        alpha = 0.96f
        visibility = View.GONE
        setOnClickListener {
          handleToolAction(actions[index - 1])
        }
      }
    }
    tools.forEach { root.addView(it, FrameLayout.LayoutParams(toolSize, toolSize)) }

    rootView = root
    ballView = image
    toolbarViews = tools
    isExpanded = false
    isEdgeHanging = false
    edgeSide = EdgeSide.RIGHT

    layoutParams = WindowManager.LayoutParams(
      collapsedWidth(),
      collapsedHeight(),
      overlayType(),
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = screenWidth() - collapsedWidth() - dp(18)
      y = screenHeight() / 2 - collapsedHeight() / 2
    }

    windowManager.addView(root, layoutParams)
    FloatingBallForegroundService.start(reactContext)
    loadState(NORMAL_IDLE)
    scheduleRandomState()
  }

  private fun hideInternal() {
    mainHandler.removeCallbacks(longPressRunnable)
    mainHandler.removeCallbacks(returnToIdleRunnable)
    mainHandler.removeCallbacks(randomStateRunnable)
    mainHandler.removeCallbacks(hideMessageRunnable)
    hideMessageInternal()
    hideTextInputInternal()
    rootView?.let { view ->
      runCatching { windowManager.removeView(view) }
    }
    rootView = null
    ballView = null
    toolbarViews = emptyList()
    layoutParams = null
    isExpanded = false
    isEdgeHanging = false
    FloatingBallForegroundService.stop(reactContext)
  }

  private fun handleTouch(view: View, event: MotionEvent): Boolean {
    val params = layoutParams ?: return true
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        hideMessageInternal()
        lastDownRawX = event.rawX
        lastDownRawY = event.rawY
        downEventTime = event.eventTime
        downParamX = params.x
        downParamY = params.y
        didDrag = false
        didLongPress = false
        mainHandler.removeCallbacks(longPressRunnable)
        mainHandler.postDelayed(longPressRunnable, ViewConfiguration.getLongPressTimeout().toLong())
        return true
      }

      MotionEvent.ACTION_MOVE -> {
        if (didLongPress) {
          return true
        }
        val dx = event.rawX - lastDownRawX
        val dy = event.rawY - lastDownRawY
        if (!didDrag && (abs(dx) > dragSlop || abs(dy) > dragSlop)) {
          didDrag = true
          mainHandler.removeCallbacks(longPressRunnable)
          hideToolbar()
          isEdgeHanging = false
          loadState(NORMAL_IDLE)
        }
        if (didDrag) {
          params.x = (downParamX + dx).toInt()
          params.y = (downParamY + dy).toInt().coerceIn(0, screenHeight() - collapsedHeight())
          rootView?.let { windowManager.updateViewLayout(it, params) }
        }
        return true
      }

      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        mainHandler.removeCallbacks(longPressRunnable)
        if (didDrag) {
          settleAfterDrag()
        } else if (!didLongPress && event.actionMasked == MotionEvent.ACTION_UP) {
          val pressDuration = event.eventTime - downEventTime
          if (pressDuration >= ViewConfiguration.getLongPressTimeout()) {
            didLongPress = true
            showToolbar()
          } else {
            handleClick()
          }
        }
        didDrag = false
        didLongPress = false
        return true
      }
    }
    return true
  }

  private fun handleClick() {
    hideMessageInternal()
    if (isExpanded) {
      hideToolbar()
      return
    }
    if (isEdgeHanging) {
      exitEdge()
      return
    }
    currentNormalIndex = (currentNormalIndex + 1).floorMod(NORMAL_CLICK_STATES.size)
    loadState(NORMAL_CLICK_STATES[currentNormalIndex])
    mainHandler.removeCallbacks(returnToIdleRunnable)
    mainHandler.postDelayed(returnToIdleRunnable, 3200)
  }

  private fun handleToolAction(action: String) {
    hideToolbar()
    hideMessageInternal()
    if (action == ACTION_TEXT_INPUT) {
      showTextInput()
      return
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(TOOL_ACTION_EVENT, action)
    if (action == ACTION_OPEN_APP) {
      openAppInternal()
      return
    }
  }

  private fun openAppInternal() {
    val launchIntent = reactContext.packageManager.getLaunchIntentForPackage(reactContext.packageName)
      ?: Intent(reactContext, MainActivity::class.java)
    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    reactContext.startActivity(launchIntent)
  }

  private fun showTextInput() {
    hideTextInputInternal()
    val params = layoutParams ?: return

    val input = EditText(reactContext).apply {
      hint = "输入文字"
      setHintTextColor(Color.rgb(150, 144, 156))
      setTextColor(Color.rgb(43, 40, 48))
      textSize = 14f
      setSingleLine(true)
      imeOptions = EditorInfo.IME_ACTION_SEND or EditorInfo.IME_FLAG_NO_EXTRACT_UI
      setPadding(dp(10), 0, dp(8), 0)
      background = null
      minHeight = dp(42)
    }

    val send = TextView(reactContext).apply {
      text = "发送"
      textSize = 14f
      setTextColor(Color.WHITE)
      gravity = Gravity.CENTER
      background = roundedDrawable(Color.rgb(121, 103, 238), dp(16))
      setPadding(dp(12), 0, dp(12), 0)
    }

    val close = TextView(reactContext).apply {
      text = "×"
      textSize = 20f
      setTextColor(Color.rgb(134, 128, 140))
      gravity = Gravity.CENTER
      setPadding(dp(6), 0, dp(6), 0)
      setOnClickListener { hideTextInputInternal() }
    }

    val container = LinearLayout(reactContext).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(10), dp(8), dp(8), dp(8))
      background = roundedDrawable(Color.rgb(255, 255, 255), dp(18))
      elevation = dp(8).toFloat()
      addView(
        input,
        LinearLayout.LayoutParams(0, dp(42), 1f)
      )
      addView(
        send,
        LinearLayout.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, dp(36))
      )
      addView(
        close,
        LinearLayout.LayoutParams(dp(34), dp(36))
      )
    }

    val submit = {
      val text = input.text?.toString()?.trim().orEmpty()
      if (text.isNotEmpty()) {
        hideTextInputInternal()
        emitTextInput(text)
      }
      Unit
    }

    input.setOnEditorActionListener { _, actionId, _ ->
      if (actionId == EditorInfo.IME_ACTION_SEND) {
        submit()
        true
      } else {
        false
      }
    }
    send.setOnClickListener { submit() }

    val targetX = (params.x + currentBallLeft() + ballWidth / 2 - inputWidth / 2)
      .coerceIn(dp(8), screenWidth() - inputWidth - dp(8))
    val targetY = (params.y - dp(62)).coerceIn(dp(8), screenHeight() - dp(118))
    inputParams = WindowManager.LayoutParams(
      inputWidth,
      WindowManager.LayoutParams.WRAP_CONTENT,
      overlayType(),
      WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
      android.graphics.PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      x = targetX
      y = targetY
      softInputMode = WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING or
        WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
    }

    inputView = container
    windowManager.addView(container, inputParams)
    input.requestFocus()
    mainHandler.postDelayed({
      val imm = reactContext.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
    }, 120)
  }

  private fun emitTextInput(text: String) {
    val payload = Arguments.createMap().apply {
      putString("action", ACTION_TEXT_INPUT)
      putString("text", text)
    }
    reactContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(TOOL_ACTION_EVENT, payload)
  }

  private fun hideTextInputInternal() {
    val input = inputView
    if (input != null) {
      val imm = reactContext.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
      runCatching { imm.hideSoftInputFromWindow(input.windowToken, 0) }
      runCatching { windowManager.removeView(input) }
    }
    inputView = null
    inputParams = null
  }

  private fun settleAfterDrag() {
    val root = rootView ?: return
    val params = layoutParams ?: return
    val width = screenWidth()
    val ballLeft = currentBallLeft()
    val centerX = params.x + ballLeft + ballWidth / 2
    edgeSide = if (centerX < width / 2) EdgeSide.LEFT else EdgeSide.RIGHT
    val nearLeft = params.x + ballLeft <= dp(20)
    val nearRight = params.x + ballLeft + ballWidth >= width - dp(20)

    if (nearLeft || nearRight) {
      isEdgeHanging = true
      updateCollapsedBallLayout()
      params.width = collapsedWidth()
      params.height = collapsedHeight()
      params.x = if (edgeSide == EdgeSide.LEFT) 0 else width - collapsedWidth()
      params.y = params.y.coerceIn(0, screenHeight() - collapsedHeight())
      windowManager.updateViewLayout(root, params)
      loadState(EDGE_IDLE)
      updateMessagePosition()
      return
    }

    isEdgeHanging = false
    updateCollapsedBallLayout()
    params.width = collapsedWidth()
    params.height = collapsedHeight()
    params.x = params.x.coerceIn(0, width - collapsedWidth())
    params.y = params.y.coerceIn(0, screenHeight() - collapsedHeight())
    windowManager.updateViewLayout(root, params)
    loadState(NORMAL_IDLE)
    updateMessagePosition()
  }

  private fun exitEdge() {
    val root = rootView ?: return
    val params = layoutParams ?: return
    isEdgeHanging = false
    updateCollapsedBallLayout()
    params.width = collapsedWidth()
    params.height = collapsedHeight()
    params.x = if (edgeSide == EdgeSide.LEFT) 0 else screenWidth() - collapsedWidth()
    params.y = params.y.coerceIn(0, screenHeight() - collapsedHeight())
    windowManager.updateViewLayout(root, params)
    loadState(NORMAL_IDLE)
    updateMessagePosition()
  }

  private fun showToolbar() {
    hideMessageInternal()
    val root = rootView ?: return
    val params = layoutParams ?: return
    val ball = ballView
    val ballScreenX = params.x + currentBallLeft()
    val ballScreenY = params.y + currentBallTop()
    val openToRight = ballScreenX + ballWidth / 2 < screenWidth() / 2
    edgeSide = if (openToRight) EdgeSide.LEFT else EdgeSide.RIGHT

    // Keep the overlay hidden while both the window bounds and child margins change.
    // Otherwise Android can draw one intermediate frame with the ball shifted.
    root.visibility = View.INVISIBLE
    ball?.visibility = View.VISIBLE
    isExpanded = true
    isEdgeHanging = false
    params.width = expandedWidth
    params.height = expandedHeight
    val ballLeft = expandedWidth / 2 - ballWidth / 2
    val ballTop = expandedHeight - ballHeight - dp(8)
    params.x = (ballScreenX - ballLeft).coerceIn(0, screenWidth() - expandedWidth)
    params.y = (ballScreenY - ballTop).coerceIn(0, screenHeight() - expandedHeight)

    ball?.layoutParams = FrameLayout.LayoutParams(ballWidth, ballHeight).apply {
      leftMargin = ballLeft
      topMargin = ballTop
    }

    val ballCenterX = ballLeft + ballWidth / 2
    val ballCenterY = ballTop + ballHeight / 2
    val positions = listOf(
      (ballCenterX - dp(64) - toolSize / 2) to (ballCenterY - dp(24) - toolSize / 2),
      (ballCenterX - dp(36) - toolSize / 2) to (ballCenterY - dp(56) - toolSize / 2),
      (ballCenterX + dp(36) - toolSize / 2) to (ballCenterY - dp(56) - toolSize / 2),
      (ballCenterX + dp(64) - toolSize / 2) to (ballCenterY - dp(24) - toolSize / 2)
    )
    toolbarViews.forEachIndexed { index, tool ->
      val (left, top) = positions[index]
      tool.layoutParams = FrameLayout.LayoutParams(toolSize, toolSize).apply {
        leftMargin = left
        topMargin = top
      }
      tool.visibility = View.VISIBLE
    }
    windowManager.updateViewLayout(root, params)
    loadState(NORMAL_IDLE)
    root.post {
      if (rootView === root && isExpanded) {
        root.visibility = View.VISIBLE
      }
    }
  }

  private fun hideToolbar() {
    if (!isExpanded) return
    val params = layoutParams ?: return
    val root = rootView ?: return
    val ball = ballView
    val ballScreenX = params.x + currentBallLeft()
    val ballScreenY = params.y + currentBallTop()

    root.visibility = View.INVISIBLE
    ball?.visibility = View.VISIBLE
    isExpanded = false
    toolbarViews.forEach { it.visibility = View.GONE }
    updateCollapsedBallLayout()

    params.width = collapsedWidth()
    params.height = collapsedHeight()
    params.x = (ballScreenX - collapsedBallLeft()).coerceIn(0, screenWidth() - collapsedWidth())
    params.y = (ballScreenY - collapsedBallTop()).coerceIn(0, screenHeight() - collapsedHeight())
    windowManager.updateViewLayout(root, params)
    loadState(NORMAL_IDLE)
    updateMessagePosition()
    root.post {
      if (rootView === root && !isExpanded) {
        root.visibility = View.VISIBLE
      }
    }
  }

  private fun showMessageInternal(rawText: String) {
    if (rootView == null || layoutParams == null || isExpanded) return
    val text = normalizeMessageText(rawText)
    if (text.isBlank()) return

    val bubble = bubbleView ?: TextView(reactContext).apply {
      textSize = 14f
      setTextColor(Color.rgb(58, 55, 62))
      setLineSpacing(dp(2).toFloat(), 1.0f)
      maxLines = 3
      ellipsize = TextUtils.TruncateAt.END
      includeFontPadding = true
      setPadding(dp(14), dp(10), dp(14), dp(10))
      background = messageBubbleDrawable()
      elevation = dp(8).toFloat()
    }.also {
      bubbleView = it
    }

    bubble.text = text
    if (bubble.parent == null) {
      bubbleParams = WindowManager.LayoutParams(
        bubbleWidth,
        WindowManager.LayoutParams.WRAP_CONTENT,
        overlayType(),
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
        android.graphics.PixelFormat.TRANSLUCENT
      ).apply {
        gravity = Gravity.TOP or Gravity.START
      }
      windowManager.addView(bubble, bubbleParams)
    }

    updateMessagePosition()
    mainHandler.removeCallbacks(hideMessageRunnable)
    mainHandler.postDelayed(hideMessageRunnable, 7200)
  }

  private fun hideMessageInternal() {
    mainHandler.removeCallbacks(hideMessageRunnable)
    bubbleView?.let { view ->
      if (view.parent != null) {
        runCatching { windowManager.removeView(view) }
      }
    }
    bubbleView = null
    bubbleParams = null
  }

  private fun updateMessagePosition() {
    val params = layoutParams ?: return
    val bubble = bubbleView ?: return
    val bubbleLayout = bubbleParams ?: return
    if (bubble.parent == null) return

    val ballCenterX = params.x + currentBallLeft() + ballWidth / 2
    val desiredX = if (isEdgeHanging && edgeSide == EdgeSide.LEFT) {
      params.x + currentBallLeft() + ballWidth - dp(8)
    } else if (isEdgeHanging && edgeSide == EdgeSide.RIGHT) {
      params.x + currentBallLeft() - bubbleWidth + dp(8)
    } else {
      ballCenterX - bubbleWidth / 2
    }
    bubbleLayout.x = desiredX.coerceIn(dp(8), screenWidth() - bubbleWidth - dp(8))
    bubbleLayout.y = (params.y - dp(86)).coerceAtLeast(dp(18))
    windowManager.updateViewLayout(bubble, bubbleLayout)
  }

  private fun normalizeMessageText(rawText: String): String {
    return rawText
      .replace(Regex("\\[/?[^\\]]{1,24}\\]"), "")
      .replace(Regex("\\n{3,}"), "\n\n")
      .trim()
      .let { text ->
        if (text.length > 180) text.take(180).trimEnd() + "..." else text
      }
  }

  private fun circleDrawable(color: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.OVAL
      setColor(color)
      setStroke(dp(1), Color.argb(80, 255, 255, 255))
    }
  }

  private fun roundedDrawable(color: Int, radius: Int): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = radius.toFloat()
      setColor(color)
    }
  }

  private fun messageBubbleDrawable(): GradientDrawable {
    return GradientDrawable().apply {
      shape = GradientDrawable.RECTANGLE
      cornerRadius = dp(16).toFloat()
      setColor(Color.argb(244, 255, 252, 245))
      setStroke(dp(1), Color.argb(96, 224, 215, 198))
    }
  }

  private fun loadState(assetName: String) {
    val image = ballView ?: return
    val actualAsset = if (assetName.startsWith("clawd-edge-") && !EDGE_ALL_STATES.contains(assetName)) {
      EDGE_IDLE
    } else {
      assetName
    }
    applyBallImageSize(actualAsset)
    image.scaleX = if (isEdgeHanging && edgeSide == EdgeSide.LEFT) -1f else 1f
    Glide.with(reactContext)
      .asGif()
      .load("file:///android_asset/$actualAsset.gif")
      .into(image)
  }

  private fun applyBallImageSize(assetName: String) {
    val nextSize = readAssetPixelSize(assetName)
    if (nextSize.width == ballWidth && nextSize.height == ballHeight) return

    ballWidth = nextSize.width
    ballHeight = nextSize.height

    if (isExpanded) {
      val currentImageParams = ballView?.layoutParams as? FrameLayout.LayoutParams
      ballView?.layoutParams = FrameLayout.LayoutParams(ballWidth, ballHeight).apply {
        leftMargin = currentImageParams?.leftMargin ?: 0
        topMargin = currentImageParams?.topMargin ?: 0
      }
    } else {
      updateCollapsedBallLayout()
    }

    val root = rootView ?: return
    val params = layoutParams ?: return
    if (isExpanded) return

    params.width = collapsedWidth()
    params.height = collapsedHeight()
    params.x = if (isEdgeHanging) {
      if (edgeSide == EdgeSide.LEFT) 0 else screenWidth() - collapsedWidth()
    } else {
      params.x.coerceIn(0, screenWidth() - collapsedWidth())
    }
    params.y = params.y.coerceIn(0, screenHeight() - collapsedHeight())
    windowManager.updateViewLayout(root, params)
    updateMessagePosition()
  }

  private fun collapsedWidth(): Int = max(touchTargetSize, ballWidth)

  private fun collapsedHeight(): Int = max(touchTargetSize, ballHeight)

  private fun collapsedBallLeft(): Int {
    return if (edgeSide == EdgeSide.LEFT) 0 else collapsedWidth() - ballWidth
  }

  private fun collapsedBallTop(): Int = (collapsedHeight() - ballHeight) / 2

  private fun collapsedBallLayoutParams(): FrameLayout.LayoutParams {
    return FrameLayout.LayoutParams(ballWidth, ballHeight).apply {
      leftMargin = collapsedBallLeft()
      topMargin = collapsedBallTop()
    }
  }

  private fun updateCollapsedBallLayout() {
    ballView?.layoutParams = collapsedBallLayoutParams()
  }

  private fun currentBallLeft(): Int {
    val params = ballView?.layoutParams as? FrameLayout.LayoutParams
    return params?.leftMargin ?: ballView?.left ?: 0
  }

  private fun currentBallTop(): Int {
    val params = ballView?.layoutParams as? FrameLayout.LayoutParams
    return params?.topMargin ?: ballView?.top ?: 0
  }

  private fun readAssetPixelSize(assetName: String): ImageSize {
    val options = BitmapFactory.Options().apply {
      inJustDecodeBounds = true
    }
    return runCatching {
      reactContext.assets.open("$assetName.gif").use { stream ->
        BitmapFactory.decodeStream(stream, null, options)
      }
      if (options.outWidth > 0 && options.outHeight > 0) {
        ImageSize(options.outWidth, options.outHeight)
      } else {
        FALLBACK_IMAGE_SIZE
      }
    }.getOrDefault(FALLBACK_IMAGE_SIZE)
  }

  private fun scheduleRandomState() {
    mainHandler.removeCallbacks(randomStateRunnable)
    mainHandler.postDelayed(randomStateRunnable, Random.nextLong(9000, 18000))
  }

  private fun overlayType(): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
  }

  private fun screenWidth(): Int = reactContext.resources.displayMetrics.widthPixels

  private fun screenHeight(): Int = reactContext.resources.displayMetrics.heightPixels

  private fun dp(value: Int): Int = (value * reactContext.resources.displayMetrics.density).toInt()

  private fun Int.floorMod(other: Int): Int = ((this % other) + other) % other

  private enum class EdgeSide {
    LEFT,
    RIGHT
  }

  private data class ImageSize(val width: Int, val height: Int)

  companion object {
    private val FALLBACK_IMAGE_SIZE = ImageSize(46, 44)

    private const val TOOL_ACTION_EVENT = "FloatingBallToolAction"
    private const val ACTION_SCREEN_SHARE = "screen_share"
    private const val ACTION_TEXT_INPUT = "text_input"
    private const val ACTION_GET_REPLY = "get_reply"
    private const val ACTION_OPEN_APP = "open_app"

    private const val NORMAL_IDLE = "clawd-idle"
    private const val EDGE_IDLE = "clawd-edge-idle"

    private val NORMAL_CLICK_STATES = listOf(
      "clawd-building",
      "clawd-bubble",
      "clawd-carrying",
      "clawd-conducting",
      "clawd-debugger",
      "clawd-error",
      "clawd-happy",
      "clawd-headphones-groove",
      "clawd-idle-reading",
      "clawd-juggling",
      "clawd-notification",
      "clawd-react-annoyed",
      "clawd-react-double-jump",
      "clawd-sleeping",
      "clawd-sweeping",
      "clawd-thinking",
      "clawd-typing"
    )

    private val NORMAL_RANDOM_STATES = NORMAL_CLICK_STATES

    private val EDGE_ALL_STATES = setOf(
      "clawd-edge-alert",
      "clawd-edge-crabwalk",
      "clawd-edge-enter",
      "clawd-edge-happy",
      "clawd-edge-idle",
      "clawd-edge-peek"
    )

    private val EDGE_RANDOM_STATES = listOf(
      "clawd-edge-alert",
      "clawd-edge-crabwalk",
      "clawd-edge-enter",
      "clawd-edge-happy",
      "clawd-edge-peek"
    )
  }
}

class ScreenCapturePermissionActivity : Activity() {
  private var requested = false

  override fun onCreate(savedInstanceState: android.os.Bundle?) {
    super.onCreate(savedInstanceState)
    if (savedInstanceState != null) {
      requested = savedInstanceState.getBoolean(KEY_REQUESTED, false)
    }
    if (!requested) {
      requested = true
      val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      startActivityForResult(projectionManager.createScreenCaptureIntent(), REQUEST_SCREEN_CAPTURE)
    }
  }

  override fun onSaveInstanceState(outState: android.os.Bundle) {
    outState.putBoolean(KEY_REQUESTED, requested)
    super.onSaveInstanceState(outState)
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode == REQUEST_SCREEN_CAPTURE) {
      if (resultCode == RESULT_OK && data != null) {
        ScreenCaptureService.capture(applicationContext, resultCode, data)
      } else {
        ScreenCaptureService.resolvePending(null)
      }
      finish()
      overridePendingTransition(0, 0)
    }
  }

  companion object {
    private const val REQUEST_SCREEN_CAPTURE = 5102
    private const val KEY_REQUESTED = "requested"
  }
}

class FloatingBallForegroundService : Service() {
  override fun onBind(intent: Intent?) = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundNotification()
    return START_STICKY
  }

  private fun startForegroundNotification() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "悬浮球",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        setShowBadge(false)
      }
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }

    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("YSClaude 悬浮球运行中")
      .setContentText("点开悬浮球可快速输入、截图和获取回复")
      .setOngoing(true)
      .setSilent(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL_ID = "ysclaude-floating-ball"
    private const val NOTIFICATION_ID = 7205

    fun start(context: Context) {
      val intent = Intent(context, FloatingBallForegroundService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, FloatingBallForegroundService::class.java))
    }
  }
}

class ScreenCaptureService : Service() {
  override fun onBind(intent: Intent?) = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    startForegroundNotification()

    val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
      ?: Activity.RESULT_CANCELED
    val data = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent?.getParcelableExtra(EXTRA_DATA, Intent::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent?.getParcelableExtra(EXTRA_DATA)
    }

    val promise = pendingPromise
    if (resultCode != Activity.RESULT_OK || data == null || promise == null) {
      resolvePending(null)
      stopSelf()
      return START_NOT_STICKY
    }

    Handler(Looper.getMainLooper()).post {
      captureOnce(resultCode, data, promise)
    }
    return START_NOT_STICKY
  }

  private fun captureOnce(resultCode: Int, data: Intent, promise: Promise) {
    var projection: MediaProjection? = null
    var projectionCallback: MediaProjection.Callback? = null
    var reader: ImageReader? = null
    var display: android.hardware.display.VirtualDisplay? = null

    try {
      val projectionManager = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
      val activeProjection = projectionManager.getMediaProjection(resultCode, data)
        ?: throw IllegalStateException("MediaProjection is not available")
      projection = activeProjection
      projectionCallback = object : MediaProjection.Callback() {
        override fun onStop() {
          cleanup(projection, display, reader, this)
        }
      }
      activeProjection.registerCallback(projectionCallback, Handler(Looper.getMainLooper()))
      val metrics = resources.displayMetrics
      val width = metrics.widthPixels
      val height = metrics.heightPixels
      val density = metrics.densityDpi
      reader = ImageReader.newInstance(width, height, android.graphics.PixelFormat.RGBA_8888, 2)
      display = activeProjection.createVirtualDisplay(
        "YSClaudeScreenCapture",
        width,
        height,
        density,
        DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
        reader.surface,
        null,
        null
      )

      tryReadFrame(
        reader = reader,
        width = width,
        height = height,
        attempt = 0,
        promise = promise,
        projection = projection,
        display = display,
        callback = projectionCallback
      )
    } catch (error: Exception) {
      promise.reject("CAPTURE_SCREEN_FAILED", error)
      cleanup(projection, display, reader, projectionCallback)
      stopSelf()
    }
  }

  private fun tryReadFrame(
    reader: ImageReader,
    width: Int,
    height: Int,
    attempt: Int,
    promise: Promise,
    projection: MediaProjection?,
    display: android.hardware.display.VirtualDisplay?,
    callback: MediaProjection.Callback?
  ) {
    Handler(Looper.getMainLooper()).postDelayed({
      var cropped: Bitmap? = null
      try {
        val image = reader.acquireLatestImage()
        if (image == null) {
          retryOrFinish(reader, width, height, attempt, promise, projection, display, callback)
          return@postDelayed
        }

        image.use { frame ->
          val plane = frame.planes[0]
          val buffer = plane.buffer
          val pixelStride = plane.pixelStride
          val rowStride = plane.rowStride
          val rowPadding = rowStride - pixelStride * width
          val bitmap = Bitmap.createBitmap(width + rowPadding / pixelStride, height, Bitmap.Config.ARGB_8888)
          bitmap.copyPixelsFromBuffer(buffer)
          cropped = Bitmap.createBitmap(bitmap, 0, 0, width, height)
          bitmap.recycle()
        }

        val frameBitmap = cropped
        if (frameBitmap == null || (attempt < MAX_CAPTURE_ATTEMPTS - 1 && isMostlyBlack(frameBitmap))) {
          frameBitmap?.recycle()
          retryOrFinish(reader, width, height, attempt, promise, projection, display, callback)
          return@postDelayed
        }

        val file = File(cacheDir, "floating-screen-${System.currentTimeMillis()}.png")
        FileOutputStream(file).use { out ->
          frameBitmap.compress(Bitmap.CompressFormat.PNG, 92, out)
        }
        frameBitmap.recycle()
        promise.resolve(Uri.fromFile(file).toString())
        cleanup(projection, display, reader, callback)
        stopSelf()
      } catch (error: Exception) {
        cropped?.recycle()
        promise.reject("CAPTURE_SCREEN_FAILED", error)
        cleanup(projection, display, reader, callback)
        stopSelf()
      }
    }, if (attempt == 0) 700 else 180)
  }

  private fun retryOrFinish(
    reader: ImageReader,
    width: Int,
    height: Int,
    attempt: Int,
    promise: Promise,
    projection: MediaProjection?,
    display: android.hardware.display.VirtualDisplay?,
    callback: MediaProjection.Callback?
  ) {
    if (attempt + 1 < MAX_CAPTURE_ATTEMPTS) {
      tryReadFrame(reader, width, height, attempt + 1, promise, projection, display, callback)
      return
    }
    promise.resolve(null)
    cleanup(projection, display, reader, callback)
    stopSelf()
  }

  private fun isMostlyBlack(bitmap: Bitmap): Boolean {
    val sampleStepX = (bitmap.width / 12).coerceAtLeast(1)
    val sampleStepY = (bitmap.height / 12).coerceAtLeast(1)
    var darkCount = 0
    var total = 0
    var y = sampleStepY / 2
    while (y < bitmap.height) {
      var x = sampleStepX / 2
      while (x < bitmap.width) {
        val pixel = bitmap.getPixel(x, y)
        val r = Color.red(pixel)
        val g = Color.green(pixel)
        val b = Color.blue(pixel)
        if (r + g + b < 36) darkCount++
        total++
        x += sampleStepX
      }
      y += sampleStepY
    }
    return total > 0 && darkCount.toFloat() / total.toFloat() > 0.96f
  }

  private fun cleanup(
    projection: MediaProjection?,
    display: android.hardware.display.VirtualDisplay?,
    reader: ImageReader?,
    callback: MediaProjection.Callback?
  ) {
    runCatching { display?.release() }
    runCatching { reader?.close() }
    runCatching {
      if (projection != null && callback != null) {
        projection.unregisterCallback(callback)
      }
    }
    runCatching { projection?.stop() }
    resolvePending(null)
  }

  private fun startForegroundNotification() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "屏幕共享",
        NotificationManager.IMPORTANCE_LOW
      )
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.createNotificationChannel(channel)
    }

    val notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("YSClaude 正在截屏")
      .setContentText("用于发送当前屏幕到聊天")
      .setOngoing(true)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    private const val CHANNEL_ID = "ysclaude-screen-capture"
    private const val NOTIFICATION_ID = 7204
    private const val MAX_CAPTURE_ATTEMPTS = 9
    private const val EXTRA_RESULT_CODE = "resultCode"
    private const val EXTRA_DATA = "data"
    private var pendingPromise: Promise? = null

    fun hasPendingCapture(): Boolean = pendingPromise != null

    fun setPendingPromise(promise: Promise) {
      pendingPromise = promise
    }

    fun clearPendingPromise() {
      pendingPromise = null
    }

    fun capture(context: Context, resultCode: Int, data: Intent) {
      val intent = Intent(context, ScreenCaptureService::class.java).apply {
        putExtra(EXTRA_RESULT_CODE, resultCode)
        putExtra(EXTRA_DATA, data)
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun resolvePending(value: String?) {
      if (value != null) {
        pendingPromise?.resolve(value)
      }
      pendingPromise = null
    }
  }
}
