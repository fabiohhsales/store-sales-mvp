import ffmpegStatic from 'ffmpeg-static'
import { spawn } from 'child_process'
import { randomUUID } from 'crypto'
import { constants, promises as fs } from 'fs'
import { tmpdir } from 'os'
import { basename, delimiter, isAbsolute, join, resolve as resolvePath } from 'path'

const FFMPEG_TIMEOUT_MS = 15_000
const STDERR_PREVIEW_LIMIT = 500

export type AudioConversionFailureReason =
  | 'audio_conversion_binary_unavailable'
  | 'audio_conversion_permission_denied'
  | 'audio_conversion_spawn_failed'
  | 'audio_conversion_timeout'
  | 'audio_conversion_nonzero_exit'
  | 'audio_conversion_output_missing'
  | 'audio_conversion_output_empty'

export type AudioConversionBinarySource = 'env' | 'ffmpeg-static' | 'path'

export type AudioConversionResult =
  | {
      ok: true
      buffer: Buffer
      failureReason: null
      binaryPath: string
      binarySource: AudioConversionBinarySource
      platform: NodeJS.Platform
      arch: string
      exitCode: number | null
      signal: NodeJS.Signals | null
      stderrFull: string
      stderrPreview: string | null
      inputBytes: number
      outputBytes: number
    }
  | {
      ok: false
      buffer: null
      failureReason: AudioConversionFailureReason
      binaryPath: string | null
      binarySource: AudioConversionBinarySource | null
      platform: NodeJS.Platform
      arch: string
      exitCode: number | null
      signal: NodeJS.Signals | null
      stderrFull: string
      stderrPreview: string | null
      inputBytes: number
      outputBytes: number | null
    }

interface ResolvedBinary {
  path: string
  source: AudioConversionBinarySource
}

interface BinaryResolutionFailure {
  failureReason: 'audio_conversion_binary_unavailable' | 'audio_conversion_permission_denied'
  binaryPath: string | null
  binarySource: AudioConversionBinarySource | null
}

interface OutputInspection {
  exists: boolean
  size: number | null
}

export function normalizeAudioMime(mime: string): string {
  return mime.split(';')[0].trim().toLowerCase()
}

export function audioMimeToExtension(mime: string): string {
  const base = normalizeAudioMime(mime)
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/oga': 'oga',
    'application/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'mp4',
    'audio/aac': 'aac',
    'audio/webm': 'webm',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/flac': 'flac',
    'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a',
  }
  return map[base] ?? base.split('/')[1] ?? 'bin'
}

function trimText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function buildStderrPreview(stderr: string): string | null {
  const normalized = trimText(stderr?.replace(/\s+/g, ' '))
  if (!normalized) return null
  return normalized.slice(0, STDERR_PREVIEW_LIMIT)
}

function sanitizeCommand(args: string[], inputFile: string, outputFile: string): string {
  return args
    .map((arg) => {
      if (arg === inputFile) return '<input>'
      if (arg === outputFile) return '<output>'
      return arg
    })
    .join(' ')
}

function buildFailure(args: {
  failureReason: AudioConversionFailureReason
  binaryPath?: string | null
  binarySource?: AudioConversionBinarySource | null
  exitCode?: number | null
  signal?: NodeJS.Signals | null
  stderrFull?: string
  inputBytes: number
  outputBytes?: number | null
}): AudioConversionResult {
  const stderrFull = args.stderrFull ?? ''
  return {
    ok: false,
    buffer: null,
    failureReason: args.failureReason,
    binaryPath: args.binaryPath ?? null,
    binarySource: args.binarySource ?? null,
    platform: process.platform,
    arch: process.arch,
    exitCode: args.exitCode ?? null,
    signal: args.signal ?? null,
    stderrFull,
    stderrPreview: buildStderrPreview(stderrFull),
    inputBytes: args.inputBytes,
    outputBytes: args.outputBytes ?? null,
  }
}

function buildSuccess(args: {
  buffer: Buffer
  binaryPath: string
  binarySource: AudioConversionBinarySource
  exitCode: number | null
  signal: NodeJS.Signals | null
  stderrFull: string
  inputBytes: number
  outputBytes: number
}): AudioConversionResult {
  return {
    ok: true,
    buffer: args.buffer,
    failureReason: null,
    binaryPath: args.binaryPath,
    binarySource: args.binarySource,
    platform: process.platform,
    arch: process.arch,
    exitCode: args.exitCode,
    signal: args.signal,
    stderrFull: args.stderrFull,
    stderrPreview: buildStderrPreview(args.stderrFull),
    inputBytes: args.inputBytes,
    outputBytes: args.outputBytes,
  }
}

async function fileExists(pathname: string): Promise<boolean> {
  try {
    await fs.access(pathname, constants.F_OK)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      return true
    }
    return false
  }
}

async function inspectOutput(pathname: string): Promise<OutputInspection> {
  try {
    const stat = await fs.stat(pathname)
    return {
      exists: stat.isFile(),
      size: stat.isFile() ? stat.size : null,
    }
  } catch {
    return {
      exists: false,
      size: null,
    }
  }
}

async function ensureExecutable(pathname: string): Promise<boolean> {
  if (process.platform === 'win32') {
    await fs.access(pathname, constants.F_OK)
    return true
  }

  try {
    await fs.access(pathname, constants.X_OK)
    return true
  } catch {
    await fs.chmod(pathname, 0o755)
    await fs.access(pathname, constants.X_OK)
    return true
  }
}

async function resolveBinaryFromPath(command: string): Promise<string | null> {
  const trimmed = trimText(command)
  if (!trimmed) return null

  if (isAbsolute(trimmed) || trimmed.includes('/') || trimmed.includes('\\')) {
    const absolute = resolvePath(trimmed)
    return (await fileExists(absolute)) ? absolute : null
  }

  const pathEntries = (process.env.PATH ?? '')
    .split(delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)

  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM')
          .split(';')
          .map((entry) => entry.trim())
          .filter(Boolean)
      : ['']

  const candidates =
    process.platform === 'win32' && /\.[^\\/.]+$/.test(trimmed)
      ? ['']
      : extensions

  for (const dir of pathEntries) {
    for (const ext of candidates) {
      const candidate = join(dir, `${trimmed}${ext}`)
      if (await fileExists(candidate)) {
        return candidate
      }
    }
  }

  return null
}

async function resolveFfmpegBinary(): Promise<ResolvedBinary | BinaryResolutionFailure> {
  const requestedEnvPath = trimText(process.env.FFMPEG_PATH)
  const candidates: Array<{ source: AudioConversionBinarySource; command: string | null }> = [
    { source: 'env', command: requestedEnvPath },
    { source: 'ffmpeg-static', command: trimText(ffmpegStatic ?? null) },
    { source: 'path', command: 'ffmpeg' },
  ]

  let lastFailure: BinaryResolutionFailure = {
    failureReason: 'audio_conversion_binary_unavailable',
    binaryPath: null,
    binarySource: null,
  }

  for (const candidate of candidates) {
    if (!candidate.command) continue

    const resolvedPath = await resolveBinaryFromPath(candidate.command)
    console.log('[audio-conversion] ffmpeg_binary_candidate', {
      requested: candidate.command,
      resolvedPath,
      binarySource: candidate.source,
      platform: process.platform,
      arch: process.arch,
      binaryName: resolvedPath ? basename(resolvedPath) : candidate.command,
    })

    if (!resolvedPath) {
      if (candidate.source !== 'path' || !lastFailure.binarySource) {
        lastFailure = {
          failureReason: 'audio_conversion_binary_unavailable',
          binaryPath: null,
          binarySource: candidate.source,
        }
      }
      continue
    }

    try {
      await ensureExecutable(resolvedPath)
      return { path: resolvedPath, source: candidate.source }
    } catch (error) {
      const errno = error as NodeJS.ErrnoException
      const failureReason =
        errno.code === 'EACCES'
          ? 'audio_conversion_permission_denied'
          : 'audio_conversion_binary_unavailable'
      console.warn('[audio-conversion] ffmpeg_binary_not_ready', {
        binaryPath: resolvedPath,
        binarySource: candidate.source,
        failureReason,
        error: errno.message,
        code: errno.code ?? null,
        platform: process.platform,
        arch: process.arch,
      })
      if (candidate.source !== 'path' || !lastFailure.binarySource) {
        lastFailure = {
          failureReason,
          binaryPath: resolvedPath,
          binarySource: candidate.source,
        }
      }
    }
  }

  return lastFailure
}

async function runFfmpeg(args: {
  inputFile: string
  outputFile: string
  inputMime: string
  inputBytes: number
}): Promise<AudioConversionResult> {
  const { inputFile, outputFile, inputMime, inputBytes } = args
  const binary = await resolveFfmpegBinary()

  if (!('path' in binary)) {
    console.warn('[audio-conversion] ffmpeg_binary_unavailable', {
      binaryPath: binary.binaryPath,
      binarySource: binary.binarySource,
      failureReason: binary.failureReason,
      inputMime,
      inputBytes,
      platform: process.platform,
      arch: process.arch,
    })
    return buildFailure({
      failureReason: binary.failureReason,
      binaryPath: binary.binaryPath,
      binarySource: binary.binarySource,
      inputBytes,
    })
  }

  const commandArgs = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    inputFile,
    '-vn',
    '-acodec',
    'pcm_s16le',
    '-ar',
    '16000',
    '-ac',
    '1',
    '-f',
    'wav',
    outputFile,
  ]

  console.log('[audio-conversion] ffmpeg_spawn_start', {
    binaryPath: binary.path,
    binarySource: binary.source,
    binaryName: basename(binary.path),
    platform: process.platform,
    arch: process.arch,
    inputMime,
    inputBytes,
    command: sanitizeCommand(commandArgs, inputFile, outputFile),
  })

  return new Promise((resolve) => {
    let settled = false
    let stderr = ''
    let timeoutTriggered = false
    let timeoutFinalize: NodeJS.Timeout | null = null

    const settle = async (result: AudioConversionResult): Promise<void> => {
      if (settled) return
      settled = true
      if (timeoutFinalize) {
        clearTimeout(timeoutFinalize)
      }
      resolve(result)
    }

    let proc: ReturnType<typeof spawn>

    try {
      proc = spawn(binary.path, commandArgs, { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[audio-conversion] ffmpeg_spawn_failed', {
        binaryPath: binary.path,
        binarySource: binary.source,
        inputMime,
        inputBytes,
        platform: process.platform,
        arch: process.arch,
        error: message,
      })
      void settle(
        buildFailure({
          failureReason: 'audio_conversion_spawn_failed',
          binaryPath: binary.path,
          binarySource: binary.source,
          inputBytes,
          stderrFull: message,
        })
      )
      return
    }

    proc.stderr?.on('data', (chunk: Buffer | string) => {
      stderr += chunk.toString()
    })

    const timer = setTimeout(() => {
      timeoutTriggered = true
      console.warn('[audio-conversion] ffmpeg_timeout', {
        binaryPath: binary.path,
        binarySource: binary.source,
        timeoutMs: FFMPEG_TIMEOUT_MS,
        inputMime,
        inputBytes,
        platform: process.platform,
        arch: process.arch,
      })
      proc.kill('SIGKILL')
      timeoutFinalize = setTimeout(() => {
        void settle(
          buildFailure({
            failureReason: 'audio_conversion_timeout',
            binaryPath: binary.path,
            binarySource: binary.source,
            inputBytes,
            stderrFull: stderr,
          })
        )
      }, 250)
    }, FFMPEG_TIMEOUT_MS)

    proc.on('error', (error) => {
      clearTimeout(timer)
      const errno = error as NodeJS.ErrnoException
      const failureReason =
        errno.code === 'ENOENT'
          ? 'audio_conversion_binary_unavailable'
          : errno.code === 'EACCES'
            ? 'audio_conversion_permission_denied'
            : 'audio_conversion_spawn_failed'

      console.warn('[audio-conversion] ffmpeg_spawn_error', {
        binaryPath: binary.path,
        binarySource: binary.source,
        inputMime,
        inputBytes,
        platform: process.platform,
        arch: process.arch,
        code: errno.code ?? null,
        errno: errno.errno ?? null,
        error: errno.message,
      })

      void settle(
        buildFailure({
          failureReason,
          binaryPath: binary.path,
          binarySource: binary.source,
          inputBytes,
          exitCode: typeof errno.errno === 'number' ? errno.errno : null,
          stderrFull: stderr || errno.message,
        })
      )
    })

    proc.on('close', async (code, signal) => {
      clearTimeout(timer)
      const output = await inspectOutput(outputFile)
      const stderrPreview = buildStderrPreview(stderr)

      console.log('[audio-conversion] ffmpeg_close', {
        binaryPath: binary.path,
        binarySource: binary.source,
        code,
        signal,
        inputMime,
        inputBytes,
        outputExists: output.exists,
        outputBytes: output.size,
        stderrPreview,
      })

      if (timeoutTriggered) {
        await settle(
          buildFailure({
            failureReason: 'audio_conversion_timeout',
            binaryPath: binary.path,
            binarySource: binary.source,
            inputBytes,
            exitCode: code,
            signal,
            stderrFull: stderr,
            outputBytes: output.size,
          })
        )
        return
      }

      if (code !== 0) {
        console.warn('[audio-conversion] ffmpeg_nonzero_exit', {
          binaryPath: binary.path,
          binarySource: binary.source,
          code,
          signal,
          inputMime,
          inputBytes,
          outputExists: output.exists,
          outputBytes: output.size,
          stderrPreview,
        })
        await settle(
          buildFailure({
            failureReason: 'audio_conversion_nonzero_exit',
            binaryPath: binary.path,
            binarySource: binary.source,
            inputBytes,
            exitCode: code,
            signal,
            stderrFull: stderr,
            outputBytes: output.size,
          })
        )
        return
      }

      if (!output.exists) {
        console.warn('[audio-conversion] ffmpeg_output_missing', {
          binaryPath: binary.path,
          binarySource: binary.source,
          inputMime,
          inputBytes,
          code,
          signal,
          stderrPreview,
        })
        await settle(
          buildFailure({
            failureReason: 'audio_conversion_output_missing',
            binaryPath: binary.path,
            binarySource: binary.source,
            inputBytes,
            exitCode: code,
            signal,
            stderrFull: stderr,
          })
        )
        return
      }

      if (!output.size) {
        console.warn('[audio-conversion] ffmpeg_output_empty', {
          binaryPath: binary.path,
          binarySource: binary.source,
          inputMime,
          inputBytes,
          code,
          signal,
          stderrPreview,
        })
        await settle(
          buildFailure({
            failureReason: 'audio_conversion_output_empty',
            binaryPath: binary.path,
            binarySource: binary.source,
            inputBytes,
            exitCode: code,
            signal,
            stderrFull: stderr,
            outputBytes: output.size,
          })
        )
        return
      }

      try {
        const buffer = await fs.readFile(outputFile)
        await settle(
          buildSuccess({
            buffer,
            binaryPath: binary.path,
            binarySource: binary.source,
            exitCode: code,
            signal,
            stderrFull: stderr,
            inputBytes,
            outputBytes: buffer.length,
          })
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn('[audio-conversion] ffmpeg_output_missing', {
          binaryPath: binary.path,
          binarySource: binary.source,
          inputMime,
          inputBytes,
          code,
          signal,
          stderrPreview,
          error: message,
        })
        await settle(
          buildFailure({
            failureReason: 'audio_conversion_output_missing',
            binaryPath: binary.path,
            binarySource: binary.source,
            inputBytes,
            exitCode: code,
            signal,
            stderrFull: stderr || message,
            outputBytes: output.size,
          })
        )
      }
    })
  })
}

export async function convertAudioForTranscription(
  buffer: Buffer,
  inputMime: string
): Promise<AudioConversionResult> {
  const id = randomUUID()
  const ext = audioMimeToExtension(inputMime)
  const inputFile = join(tmpdir(), `audio-in-${id}.${ext}`)
  const outputFile = join(tmpdir(), `audio-out-${id}.wav`)

  try {
    await fs.writeFile(inputFile, buffer)
    return await runFfmpeg({
      inputFile,
      outputFile,
      inputMime: normalizeAudioMime(inputMime),
      inputBytes: buffer.length,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('[audio-conversion] conversion_error', {
      mime: normalizeAudioMime(inputMime),
      inputBytes: buffer.length,
      error: message,
      platform: process.platform,
      arch: process.arch,
    })
    return buildFailure({
      failureReason: 'audio_conversion_spawn_failed',
      inputBytes: buffer.length,
      stderrFull: message,
    })
  } finally {
    await Promise.all([
      fs.unlink(inputFile).catch(() => undefined),
      fs.unlink(outputFile).catch(() => undefined),
    ])
  }
}
