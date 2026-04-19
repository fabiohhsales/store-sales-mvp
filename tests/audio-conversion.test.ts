import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'
import { resolve as resolvePath } from 'path'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  access: vi.fn(),
  chmod: vi.fn(),
  stat: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('ffmpeg-static', () => ({
  default: '/opt/ffmpeg-static/ffmpeg',
}))

vi.mock('fs', () => ({
  constants: {
    F_OK: 0,
    X_OK: 1,
  },
  promises: {
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    unlink: mocks.unlink,
    access: mocks.access,
    chmod: mocks.chmod,
    stat: mocks.stat,
  },
}))

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}))

import { convertAudioForTranscription } from '@/lib/media/audio-conversion'

const STATIC_BINARY_PATH = resolvePath('/opt/ffmpeg-static/ffmpeg')

type FakeProc = EventEmitter & {
  kill: ReturnType<typeof vi.fn>
  stderr: EventEmitter
}

function makeFakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc
  proc.kill = vi.fn(() => {
    setImmediate(() => proc.emit('close', null, 'SIGKILL'))
  })
  proc.stderr = new EventEmitter()
  return proc
}

function emitClose(proc: FakeProc, code: number | null, signal: NodeJS.Signals | null = null): void {
  setImmediate(() => proc.emit('close', code, signal))
}

function emitError(proc: FakeProc, code: string, message = 'spawn error', errno?: number): void {
  const error = Object.assign(new Error(message), {
    code,
    errno: errno ?? null,
  })
  setImmediate(() => proc.emit('error', error))
}

function emitStderr(proc: FakeProc, message: string): void {
  setImmediate(() => proc.stderr.emit('data', Buffer.from(message)))
}

function mockBinaryAvailable(pathname = STATIC_BINARY_PATH): void {
  mocks.access.mockImplementation(async (target: string) => {
    if (target === pathname) return
    return
  })
}

function mockOutputFile(size: number): void {
  mocks.stat.mockResolvedValue({
    isFile: () => true,
    size,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.stubEnv('PATH', '')
  delete process.env.FFMPEG_PATH
  mocks.writeFile.mockResolvedValue(undefined)
  mocks.readFile.mockResolvedValue(Buffer.from('fake-wav-bytes'))
  mocks.unlink.mockResolvedValue(undefined)
  mocks.chmod.mockResolvedValue(undefined)
  mocks.stat.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
  mockBinaryAvailable()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('convertAudioForTranscription', () => {
  it('returns a structured success result with the resolved binary path', async () => {
    const proc = makeFakeProc()
    mocks.spawn.mockReturnValue(proc)
    mockOutputFile(14)
    emitClose(proc, 0)

    const input = Buffer.from('ogg-audio')
    const result = await convertAudioForTranscription(input, 'audio/ogg; codecs=opus')

    expect(result).toMatchObject({
      ok: true,
      failureReason: null,
      binaryPath: STATIC_BINARY_PATH,
      binarySource: 'ffmpeg-static',
      inputBytes: input.length,
      outputBytes: 14,
    })
    expect(result.ok && result.buffer.toString()).toBe('fake-wav-bytes')
    expect(mocks.spawn).toHaveBeenCalledWith(
      STATIC_BINARY_PATH,
      expect.arrayContaining([
        '-err_detect',
        'ignore_err',
        '-fflags',
        '+genpts+igndts',
        '-f',
        'ogg',
        '-i',
        expect.stringContaining('.ogg'),
        expect.stringContaining('.wav'),
      ]),
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'pipe'] })
    )
    expect(console.log).toHaveBeenCalledWith(
      '[audio-conversion] input_head_bytes',
      expect.objectContaining({
        hex: input.subarray(0, 8).toString('hex'),
        inputBytes: input.length,
        inputMime: 'audio/ogg',
      })
    )
    expect(console.log).toHaveBeenCalledWith(
      '[audio-conversion] ffmpeg_spawn_start',
      expect.objectContaining({
        binaryPath: STATIC_BINARY_PATH,
        command: expect.stringContaining('<input>'),
      })
    )
  })

  it('classifies a missing binary before spawn', async () => {
    mocks.access.mockRejectedValue(Object.assign(new Error('not found'), { code: 'ENOENT' }))

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')

    expect(result).toMatchObject({
      ok: false,
      failureReason: 'audio_conversion_binary_unavailable',
      binarySource: 'ffmpeg-static',
    })
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith(
      '[audio-conversion] ffmpeg_binary_unavailable',
      expect.objectContaining({
        failureReason: 'audio_conversion_binary_unavailable',
      })
    )
  })

  it('classifies permission denied when the binary exists but is not executable', async () => {
    if (process.platform === 'win32') {
      mocks.access.mockImplementation(async (target: string) => {
        if (target === STATIC_BINARY_PATH) {
          throw Object.assign(new Error('access denied'), { code: 'EACCES' })
        }
      })
    } else {
      let accessCalls = 0
      mocks.access.mockImplementation(async (target: string, mode?: number) => {
        if (target !== STATIC_BINARY_PATH) return
        accessCalls += 1
        if (mode === 0) return
        if (accessCalls <= 2) {
          throw Object.assign(new Error('access denied'), { code: 'EACCES' })
        }
      })
      mocks.chmod.mockRejectedValue(Object.assign(new Error('chmod denied'), { code: 'EACCES' }))
    }

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')

    expect(result).toMatchObject({
      ok: false,
      failureReason: 'audio_conversion_permission_denied',
      binaryPath: STATIC_BINARY_PATH,
    })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('classifies spawn errors separately from preflight checks', async () => {
    const proc = makeFakeProc()
    mocks.spawn.mockReturnValue(proc)
    emitError(proc, 'EINVAL', 'bad spawn')

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')

    expect(result).toMatchObject({
      ok: false,
      failureReason: 'audio_conversion_spawn_failed',
      binaryPath: STATIC_BINARY_PATH,
    })
    expect(console.warn).toHaveBeenCalledWith(
      '[audio-conversion] ffmpeg_spawn_error',
      expect.objectContaining({
        code: 'EINVAL',
      })
    )
  })

  it('classifies timeout and cleans up temp files', async () => {
    vi.useFakeTimers()
    const proc = makeFakeProc()
    proc.kill = vi.fn(() => {})
    mocks.spawn.mockReturnValue(proc)

    const promise = convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')
    await vi.advanceTimersByTimeAsync(15_000)
    emitClose(proc, null, 'SIGKILL')
    await vi.advanceTimersByTimeAsync(300)
    const result = await promise

    expect(result).toMatchObject({
      ok: false,
      failureReason: 'audio_conversion_timeout',
      signal: 'SIGKILL',
    })
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL')
    expect(mocks.unlink).toHaveBeenCalledTimes(2)
  })

  it('classifies non-zero exits and captures stderr preview', async () => {
    const proc = makeFakeProc()
    mocks.spawn.mockReturnValue(proc)
    emitStderr(proc, 'Unknown input format')
    emitClose(proc, 1)

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')

    expect(result).toMatchObject({
      ok: false,
      failureReason: 'audio_conversion_nonzero_exit',
      exitCode: 1,
    })
    expect(result.stderrPreview).toContain('Unknown input format')
    expect(console.warn).toHaveBeenCalledWith(
      '[audio-conversion] ffmpeg_nonzero_exit',
      expect.objectContaining({
        code: 1,
        stderrPreview: expect.stringContaining('Unknown input format'),
      })
    )
  })

  it('classifies missing output even when ffmpeg exits with code 0', async () => {
    const proc = makeFakeProc()
    mocks.spawn.mockReturnValue(proc)
    emitClose(proc, 0)

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/mpeg')

    expect(result).toMatchObject({
      ok: false,
      failureReason: 'audio_conversion_output_missing',
    })
  })

  it('classifies empty output files separately', async () => {
    const proc = makeFakeProc()
    mocks.spawn.mockReturnValue(proc)
    mockOutputFile(0)
    emitClose(proc, 0)

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/webm')

    expect(result).toMatchObject({
      ok: false,
      failureReason: 'audio_conversion_output_empty',
      outputBytes: 0,
    })
  })
})
