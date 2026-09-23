"""Small local-only TTS adapter used by ContentFlow Studio.

The app installs the selected provider into its private virtualenv. No API key
or remote inference endpoint is used. The adapter deliberately fails with a
clear message when a provider changes its Python API rather than silently
falling back to a cloud service.
"""
import argparse

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--provider', required=True)
    p.add_argument('--text', required=True)
    p.add_argument('--output', required=True)
    p.add_argument('--voice', default='')
    p.add_argument('--speed', default='1')
    args = p.parse_args()
    if args.provider == 'chatterbox':
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        import torchaudio
        model = ChatterboxMultilingualTTS.from_pretrained(device='cpu')
        wav = model.generate(args.text, language_id='de', audio_prompt_path=args.voice or None)
        torchaudio.save(args.output, wav.cpu(), model.sr)
        return
    if args.provider == 'qwen3-tts':
        from qwen_tts import Qwen3TTSModel
        import soundfile as sf
        model = Qwen3TTSModel.from_pretrained('Qwen/Qwen3-TTS-0.6B-Base')
        kwargs = {'text': args.text, 'language': 'German'}
        if args.voice:
            kwargs['ref_audio'] = args.voice
        wavs, sr = model.generate_voice_clone(**kwargs)
        sf.write(args.output, wavs[0], sr)
        return
    raise SystemExit('Unbekannter lokaler TTS-Provider')

if __name__ == '__main__':
    main()
