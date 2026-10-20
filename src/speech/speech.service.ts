// speech.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as speech from '@google-cloud/speech';

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface TranscriptResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
  languageCode: string;
  words?: WordInfo[];
}

export interface WordInfo {
  word: string;
  startTime: number;
  endTime: number;
  confidence: number;
}

export interface StreamConfig {
  languageCode: string;
  alternativeLanguageCodes?: string[];
  encoding?: AudioEncoding;
  sampleRateHertz?: number;
  enableWordTimeOffsets?: boolean;
  enableAutoPunctuation?: boolean;
  model?: SpeechModel;
}

export type AudioEncoding =
  | 'LINEAR16'
  | 'WEBM_OPUS'
  | 'OGG_OPUS'
  | 'MP3'
  | 'FLAC';

export type SpeechModel =
  | 'chirp'
  | 'chirp_2'
  | 'latest_long'
  | 'latest_short'
  | 'phone_call'
  | 'medical_dictation';

// ─────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private readonly client: speech.SpeechClient;
  private readonly projectId: string;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || '';
    try {
      this.client = new speech.SpeechClient(
        process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? { keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS }
          : undefined
      );
    } catch (err: any) {
      this.logger.warn(`SpeechClient init failed: ${err?.message}`);
    }
  }

  // ──────────────────────────────────────────
  // 1. TRANSCRIBE AUDIO FILE (REST Upload)
  //    Use for voice messages, recorded clips
  //    Max: 10MB, < 1 min audio
  // ──────────────────────────────────────────
  async transcribeFile(
    audioBuffer: Buffer,
    config: StreamConfig,
  ): Promise<TranscriptResult[]> {
    const audioBytes = audioBuffer.toString('base64');
    const recognizer = `projects/${this.projectId}/locations/global/recognizers/_`;

    const request: any = {
      recognizer,
      config: {
        autoDecodingConfig: {},
        languageCodes: [
          config.languageCode,
          ...(config.alternativeLanguageCodes ?? []),
        ],
        model: config.model ?? 'chirp_2',
        features: {
          enableAutomaticPunctuation: config.enableAutoPunctuation ?? true,
          enableWordTimeOffsets: config.enableWordTimeOffsets ?? false,
          enableWordConfidence: true,
          maxAlternatives: 1,
          profanityFilter: false,
        },
      },
      content: audioBytes,
    };

    try {
      const [response] = await this.client.recognize(request);
      return this.parseResults(response.results ?? [], config.languageCode);
    } catch (error) {
      this.logger.error('Transcription failed', error);
      throw new BadRequestException(
      );
    }
  }

  // ──────────────────────────────────────────
  // 2. LONG AUDIO — async via Google Cloud Storage
  //    Use for > 1 minute recordings
  //    Audio must be uploaded to GCS first
  // ──────────────────────────────────────────
  async transcribeLongAudio(
    gcsUri: string, // gs://your-bucket/audio.wav
    config: StreamConfig,
  ): Promise<TranscriptResult[]> {
    const recognizer = `projects/${this.projectId}/locations/global/recognizers/_`;

    const request: any = {
      recognizer,
      config: {
        autoDecodingConfig: {},
        languageCodes: [
          config.languageCode,
          ...(config.alternativeLanguageCodes ?? []),
        ],
        model: config.model ?? 'chirp', // chirp = best for long audio
        features: {
          enableAutomaticPunctuation: true,
          enableWordTimeOffsets: true,
          enableWordConfidence: true,
        },
      },
      uri: gcsUri,
    };

    const [operation] = await (this.client as any).batchRecognize(request);
    this.logger.log(`Long audio op started: ${operation.name}`);

    const [response] = await operation.promise();
    const results = Object.values(response.results ?? {})[0] as any;
    return this.parseResults(
      results?.transcript?.results ?? [],
      config.languageCode,
    );
  }

  // ──────────────────────────────────────────
  // 3. STREAMING SESSION
  //    Returns duplex stream for WebSocket gateway
  //    Feeds real-time audio chunks from Flutter mic
  // ──────────────────────────────────────────
  createStreamingSession(config: StreamConfig) {
    const recognizer = `projects/${this.projectId}/locations/global/recognizers/_`;

    const streamingConfig: any = {
      recognizer,
      config: {
        languageCodes: [
          config.languageCode,
          ...(config.alternativeLanguageCodes ?? []),
        ],
        model: config.model ?? 'chirp_2',
        features: {
          enableAutomaticPunctuation: config.enableAutoPunctuation ?? true,
          enableWordTimeOffsets: config.enableWordTimeOffsets ?? false,
          enableWordConfidence: true,
        },
      },
      streamingFeatures: {
        interimResults: true,
        enableVoiceActivityEvents: true,
      },
    };

    // Set encoding config
    if (config.encoding === 'LINEAR16') {
      streamingConfig.config.explicitDecodingConfig = {
        encoding: 'LINEAR16',
        sampleRateHertz: config.sampleRateHertz ?? 16000,
        audioChannelCount: 1,
      };
    } else {
      streamingConfig.config.autoDecodingConfig = {};
    }

    return (this.client as any).streamingRecognize(streamingConfig);
  }

  // ──────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────
  parseResults(results: any[], defaultLanguage: string): TranscriptResult[] {
    return results
      .filter((r) => r?.alternatives?.length > 0)
      .map((result) => {
        const alt = result.alternatives[0];
        const words: WordInfo[] = (alt.words ?? []).map((w: any) => ({
          word: w.word,
          startTime: this.durationToSeconds(w.startOffset ?? w.startTime),
          endTime: this.durationToSeconds(w.endOffset ?? w.endTime),
          confidence: w.confidence ?? 0,
        }));

        return {
          transcript: alt.transcript?.trim() ?? '',
          confidence: Math.round((alt.confidence ?? 0) * 100) / 100,
          isFinal: true,
          languageCode: result.languageCode ?? defaultLanguage,
          words: words.length > 0 ? words : undefined,
        };
      });
  }

  private durationToSeconds(duration: any): number {
    if (!duration) return 0;
    if (typeof duration === 'number') return duration;
    const secs = parseInt(duration.seconds ?? '0', 10);
    const nanos = duration.nanos ?? 0;
    return secs + nanos / 1e9;
  }
}