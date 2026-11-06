import { Capacitor } from "@capacitor/core";
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

// Talking to the caddie and hearing it back, using the phone's own speech tools.

type WebRec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};

// The plugin's calls, described here so a version change can not break the build.
type Native = {
  available: () => Promise<{ available: boolean }>;
  requestPermissions: () => Promise<{ speechRecognition?: string }>;
  start: (o: { language: string; maxResults: number; partialResults: boolean; popup: boolean }) => Promise<{ matches?: string[] }>;
  stop: () => Promise<void>;
  addListener: (name: string, fn: (d: any) => void) => Promise<{ remove: () => Promise<void> }>;
  removeAllListeners: () => Promise<void>;
};
const native = SpeechRecognition as unknown as Native;
const isNative = () => Capacitor.isNativePlatform();

function webClass(): (new () => WebRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => WebRec; webkitSpeechRecognition?: new () => WebRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => isNative() || webClass() !== null;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

const language = () => navigator.language || "en-AU";

/** Starts listening. Returns a function that stops it. */
export function listen(h: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (message: string) => void }): () => void {
  if (isNative()) {
    let ended = false;
    let last = "";
    const finish = () => {
      if (ended) return;
      ended = true;
      void native.removeAllListeners().catch(() => undefined);
      if (last) h.onText(last, true);
      h.onEnd();
    };
    void (async () => {
      try {
        const avail = await native.available();
        if (!avail.available) throw new Error("Voice input is not available on this phone.");
        const perm = await native.requestPermissions();
        if (perm.speechRecognition && perm.speechRecognition !== "granted") throw new Error("Microphone access is blocked. Allow the microphone for APEX Golf in your phone settings.");
        await native.removeAllListeners();
        await native.addListener("partialResults", (d: { matches?: string[] }) => {
          last = (d.matches && d.matches[0]) || last;
          h.onText(last, false);
        });
        await native.addListener("listeningState", (d: { status?: string }) => {
          if (d.status === "stopped") finish();
        });
        await native.start({ language: language(), maxResults: 1, partialResults: true, popup: false });
      } catch (e) {
        h.onError(e instanceof Error ? e.message : "Voice input could not start.");
        finish();
      }
    })();
    return () => {
      void native.stop().catch(() => undefined);
      window.setTimeout(finish, 600);
    };
  }

  const Rec = webClass();
  if (!Rec) {
    h.onError("Voice input is not supported here.");
    h.onEnd();
    return () => {};
  }
  const rec = new Rec();
  rec.lang = language();
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) final = true;
    }
    h.onText(text.trim(), final);
  };
  rec.onerror = (e) => {
    h.onError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access is blocked." : e.error === "no-speech" ? "I didn't hear anything. Tap the mic and try again." : "Voice input stopped. Tap the mic to try again.");
  };
  rec.onend = h.onEnd;
  rec.start();
  return () => rec.stop();
}

/** Say it the way a person would: units spelled out. */
function spoken(text: string) {
  return text
    .replace(/km\/h/g, "kilometres per hour")
    .replace(/(\d)\s?m\b/g, "$1 metres")
    .replace(/(\d)\s?yd\b/g, "$1 yards")
    .replace(/°C/g, " degrees")
    .replace(/\s{2,}/g, " ");
}

export function speak(text: string, onEnd?: () => void) {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(spoken(text));
  const lang = language();
  u.lang = lang;
  const voices = synth.getVoices();
  const pick = voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(lang.slice(0, 2)));
  if (pick) u.voice = pick;
  u.rate = 1.02;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
