package xyz.marvlosphere.marvie

import android.app.Activity
import android.media.projection.MediaProjectionManager
import androidx.activity.result.ActivityResult
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.lifecycleScope
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.screencapture.ScreenCaptureParams
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * Publishes a screen-share track as a SECOND, independent LiveKit room
 * participant (identity like "<name>-screen") rather than trying to pipe
 * native-captured frames into the WebView's own JS-side LiveKit connection.
 * The latter would need bridging raw MediaProjection output into a
 * MediaStreamTrack visible to page JS — the fragile part every generic
 * Cordova/Capacitor screen-share plugin struggles with. Joining as a second
 * participant sidesteps that entirely: LiveKit's own Android SDK already
 * does the capture/encode/publish work, fully decoupled from the WebView.
 */
@CapacitorPlugin(name = "ScreenShare")
class ScreenSharePlugin : Plugin() {
    private var room: Room? = null
    private var watchJob: Job? = null

    @PluginMethod
    fun start(call: PluginCall) {
        val serverUrl = call.getString("serverUrl")
        val token = call.getString("token")
        if (serverUrl == null || token == null) {
            call.reject("serverUrl and token are required")
            return
        }

        val currentActivity = activity
        if (currentActivity == null) {
            call.reject("No activity available")
            return
        }

        // Kept alive across the async screen-capture consent dialog; Capacitor
        // restores this same call object into handleScreenCaptureResult below.
        call.setKeepAlive(true)
        val projectionManager =
            currentActivity.getSystemService(Activity.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(call, projectionManager.createScreenCaptureIntent(), "handleScreenCaptureResult")
    }

    @ActivityCallback
    private fun handleScreenCaptureResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return

        if (result.resultCode != Activity.RESULT_OK || result.data == null) {
            call.reject("Screen capture permission was denied")
            return
        }

        val serverUrl = call.getString("serverUrl")
        val token = call.getString("token")
        val projectionData = result.data
        val currentActivity = activity
        val lifecycleOwner = currentActivity as? LifecycleOwner

        if (serverUrl == null || token == null || projectionData == null || currentActivity == null || lifecycleOwner == null) {
            call.reject("Missing data to start screen share")
            return
        }

        val newRoom = LiveKit.create(currentActivity.applicationContext)
        room = newRoom

        lifecycleOwner.lifecycleScope.launch {
            try {
                newRoom.connect(serverUrl, token)
                newRoom.localParticipant.setScreenShareEnabled(true, ScreenCaptureParams(projectionData))
                watchForOtherScreenShares(newRoom, lifecycleOwner)
                val ret = JSObject()
                ret.put("started", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to start screen share: ${e.message}")
            }
        }
    }

    // Only one screen share should be active in a room at a time, like
    // Google Meet — if anyone else (including this same app running on
    // another device) starts sharing while we are, stop our own instead of
    // leaving two simultaneous shares. The web app enforces the same rule
    // independently for its own LiveKit connection (see ExtraControls.tsx),
    // since this plugin's Room is a second, separate participant the
    // WebView's `room` object doesn't control.
    private fun watchForOtherScreenShares(activeRoom: Room, lifecycleOwner: LifecycleOwner) {
        // Room.events is LiveKit's own EventListenable<RoomEvent>, not a plain
        // kotlinx Flow, so it needs LiveKit's own collect extension (imported
        // above) rather than kotlinx.coroutines.flow.collect/onEach — that
        // extension's collect() never returns, so the cancellable handle we
        // keep is the outer launch's Job, not collect()'s own return value.
        watchJob = lifecycleOwner.lifecycleScope.launch {
            activeRoom.events.collect { event ->
                if (
                    event is RoomEvent.TrackPublished &&
                    event.publication.source == Track.Source.SCREEN_SHARE &&
                    event.participant.identity != activeRoom.localParticipant.identity
                ) {
                    lifecycleOwner.lifecycleScope.launch { stopInternal() }
                }
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        val lifecycleOwner = activity as? LifecycleOwner
        if (lifecycleOwner == null) {
            room?.disconnect()
            room = null
            call.resolve()
            return
        }

        lifecycleOwner.lifecycleScope.launch {
            stopInternal()
            call.resolve()
        }
    }

    private suspend fun stopInternal() {
        watchJob?.cancel()
        watchJob = null
        val currentRoom = room ?: return
        try {
            currentRoom.localParticipant.setScreenShareEnabled(false)
        } catch (e: Exception) {
            // Best-effort — still disconnect below so the room doesn't leak.
        }
        currentRoom.disconnect()
        room = null
    }
}
