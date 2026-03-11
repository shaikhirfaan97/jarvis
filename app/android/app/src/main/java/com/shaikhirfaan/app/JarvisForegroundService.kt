package com.shaikhirfaan.app

import android.app.*
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.util.Log
import androidx.core.app.NotificationCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class JarvisForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "jarvis_channel"
        const val NOTIFICATION_ID = 1
        const val BACKEND_URL = "https://jarvis-beige-five.vercel.app/chat"
        const val TAG = "JarvisService"
    }

    private var speechRecognizer: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var isTtsSpeaking = false
    private val mainHandler = Handler(Looper.getMainLooper())
    private val conversationHistory = mutableListOf<Map<String, String>>()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification("Jarvis is listening..."))
        initTts()
        mainHandler.post { startListening() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.post {
            speechRecognizer?.destroy()
            speechRecognizer = null
        }
        tts?.stop()
        tts?.shutdown()
    }

    // ── Notification ─────────────────────────────────────────────

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Jarvis Assistant",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Jarvis background listening service"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(channel)
    }

    private fun buildNotification(text: String): Notification {
        val openAppIntent = Intent(this, MainActivity::class.java).let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Jarvis")
            .setContentText(text)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openAppIntent)
            .setOngoing(true)
            .setSilent(true)
            .build()
    }

    private fun updateNotification(text: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification(text))
    }

    // ── Speech Recognition ────────────────────────────────────────

    private fun startListening() {
        if (isTtsSpeaking) {
            mainHandler.postDelayed({ startListening() }, 500)
            return
        }

        speechRecognizer?.destroy()
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this)
        speechRecognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) {
                updateNotification("Listening...")
            }
            override fun onBeginningOfSpeech() {}
            override fun onRmsChanged(rmsdB: Float) {}
            override fun onBufferReceived(buffer: ByteArray?) {}
            override fun onPartialResults(partialResults: Bundle?) {}
            override fun onEvent(eventType: Int, params: Bundle?) {}

            override fun onEndOfSpeech() {
                updateNotification("Processing...")
            }

            override fun onResults(results: Bundle?) {
                val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                val text = matches?.firstOrNull()
                if (!text.isNullOrBlank()) {
                    Log.d(TAG, "Heard: $text")
                    updateNotification("Thinking...")
                    sendToBackend(text)
                } else {
                    mainHandler.postDelayed({ startListening() }, 300)
                }
            }

            override fun onError(error: Int) {
                val msg = when (error) {
                    SpeechRecognizer.ERROR_NO_MATCH -> "no match"
                    SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "timeout"
                    SpeechRecognizer.ERROR_AUDIO -> "audio error"
                    SpeechRecognizer.ERROR_NETWORK -> "network error"
                    else -> "error $error"
                }
                Log.d(TAG, "Recognition error: $msg")
                mainHandler.postDelayed({ startListening() }, 1000)
            }
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }
        speechRecognizer?.startListening(intent)
    }

    // ── Backend Call ──────────────────────────────────────────────

    private fun sendToBackend(message: String) {
        Thread {
            try {
                val history = JSONArray()
                conversationHistory.takeLast(20).forEach { entry ->
                    history.put(JSONObject().apply {
                        put("role", entry["role"])
                        put("content", entry["content"])
                    })
                }

                val body = JSONObject().apply {
                    put("message", message)
                    put("history", history)
                }.toString()

                val url = URL(BACKEND_URL)
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.doOutput = true
                conn.connectTimeout = 15000
                conn.readTimeout = 30000

                OutputStreamWriter(conn.outputStream).use { it.write(body) }

                val response = conn.inputStream.bufferedReader().readText()
                val reply = JSONObject(response).getString("reply")

                conversationHistory.add(mapOf("role" to "user", "content" to message))
                conversationHistory.add(mapOf("role" to "assistant", "content" to reply))
                if (conversationHistory.size > 20) {
                    repeat(conversationHistory.size - 20) { conversationHistory.removeAt(0) }
                }

                mainHandler.post { speak(reply) }
            } catch (e: Exception) {
                Log.e(TAG, "Backend error: ${e.message}")
                mainHandler.post {
                    updateNotification("Jarvis is listening...")
                    mainHandler.postDelayed({ startListening() }, 1000)
                }
            }
        }.start()
    }

    // ── Text to Speech ────────────────────────────────────────────

    private fun initTts() {
        tts = TextToSpeech(this) { status ->
            if (status == TextToSpeech.SUCCESS) {
                tts?.language = Locale.US
                tts?.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        isTtsSpeaking = true
                        updateNotification("Speaking...")
                    }
                    override fun onDone(utteranceId: String?) {
                        isTtsSpeaking = false
                        updateNotification("Jarvis is listening...")
                        mainHandler.postDelayed({ startListening() }, 500)
                    }
                    override fun onError(utteranceId: String?) {
                        isTtsSpeaking = false
                        mainHandler.postDelayed({ startListening() }, 500)
                    }
                })
            }
        }
    }

    private fun speak(text: String) {
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "jarvis_reply")
    }
}
