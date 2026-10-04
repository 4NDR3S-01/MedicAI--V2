import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import * as Speech from 'expo-speech';

import { toSpeech } from '../utils/speech-text';

export { isExitPhrase, isNo, isYes } from '../utils/speech-text';

/** Voz: mono, 16 kHz y comprimida. Un minuto ocupa unos 240 KB. */
const VOICE_RECORDING: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 32000 },
};

const TICK_MS = 100;
const CALIBRATION_MS = 500;
/** Silencio tras hablar que se toma como "terminé". */
const END_SILENCE_MS = 1400;
const MAX_RECORDING_MS = 45_000;

export type ListenOptions = {
  /** Si no se oye nada en este tiempo, se deja de escuchar (sin audio). */
  noSpeechTimeoutMs?: number;
};

export type MicPermission = 'granted' | 'denied';

/**
 * Micrófono con detección de silencio: graba hasta que la persona deja de
 * hablar (por el volumen medido), y devuelve el archivo o null si no se oyó
 * nada. Si el teléfono no informa el volumen, graba hasta que se toque
 * "listo" (finish) o se alcance el máximo.
 */
export function useVoiceRecorder() {
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const [level, setLevel] = useState(0);
  const [recording, setRecording] = useState(false);
  /** false si el teléfono no informa el volumen: hay que terminar a mano. */
  const [autoStop, setAutoStop] = useState(true);
  const stopRequest = useRef<'finish' | 'cancel' | null>(null);
  const busy = useRef(false);

  const ensurePermission = useCallback(async (): Promise<MicPermission> => {
    const { granted } = await requestRecordingPermissionsAsync();
    return granted ? 'granted' : 'denied';
  }, []);

  const listen = useCallback(async ({ noSpeechTimeoutMs = 8000 }: ListenOptions = {}): Promise<string | null> => {
    if (busy.current) return null;
    busy.current = true;
    stopRequest.current = null;
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);

      const started = Date.now();
      let noise = 0;
      let samples = 0;
      let heard = false;
      let lastLoud = started;
      let meteringSeen = false;

      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          const now = Date.now();
          const elapsed = now - started;
          const db = recorder.getStatus().metering;
          if (typeof db === 'number' && Number.isFinite(db)) {
            meteringSeen = true;
            setLevel(Math.max(0, Math.min(1, (db + 60) / 50)));
            if (elapsed < CALIBRATION_MS) {
              noise += db;
              samples += 1;
            } else {
              // Umbral: un poco por encima del ruido de fondo medido al empezar.
              const floor = samples ? noise / samples : -60;
              const threshold = Math.max(Math.min(floor + 10, -25), -50);
              if (db > threshold) {
                heard = true;
                lastLoud = now;
              }
            }
          } else if (elapsed > CALIBRATION_MS + 300 && !meteringSeen) {
            setAutoStop(false);
          }

          const silenceAfterSpeech = meteringSeen && heard && now - lastLoud > END_SILENCE_MS;
          const nothingHeard = meteringSeen && !heard && elapsed > noSpeechTimeoutMs;
          if (stopRequest.current || silenceAfterSpeech || nothingHeard || elapsed > MAX_RECORDING_MS) {
            // Sin medición de volumen no se sabe si habló: se asume que sí.
            if (!meteringSeen) heard = stopRequest.current !== 'cancel';
            clearInterval(timer);
            resolve();
          }
        }, TICK_MS);
      });

      await recorder.stop();
      const cancelled = stopRequest.current === 'cancel';
      return heard && !cancelled ? recorder.uri : null;
    } finally {
      setRecording(false);
      setLevel(0);
      busy.current = false;
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
    }
  }, [recorder]);

  /** Terminar de hablar ya (se envía lo grabado). */
  const finish = useCallback(() => {
    stopRequest.current = 'finish';
  }, []);

  /** Descartar lo grabado. */
  const cancel = useCallback(() => {
    stopRequest.current = 'cancel';
  }, []);

  useEffect(() => () => {
    stopRequest.current = 'cancel';
  }, []);

  return { listen, finish, cancel, ensurePermission, level, recording, autoStop };
}

// ─── Leer en voz alta ───────────────────────────────────────────────────────

let preferredVoice: { language: string; identifier?: string } | null = null;

/** Voz en español: primero latinoamericana, si no la de España. */
async function pickVoice() {
  if (preferredVoice) return preferredVoice;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const spanish = voices.filter((voice) => voice.language?.toLowerCase().startsWith('es'));
    const order = ['es-co', 'es-us', 'es-mx', 'es-419', 'es-es'];
    const rank = (language: string) => {
      const index = order.indexOf(language.toLowerCase().replace('_', '-'));
      return index < 0 ? order.length : index;
    };
    const best = spanish.sort((a, b) => rank(a.language) - rank(b.language))[0];
    preferredVoice = best ? { language: best.language, identifier: best.identifier } : { language: 'es-US' };
  } catch {
    preferredVoice = { language: 'es-US' };
  }
  return preferredVoice;
}

/** Lee el texto y se resuelve al terminar (o al interrumpirlo con stopSpeaking). */
export async function speak(text: string): Promise<void> {
  const voice = await pickVoice();
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => undefined);
  await new Promise<void>((resolve) => {
    Speech.speak(toSpeech(text), {
      language: voice.language,
      voice: voice.identifier,
      rate: 1.0,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export const stopSpeaking = () => Speech.stop().catch(() => undefined);
