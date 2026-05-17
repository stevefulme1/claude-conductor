import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  sessionId: string | null;
  visible: boolean;
  onToggle: () => void;
}

// Extend Window for vendor-prefixed SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

export default function VoiceInput({ sessionId, visible, onToggle }: Props) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<unknown>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!sessionId) return;

    const SpeechRecognition =
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognition = new (SpeechRecognition as any)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final_ = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final_ += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setTranscript(interim || final_);

      if (final_) {
        // Write the finalized text to the active terminal
        invoke("write_terminal", {
          sessionId,
          data: final_,
        }).catch(console.error);
        setTranscript("");
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied");
      } else if (event.error !== "no-speech") {
        setError(`Speech error: ${event.error}`);
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
    setError(null);
  }, [sessionId]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (recognitionRef.current as any).stop();
      recognitionRef.current = null;
    }
    setListening(false);
    setTranscript("");
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stopListening();
    } else {
      startListening();
    }
    onToggle();
  }, [listening, startListening, stopListening, onToggle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (recognitionRef.current as any).stop();
      }
    };
  }, []);

  if (!visible) return null;

  if (!supported) {
    return (
      <div style={{
        padding: "8px 12px",
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-subtle)",
        fontSize: 12,
        color: "var(--text-tertiary)",
      }}>
        Voice input not supported in this environment
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 12px",
      background: listening ? "rgba(255, 59, 48, 0.08)" : "var(--bg-secondary)",
      borderBottom: "1px solid var(--border-subtle)",
      transition: "background 0.2s",
    }}>
      <button
        onClick={toggle}
        title="Toggle voice input (Cmd+Shift+V)"
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          border: "none",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: listening ? "#ff3b30" : "var(--bg-tertiary)",
          color: listening ? "#fff" : "var(--text-secondary)",
          fontSize: 14,
          position: "relative",
        }}
      >
        {listening && (
          <span style={{
            position: "absolute",
            top: -2,
            right: -2,
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ff3b30",
            animation: "voice-pulse 1.2s ease-in-out infinite",
          }} />
        )}
        <span role="img" aria-label="microphone">
          {listening ? "■" : "●"}
        </span>
      </button>

      {listening && (
        <span style={{
          fontSize: 11,
          color: "#ff3b30",
          fontWeight: 600,
          animation: "voice-pulse 1.2s ease-in-out infinite",
        }}>
          Listening...
        </span>
      )}

      {transcript && (
        <span style={{
          fontSize: 12,
          color: "var(--text-secondary)",
          fontStyle: "italic",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
        }}>
          {transcript}
        </span>
      )}

      {error && (
        <span style={{
          fontSize: 11,
          color: "#ff6b6b",
        }}>
          {error}
        </span>
      )}

      <style>{`
        @keyframes voice-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
