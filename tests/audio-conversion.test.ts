import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'events'

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  unlink: vi.fn(),
  spawn: vi.fn(),
}))

vi.mock('fs', () => ({
  promises: {
    writeFile: mocks.writeFile,
    readFile: mocks.readFile,
    unlink: mocks.unlink,
  },
}))

vi.mock('child_process', () => ({
  spawn: mocks.spawn,
}))

import { convertAudioForTranscription } from '@/lib/media/audio-conversion'

function makeFakeProc(opts: { exitCode?: number; errorCode?: string | null } = {}) {
  const proc = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>
    stdin: null
    stdout: null
    stderr: null
  }
  proc.kill = vi.fn()
  proc.stdin = null
  proc.stdout = null
  proc.stderr = null

  setImmediate(() => {
    if (opts.errorCode) {
      const err = Object.assign(new Error('spawn error'), { code: opts.errorCode })
      proc.emit('error', err)
    } else {
      proc.emit('close', opts.exitCode ?? 0)
    }
  })

  return proc
}

beforeEach(() => {
  mocks.writeFile.mockResolvedValue(undefined)
  mocks.readFile.mockResolvedValue(Buffer.from('fake-wav-bytes'))
  mocks.unlink.mockResolvedValue(undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('convertAudioForTranscription', () => {
  it('returns WAV buffer when ffmpeg exits with code 0', async () => {
    mocks.spawn.mockReturnValue(makeFakeProc({ exitCode: 0 }))

    const input = Buffer.from('ogg-audio')
    const result = await convertAudioForTranscription(input, 'audio/ogg')

    expect(result).toBeInstanceOf(Buffer)
    expect(result?.toString()).toBe('fake-wav-bytes')
    expect(mocks.spawn).toHaveBeenCalledWith(
      'ffmpeg',
      expect.arrayContaining(['-i', expect.stringContaining('.ogg'), expect.stringContaining('.wav')]),
      expect.any(Object)
    )
  })

  it('returns null when ffmpeg exits with non-zero code', async () => {
    mocks.spawn.mockReturnValue(makeFakeProc({ exitCode: 1 }))

    const result = await convertAudioForTranscription(Buffer.from('bad-audio'), 'audio/ogg')

    expect(result).toBeNull()
  })

  it('returns null when ffmpeg binary is not found (ENOENT)', async () => {
    mocks.spawn.mockReturnValue(makeFakeProc({ errorCode: 'ENOENT' }))

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')

    expect(result).toBeNull()
    // ENOENT should not produce a console.warn (expected in environments without ffmpeg)
    expect(console.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('[audio-conversion] ffmpeg_error'),
      expect.anything()
    )
  })

  it('returns null and warns on non-ENOENT spawn error', async () => {
    mocks.spawn.mockReturnValue(makeFakeProc({ errorCode: 'EACCES' }))

    const result = await convertAudioForTranscription(Buffer.from('audio'), 'audio/mpeg')

    expect(result).toBeNull()
    expect(console.warn).toHaveBeenCalledWith(
      '[audio-conversion] ffmpeg_error',
      expect.objectContaining({ error: expect.any(String) })
    )
  })

  it('always cleans up temp files even when ffmpeg fails', async () => {
    mocks.spawn.mockReturnValue(makeFakeProc({ exitCode: 1 }))

    await convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')

    expect(mocks.unlink).toHaveBeenCalledTimes(2)
  })

  it('always cleans up temp files on successful conversion', async () => {
    mocks.spawn.mockReturnValue(makeFakeProc({ exitCode: 0 }))

    await convertAudioForTranscription(Buffer.from('audio'), 'audio/ogg')

    expect(mocks.unlink).toHaveBeenCalledTimes(2)
  })

  it('uses correct file extension for known MIME types', async () => {
    mocks.spawn.mockReturnValue(makeFakeProc({ exitCode: 0 }))

    await convertAudioForTranscription(Buffer.from('audio'), 'audio/mpeg')

    const spawnArgs = mocks.spawn.mock.calls[0][1] as string[]
    const inputArg = spawnArgs[spawnArgs.indexOf('-i') + 1]
    expect(inputArg).toMatch(/\.mp3$/)
  })
})
