export type LocalTtsProvider = 'qwen3-tts' | 'chatterbox' | 'macos';

export type LocalTtsStatus = {
  provider: LocalTtsProvider;
  installed: boolean;
  ready: boolean;
  modelPath: string | null;
  message: string;
};

export const LOCAL_TTS_CATALOG = [
  { id: 'qwen3-tts' as const, name: 'Qwen3-TTS', description: 'Lokale, expressive deutsche Stimmen mit Voice-Cloning. Empfohlen für finale Sprechertexte.', size: '~2–4 GB' },
  { id: 'chatterbox' as const, name: 'Chatterbox Multilingual', description: 'Lokale mehrsprachige TTS mit Referenzstimme und deutscher Ausgabe.', size: '~1–3 GB' },
];
