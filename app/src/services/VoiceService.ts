import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import * as Speech from "expo-speech";

const BACKEND_URL = "https://jarvis-beige-five.vercel.app";

type OnTranscript = (text: string) => void;
type OnReply = (reply: string) => void;
type OnError = (error: string) => void;
type OnListening = (listening: boolean) => void;

let conversationHistory: { role: string; content: string }[] = [];

export const VoiceService = {
  onTranscript: null as OnTranscript | null,
  onReply: null as OnReply | null,
  onError: null as OnError | null,
  onListening: null as OnListening | null,
  _subs: [] as { remove: () => void }[],

  init() {
    this._subs.push(
      ExpoSpeechRecognitionModule.addListener("result", (event: any) => {
        const text = event.results?.[0]?.transcript;
        if (text && event.isFinal) {
          this.onTranscript?.(text);
          this.sendToBackend(text);
        }
      })
    );

    this._subs.push(
      ExpoSpeechRecognitionModule.addListener("error", (event: any) => {
        console.error("Speech error:", event.error);
        this.onError?.(event.error || "Voice recognition failed");
        this.onListening?.(false);
      })
    );

    this._subs.push(
      ExpoSpeechRecognitionModule.addListener("end", () => {
        this.onListening?.(false);
      })
    );
  },

  async startListening() {
    try {
      await Speech.stop();

      const { granted } =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!granted) {
        this.onError?.("Microphone permission denied");
        return;
      }

      ExpoSpeechRecognitionModule.start({ lang: "en-US", interimResults: false });
      this.onListening?.(true);
    } catch (err: any) {
      this.onError?.(err.message || "Could not start listening");
    }
  },

  async stopListening() {
    try {
      ExpoSpeechRecognitionModule.stop();
      this.onListening?.(false);
    } catch (err: any) {
      this.onError?.(err.message || "Could not stop listening");
    }
  },

  async sendToBackend(message: string) {
    try {
      const res = await fetch(`${BACKEND_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: conversationHistory.slice(-20),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        this.onError?.(data.error || "Backend error");
        return;
      }

      conversationHistory.push({ role: "user", content: message });
      conversationHistory.push({ role: "assistant", content: data.reply });

      if (conversationHistory.length > 20) {
        conversationHistory = conversationHistory.slice(-20);
      }

      this.onReply?.(data.reply);
      this.speak(data.reply);
    } catch (err: any) {
      this.onError?.(err.message || "Failed to reach backend");
    }
  },

  speak(text: string) {
    Speech.speak(text, {
      language: "en-US",
      pitch: 1.0,
      rate: 0.95,
    });
  },

  destroy() {
    this._subs.forEach((s) => s.remove());
    this._subs = [];
  },

  clearHistory() {
    conversationHistory = [];
  },
};
