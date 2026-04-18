import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const FFMPEG_TIMEOUT_MS = 15_000

function mimeToExtension(mime: string): string {
  const base = mime.split(';')[0].trim().toLowerCase()
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'mp4',
    'audio/aac': 'aac',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac',
    'audio/x-m4a': 'm4a',
  }
  return map[base] ?? base.split('/')[1] ?? 'bin'
}

export async function convertAudioForTranscription(
  buffer: Buffer,
  inputMime: string
): Promise<Buffer | null> {
  const id = randomUUID()
  const ext = mimeToExtension(inputMime)
  const inputFile = join(tmpdir(), `audio-in-${id}.${ext}`)
  const outputFile = join(tmpdir(), `audio-out-${id}.wav`)

  try {
    await fs.writeFile(inputFile, buffer)

    const converted = await runFfmpeg(inputFile, outputFile)
    if (!converted) return null

    return await fs.readFile(outputFile)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[audio-conversion] conversion_error', { mime: inputMime, error: msg })
    return null
  } finally {
    await Promise.all([
      fs.unlink(inputFile).catch(() => undefined),
      fs.unlink(outputFile).catch(() => undefined),
    ])
  }
}

function runFfmpeg(inputFile: string, outputFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    let proc: ReturnType<typeof spawn>

    try {
      proc = spawn('ffmpeg', [
        '-y',
        '-i', inputFile,
        '-ar', '16000',
        '-ac', '1',
        '-f', 'wav',
        outputFile,
      ], { stdio: 'pipe' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[audio-conversion] ffmpeg_spawn_failed', { error: msg })
      return resolve(false)
    }

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      console.warn('[audio-conversion] ffmpeg_timeout', { timeoutMs: FFMPEG_TIMEOUT_MS })
      resolve(false)
    }, FFMPEG_TIMEOUT_MS)

    proc.on('error', (err) => {
      clearTimeout(timer)
      // ENOENT means ffmpeg binary not found — expected in environments without ffmpeg
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[audio-conversion] ffmpeg_error', { error: err.message })
      }
      resolve(false)
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        console.warn('[audio-conversion] ffmpeg_nonzero_exit', { code })
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}
