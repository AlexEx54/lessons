#!/usr/bin/env node
// Regenerates the Salta Números voice files from assets/games/numbers/levels.mjs.
// Needs edge-tts (pip install edge-tts) and ffmpeg on PATH; EDGE_TTS can point to the edge-tts binary.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { levels, numberWords } from '../assets/games/numbers/levels.mjs';

const voice = 'es-ES-ElviraNeural';
const edgeTts = process.env.EDGE_TTS || 'edge-tts';
const audioDir = fileURLToPath(new URL('../assets/games/numbers/audio/', import.meta.url));
const trimSilence = 'silenceremove=start_periods=1:start_threshold=-50dB';
const values = [...new Set(levels.flatMap(level => level.values))];
const scratch = mkdtempSync(path.join(tmpdir(), 'numbers-audio-'));

try {
  for (const value of values) {
    const raw = path.join(scratch, value + '.mp3');
    execFileSync(edgeTts, ['--voice', voice, '--text', numberWords(value), '--write-media', raw], { stdio: 'ignore' });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw,
      '-af', `${trimSilence},areverse,${trimSilence},areverse`,
      '-ac', '1', '-ar', '22050', '-b:a', '64k', path.join(audioDir, value + '.mp3')]);
    process.stdout.write('.');
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const stale = readdirSync(audioDir).filter(file => !values.includes(Number(path.parse(file).name)));
stale.forEach(file => rmSync(path.join(audioDir, file)));
console.log(`\n${values.length} files written to ${audioDir}, ${stale.length} stale removed.`);
