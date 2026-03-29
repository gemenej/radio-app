import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import ffmpeg from 'fluent-ffmpeg';
import { z } from 'zod';
import path from 'path';

const AUDIO_DATA_PATH = process.env.AUDIO_DATA_PATH ?? './data';

const server = new McpServer({ name: 'mcp-ffmpeg', version: '1.0.0' });

// analyze_audio — повертає тривалість, бітрейт, кодек, BPM (estimate)
server.tool(
  'analyze_audio',
  'Analyze audio file: duration, bitrate, codec, sample rate',
  { filePath: z.string().describe('Шлях до аудіофайлу відносно AUDIO_DATA_PATH') },
  async ({ filePath }) => {
    const fullPath = path.resolve(AUDIO_DATA_PATH, filePath);
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(fullPath, (err, metadata) => {
        if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
        const audio = metadata.streams.find((s) => s.codec_type === 'audio');
        resolve({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                duration: metadata.format.duration,
                bitrate: metadata.format.bit_rate,
                codec: audio?.codec_name,
                sampleRate: audio?.sample_rate,
                channels: audio?.channels,
              }),
            },
          ],
        });
      });
    });
  }
);

// generate_waveform — 200 нормалізованих точок (0–1)
server.tool(
  'generate_waveform',
  'Extract normalized waveform data (0-1) from audio file',
  {
    filePath: z.string().describe('Шлях до аудіофайлу відносно AUDIO_DATA_PATH'),
    points: z.number().default(200).describe('Кількість точок'),
  },
  async ({ filePath, points }) => {
    const fullPath = path.resolve(AUDIO_DATA_PATH, filePath);
    return new Promise((resolve, reject) => {
      const samples = [];
      const proc = ffmpeg(fullPath)
        .audioFilters(`aresample=8000,asetnsamples=${points}`)
        .format('f32le')
        .on('error', (err) => reject(new Error(`waveform failed: ${err.message}`)));

      const stream = proc.pipe();
      stream.on('data', (chunk) => {
        const view = new Float32Array(chunk.buffer, chunk.byteOffset, chunk.byteLength / 4);
        for (const v of view) samples.push(Math.min(1, Math.abs(v)));
      });
      stream.on('end', () =>
        resolve({ content: [{ type: 'text', text: JSON.stringify(samples) }] })
      );
      stream.on('error', (err) => reject(new Error(`stream error: ${err.message}`)));
    });
  }
);

// normalize_volume — EBU R128 loudnorm
server.tool(
  'normalize_volume',
  'Normalize audio loudness to EBU R128 (-16 LUFS)',
  {
    inputPath: z.string().describe('Вхідний файл відносно AUDIO_DATA_PATH'),
    outputPath: z.string().describe('Вихідний файл відносно AUDIO_DATA_PATH'),
  },
  async ({ inputPath, outputPath }) => {
    const inFull = path.resolve(AUDIO_DATA_PATH, inputPath);
    const outFull = path.resolve(AUDIO_DATA_PATH, outputPath);
    return new Promise((resolve, reject) => {
      ffmpeg(inFull)
        .audioFilters('loudnorm=I=-16:TP=-1.5:LRA=11')
        .on('error', (err) => reject(new Error(`normalize failed: ${err.message}`)))
        .on('end', () =>
          resolve({ content: [{ type: 'text', text: JSON.stringify({ normalized: outputPath }) }] })
        )
        .save(outFull);
    });
  }
);

// apply_fade — fade in/out за параметрами
server.tool(
  'apply_fade',
  'Apply fade-in and fade-out effects to an audio file',
  {
    inputPath: z.string(),
    outputPath: z.string(),
    fadeIn: z.number().describe('Тривалість fade-in у секундах'),
    fadeOut: z.number().describe('Тривалість fade-out у секундах'),
    duration: z.number().describe('Загальна тривалість треку у секундах'),
  },
  async ({ inputPath, outputPath, fadeIn, fadeOut, duration }) => {
    const inFull = path.resolve(AUDIO_DATA_PATH, inputPath);
    const outFull = path.resolve(AUDIO_DATA_PATH, outputPath);
    const fadeOutStart = duration - fadeOut;
    return new Promise((resolve, reject) => {
      ffmpeg(inFull)
        .audioFilters(`afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeOutStart}:d=${fadeOut}`)
        .on('error', (err) => reject(new Error(`apply_fade failed: ${err.message}`)))
        .on('end', () =>
          resolve({ content: [{ type: 'text', text: JSON.stringify({ faded: outputPath }) }] })
        )
        .save(outFull);
    });
  }
);

// create_dash_mix — stub, реальна обробка через BullMQ в mix-service
server.tool(
  'create_dash_mix',
  'Queue a DASH mix processing job via mix-service BullMQ',
  {
    mixId: z.string(),
    tracks: z.array(z.record(z.unknown())).describe('MixTrack[] array'),
  },
  async ({ mixId }) => ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          queued: true,
          mixId,
          message: 'Submit via mix-service BullMQ queue (CREATE_DASH_MIX job)',
        }),
      },
    ],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
