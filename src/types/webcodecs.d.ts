/**
 * Minimal WebCodecs type declarations for VideoEncoder / VideoFrame.
 * These APIs are available in Chrome 94+, Edge 94+.
 */

interface VideoEncoderConfig {
  codec: string;
  width: number;
  height: number;
  bitrate?: number;
  framerate?: number;
  hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
}

interface VideoEncoderInit {
  output: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;
  error: (error: DOMException) => void;
}

interface EncodedVideoChunk {
  type: 'key' | 'delta';
  timestamp: number;
  duration: number | null;
  byteLength: number;
  copyTo(destination: ArrayBufferView): void;
}

interface EncodedVideoChunkMetadata {
  decoderConfig?: any;
}

interface VideoEncoderEncodeOptions {
  keyFrame?: boolean;
}

declare class VideoEncoder {
  constructor(init: VideoEncoderInit);
  configure(config: VideoEncoderConfig): void;
  encode(frame: VideoFrame, options?: VideoEncoderEncodeOptions): void;
  flush(): Promise<void>;
  close(): void;
  readonly encodeQueueSize: number;
  readonly state: 'unconfigured' | 'configured' | 'closed';
}

interface VideoFrameInit {
  timestamp: number;
  duration?: number;
  alpha?: 'keep' | 'discard';
}

declare class VideoFrame {
  constructor(source: HTMLCanvasElement | OffscreenCanvas | ImageBitmap, init: VideoFrameInit);
  close(): void;
  readonly timestamp: number;
  readonly duration: number | null;
  readonly codedWidth: number;
  readonly codedHeight: number;
}
