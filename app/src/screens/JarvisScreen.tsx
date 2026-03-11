import React, { useEffect, useState, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  SafeAreaView,
  NativeModules,
  Platform,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { VoiceService } from "../services/VoiceService";

const { JarvisService } = NativeModules;

type Message = {
  id: string;
  role: "user" | "assistant" | "error";
  text: string;
};

export default function JarvisScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Tap the mic to speak");
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (Platform.OS === "android" && JarvisService) {
      JarvisService.start();
    }

    VoiceService.init();

    VoiceService.onTranscript = (text) => {
      addMessage("user", text);
      setStatus("Thinking...");
    };

    VoiceService.onReply = (reply) => {
      addMessage("assistant", reply);
      setStatus("Tap the mic to speak");
    };

    VoiceService.onError = (error) => {
      addMessage("error", error);
      setStatus("Tap the mic to speak");
    };

    VoiceService.onListening = (isListening) => {
      setListening(isListening);
      if (isListening) setStatus("Listening...");
    };

    return () => {
      VoiceService.destroy();
    };
  }, []);

  const addMessage = (role: Message["role"], text: string) => {
    setMessages((prev) => [...prev, { id: Date.now().toString(), role, text }]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const toggleListening = () => {
    if (listening) {
      VoiceService.stopListening();
    } else {
      VoiceService.startListening();
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageBubble,
        item.role === "user"
          ? styles.userBubble
          : item.role === "error"
          ? styles.errorBubble
          : styles.assistantBubble,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          item.role === "user" ? styles.userText : styles.assistantText,
        ]}
      >
        {item.text}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <Text style={styles.title}>JARVIS</Text>
      <Text style={styles.serviceStatus}>● Background listening active</Text>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messageList}
        contentContainerStyle={styles.messageListContent}
      />

      <Text style={styles.status}>{status}</Text>

      <TouchableOpacity
        style={[styles.micButton, listening && styles.micButtonActive]}
        onPress={toggleListening}
        activeOpacity={0.7}
      >
        <Text style={styles.micIcon}>{listening ? "⏹" : "🎙"}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
    paddingTop: 20,
  },
  title: {
    color: "#00d4ff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 6,
    marginVertical: 16,
  },
  messageList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messageListContent: {
    paddingBottom: 8,
  },
  messageBubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
  },
  userBubble: {
    backgroundColor: "#1a3a5c",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: "#1a1a2e",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  errorBubble: {
    backgroundColor: "#3c1111",
    alignSelf: "center",
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userText: {
    color: "#e0e0e0",
  },
  assistantText: {
    color: "#b0c4de",
  },
  status: {
    color: "#666",
    textAlign: "center",
    fontSize: 14,
    marginVertical: 8,
  },
  micButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#1a1a2e",
    borderWidth: 2,
    borderColor: "#00d4ff",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 32,
  },
  micButtonActive: {
    backgroundColor: "#00d4ff22",
    borderColor: "#ff4444",
  },
  micIcon: {
    fontSize: 30,
  },
  serviceStatus: {
    color: "#00d4ff88",
    fontSize: 11,
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 1,
  },
});
