import { Capacitor } from "@capacitor/core";
import { TextToSpeech } from "@capacitor-community/text-to-speech";
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
export const canSpeak = () => isNative() || (typeof window !== "undefined" && "speechSynthesis" in window);

const language = () => navigator.language || "en-AU";

/** Starts listening. Returns a function that stops it. */
export function listen(h: { onText: (text: string, final: boolean) => void; onEnd: () => void; onError: (message: string) => void }): () => void {
  if (isNative()) {
    let ended = false, last = '';
    const handles: { remove: () => Promise<void> }[] = [];
    let settle = 0;
    const finish = () => {
      if (ended) return;
      ended = true;
      clearTimeout(deadline); clearTimeout(settle);
      handles.forEach(handle => void handle.remove().catch(() => undefined));
      if (last) h.onText(last, true);
      h.onEnd();
    };
    const deadline = window.setTimeout(() => { void native.stop().catch(() => undefined); finish(); }, 25000);
    const add = async (name: string, fn: (d: any) => void) => {
      const handle = await native.addListener(name, fn);
      if (ended) await handle.remove(); else handles.push(handle);
    };
    void (async () => {
      try {
        const avail = await native.available();
        if (ended) return;
        if (!avail.available) throw new Error('Voice input is not available on this phone.');
        const perm = await native.requestPermissions();
        if (ended) return;
        if (perm.speechRecognition !== 'granted') throw new Error('Allow the microphone for APEX Golf in phone settings.');
        await add('partialResults', (d: { matches?: string[] }) => {
          if (ended) return;
          last = d.matches?.[0] || last;
          h.onText(last, false);
        });
        if (ended) return;
        await add('listeningState', (d: { status?: string }) => {
          // Android emits stopped before its final words. Give that result time to arrive.
          if (!ended && d.status === 'stopped') { clearTimeout(settle); settle = window.setTimeout(finish, 1000); }
        });
        if (ended) return;
        const result = await native.start({ language: language(), maxResults: 1, partialResults: true, popup: false });
        if (!ended && result.matches?.[0]) { last = result.matches[0]; finish(); }
      } catch (e) {
        if (ended) return;
        h.onError(e instanceof Error ? e.message : 'Voice input could not start.');
        finish();
      }
    })();
    return () => { if (ended) return; void native.stop().catch(() => undefined); finish(); };
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
  try { rec.start(); } catch { h.onError('Voice input could not start. Try again.'); h.onEnd(); }
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
  if (isNative()) {
    void TextToSpeech.speak({ text: spoken(text), lang: 'en-AU', rate: 1.0 }).then(() => onEnd?.()).catch(() => onEnd?.());
    return;
  }
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
  if (isNative()) { void TextToSpeech.stop().catch(() => undefined); return; }
  if (canSpeak()) window.speechSynthesis.cancel();
}
