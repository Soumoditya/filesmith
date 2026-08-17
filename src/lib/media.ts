import { extensionOf } from "./files";

/**
 * Video and audio, via mediabunny and WebCodecs.
 *
 * The obvious choice here would be ffmpeg.wasm, and it's the wrong one: a
 * ~32MB download, cross-origin isolation headers that break other things, and
 * whole files loaded into memory, so a 500MB video kills the tab. mediabunny
 * is a few kilobytes, drives the browser's own hardware video encoder, and
 * streams — a very large file peaks at a fraction of its size in RAM.
 *
 * The trade is codec coverage: WebCodecs handles what the browser handles, so
 * AVI, WMV and FLV are out. Those are detected up front and explained, rather
 * than failing halfway through a long job.
 */

export type VideoContainer = "mp4" | "webm" | "mkv" | "mov";
export type AudioContainer = "mp3" | "wav" | "ogg" | "m4a" | "flac";

export interface MediaTrackInfo {
  kind: "video" | "audio";
  codec: string | null;
  /** Video only. */
  width?: number;
  height?: number;
  frameRate?: number | null;
  /** Audio only. */
  sampleRate?: number;
  channels?: number;
  languageCode?: string;
}

export interface MediaInfo {
  duration: number;
  format: string;
  tracks: MediaTrackInfo[];
  /** Bytes per second across the whole file. */
  bitrate: number | null;
  size: number;
}

/** Containers WebCodecs can't open. Checked before any work starts. */
const UNSUPPORTED = new Map<string, string>([
  ["avi", "AVI"],
  ["wmv", "WMV"],
  ["flv", "FLV"],
  ["rm", "RealMedia"],
  ["rmvb", "RealMedia"],
  ["vob", "VOB"],
  ["mpg", "MPEG-1/2"],
  ["mpeg", "MPEG-1/2"],
  ["divx", "DivX"],
]);

export function unsupportedFormat(file: File): string | null {
  return UNSUPPORTED.get(extensionOf(file.name)) ?? null;
}

/** Loads mediabunny only when a media tool is actually used. */
async function mb() {
  return import("mediabunny");
}

async function openInput(file: File) {
  const { ALL_FORMATS, BlobSource, Input } = await mb();
  return new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
}

export async function readMediaInfo(file: File): Promise<MediaInfo> {
  const input = await openInput(file);

  const [duration, format, tracks] = await Promise.all([
    input.computeDuration(),
    input.getFormat(),
    input.getTracks(),
  ]);

  const details: MediaTrackInfo[] = [];

  for (const track of tracks) {
    if (track.isVideoTrack()) {
      details.push({
        kind: "video",
        codec: track.codec,
        width: track.displayWidth,
        height: track.displayHeight,
        frameRate: await track.computePacketStats(120).then((s) => s.averagePacketRate),
        languageCode: track.languageCode,
      });
    } else if (track.isAudioTrack()) {
      details.push({
        kind: "audio",
        codec: track.codec,
        sampleRate: track.sampleRate,
        channels: track.numberOfChannels,
        languageCode: track.languageCode,
      });
    }
  }

  return {
    duration,
    format: format.name,
    tracks: details,
    bitrate: duration > 0 ? (file.size * 8) / duration : null,
    size: file.size,
  };
}

export interface ConvertOptions {
  container: VideoContainer | AudioContainer;
  /** Drop the video track — for extracting audio. */
  discardVideo?: boolean;
  /** Drop the audio track — for muting. */
  discardAudio?: boolean;
  width?: number;
  height?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  frameRate?: number;
  /** Seconds. */
  trim?: { start?: number; end?: number };
  rotate?: 0 | 90 | 180 | 270;
}

const MIME: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
};

export const CONTAINER_MIME = MIME;

async function makeOutput(container: string) {
  const {
    BufferTarget,
    FlacOutputFormat,
    MkvOutputFormat,
    MovOutputFormat,
    Mp3OutputFormat,
    Mp4OutputFormat,
    OggOutputFormat,
    Output,
    WavOutputFormat,
    WebMOutputFormat,
  } = await mb();

  const format = (() => {
    switch (container) {
      case "mp4":
        return new Mp4OutputFormat();
      case "webm":
        return new WebMOutputFormat();
      case "mkv":
        return new MkvOutputFormat();
      case "mov":
        return new MovOutputFormat();
      case "mp3":
        return new Mp3OutputFormat();
      case "wav":
        return new WavOutputFormat();
      case "ogg":
        return new OggOutputFormat();
      case "flac":
        return new FlacOutputFormat();
      case "m4a":
        // M4A is an MP4 container holding only an audio track.
        return new Mp4OutputFormat();
      default:
        return new Mp4OutputFormat();
    }
  })();

  return new Output({ format, target: new BufferTarget() });
}

export interface ConvertResult {
  blob: Blob;
  /** Tracks mediabunny had to leave out, and why. */
  discarded: Array<{ reason: string }>;
}

/**
 * Runs a conversion. Everything the media tools do — format change, resize,
 * compress, trim, mute, extract audio — is this one call with different
 * options, because that's genuinely all it is at the container level.
 */
export async function convertMedia(
  file: File,
  options: ConvertOptions,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<ConvertResult> {
  const { Conversion } = await mb();

  const input = await openInput(file);
  const output = await makeOutput(options.container);

  const conversion = await Conversion.init({
    input,
    output,
    video: options.discardVideo
      ? { discard: true }
      : {
          width: options.width,
          height: options.height,
          fit: options.width && options.height ? "contain" : undefined,
          bitrate: options.videoBitrate,
          frameRate: options.frameRate,
          rotate: options.rotate,
        },
    audio: options.discardAudio
      ? { discard: true }
      : { bitrate: options.audioBitrate },
    trim: options.trim,
  });

  if (onProgress) conversion.onProgress = (fraction) => onProgress(fraction);

  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((t) => t.reason).join(", ");
    throw new Error(
      `This file can't be converted to ${options.container.toUpperCase()}${
        reasons ? ` — ${reasons}` : ""
      }.`,
    );
  }

  signal?.addEventListener("abort", () => void conversion.cancel(), { once: true });

  await conversion.execute();

  const buffer = (output.target as { buffer: ArrayBuffer | null }).buffer;
  if (!buffer) throw new Error("The conversion produced no output.");

  return {
    blob: new Blob([buffer], {
      type: MIME[options.container] ?? "application/octet-stream",
    }),
    discarded: conversion.discardedTracks.map((t) => ({ reason: String(t.reason) })),
  };
}

/** Which codecs this browser can actually encode, for honest UI. */
export async function encodableFormats(): Promise<{ video: string[]; audio: string[] }> {
  const { getEncodableVideoCodecs, getEncodableAudioCodecs } = await mb();
  const [video, audio] = await Promise.all([
    getEncodableVideoCodecs(),
    getEncodableAudioCodecs(),
  ]);
  return { video: video as string[], audio: audio as string[] };
}

/**
 * Turns a clip into an animated GIF.
 *
 * GIF isn't a WebCodecs format, so frames are decoded, drawn to a canvas and
 * encoded with gifenc. Deliberately capped: GIF stores every frame as its own
 * palettised image, so a few seconds at full size becomes tens of megabytes,
 * which is never what someone wants from a "make me a GIF" button.
 */
export async function videoToGif(
  file: File,
  options: {
    start: number;
    end: number;
    fps: number;
    width: number;
    /** 2-256; fewer colours means a much smaller file. */
    colours?: number;
  },
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const [{ ALL_FORMATS, BlobSource, Input, VideoSampleSink }, gifenc] = await Promise.all(
    [mb(), import("gifenc")],
  );

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("There's no video in this file to turn into a GIF.");

  const sink = new VideoSampleSink(track);
  const step = 1 / options.fps;
  const timestamps: number[] = [];
  for (let t = options.start; t < options.end; t += step) timestamps.push(t);

  const aspect = track.displayHeight / track.displayWidth;
  const width = Math.round(options.width / 2) * 2;
  const height = Math.round((width * aspect) / 2) * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser wouldn't give us a canvas to draw on.");

  const encoder = gifenc.GIFEncoder();
  const delay = Math.round(1000 / options.fps);
  let done = 0;

  for await (const sample of sink.samplesAtTimestamps(timestamps)) {
    if (sample) {
      ctx.clearRect(0, 0, width, height);
      sample.draw(ctx, 0, 0, width, height);
      sample.close();

      const { data } = ctx.getImageData(0, 0, width, height);
      const palette = gifenc.quantize(data, options.colours ?? 128);
      const indexed = gifenc.applyPalette(data, palette);
      encoder.writeFrame(indexed, width, height, { palette, delay });
    }

    done++;
    onProgress?.(done / timestamps.length);
  }

  encoder.finish();
  return new Blob([encoder.bytes() as BlobPart], { type: "image/gif" });
}

/** `1:23` or `1:02:03`, for durations. */
export function formatTimecode(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Reads `1:23`, `83`, or `1:02:03` back into seconds. */
export function parseTimecode(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d*\.?\d*$/.test(p))) return null;

  const numbers = parts.map(Number);
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return null;

  if (numbers.length === 1) return numbers[0];
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  if (numbers.length === 3) return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  return null;
}

/** A readable bitrate, e.g. "2.4 Mbps". */
export function formatBitrate(bitsPerSecond: number | null): string {
  if (!bitsPerSecond || !Number.isFinite(bitsPerSecond)) return "unknown";
  if (bitsPerSecond >= 1_000_000) return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
  return `${Math.round(bitsPerSecond / 1000)} kbps`;
}

export const RESOLUTION_PRESETS = [
  { label: "Keep original", height: 0 },
  { label: "2160p — 4K", height: 2160 },
  { label: "1440p — 2K", height: 1440 },
  { label: "1080p — Full HD", height: 1080 },
  { label: "720p — HD", height: 720 },
  { label: "480p", height: 480 },
  { label: "360p", height: 360 },
];

/** Sensible video bitrates by height, in bits per second. */
export function suggestedBitrate(height: number): number {
  if (height >= 2160) return 35_000_000;
  if (height >= 1440) return 16_000_000;
  if (height >= 1080) return 8_000_000;
  if (height >= 720) return 5_000_000;
  if (height >= 480) return 2_500_000;
  return 1_000_000;
}
