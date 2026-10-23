import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runClaude, CLAUDE_ARGS } from '../worker/claude.mjs'

type Call = { bin: string; args: string[]; opts: Record<string, unknown> }

class FakeChild extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  stdinData = ''
  stdinEnded = false
  killed = false
  cwdExistedAtSpawn: boolean
  stdin = {
    write: (d: string) => {
      this.stdinData += d
      return true
    },
    end: (d?: string) => {
      if (d) this.stdinData += d
      this.stdinEnded = true
    },
    on: () => {},
  }
  constructor(public cwd: string) {
    super()
    this.cwdExistedAtSpawn = existsSync(cwd)
  }
  kill() {
    this.killed = true
    setTimeout(() => this.emit('close', null, 'SIGTERM'), 0)
    return true
  }
  succeed(out: string) {
    this.stdout.emit('data', Buffer.from(out))
    this.emit('close', 0, null)
  }
}

function fakeSpawn(behave: (child: FakeChild) => void) {
  const calls: Call[] = []
  const children: FakeChild[] = []
  const spawnFn = (bin: string, args: string[], opts: Record<string, unknown>) => {
    calls.push({ bin, args, opts })
    const child = new FakeChild(opts.cwd as string)
    children.push(child)
    setTimeout(() => behave(child), 0)
    return child
  }
  return { spawnFn: spawnFn as never, calls, children }
}

const PROMPT = 'TAJNY PROMPT <pytanie>x</pytanie>'

describe('runClaude', () => {
  it('spawns without a shell, with safe flags, prompt only on stdin', async () => {
    const f = fakeSpawn((c) => c.succeed('{"result":"ok"}'))
    await runClaude(PROMPT, { spawnFn: f.spawnFn })
    const { args, opts } = f.calls[0]
    expect(opts.shell).toBe(false)
    expect(args).toContain('-p')
    expect(args).toContain('--output-format')
    expect(args).toContain('json')
    expect(args).toContain('--disallowedTools')
    expect(args).toContain('--strict-mcp-config')
    expect(args).toContain('--no-session-persistence')
    const t = args.indexOf('--tools')
    expect(t).toBeGreaterThanOrEqual(0)
    expect(args[t + 1]).toBe('')
    expect(args.join(' ')).not.toContain('TAJNY')
    expect(args).toEqual(CLAUDE_ARGS)
    expect(f.children[0].stdinData).toBe(PROMPT)
    expect(f.children[0].stdinEnded).toBe(true)
  })

  it('runs in a fresh temp dir (not the repo) and removes it afterwards', async () => {
    const f = fakeSpawn((c) => c.succeed('{"result":"ok"}'))
    await runClaude(PROMPT, { spawnFn: f.spawnFn })
    const cwd = path.resolve(f.calls[0].opts.cwd as string)
    expect(cwd.startsWith(path.resolve(os.tmpdir()))).toBe(true)
    expect(cwd).not.toBe(path.resolve(process.cwd()))
    expect(f.children[0].cwdExistedAtSpawn).toBe(true)
    expect(existsSync(cwd)).toBe(false)
  })

  it('stdout {"result":"Cześć!"} -> "Cześć!"', async () => {
    const f = fakeSpawn((c) => c.succeed('{"result":"Cześć!"}'))
    await expect(runClaude(PROMPT, { spawnFn: f.spawnFn })).resolves.toBe('Cześć!')
  })

  it('handles stdout split across chunks (multi-byte char boundary)', async () => {
    const buf = Buffer.from('{"result":"Cześć!"}')
    const f = fakeSpawn((c) => {
      c.stdout.emit('data', buf.subarray(0, 15))
      c.stdout.emit('data', buf.subarray(15))
      c.emit('close', 0, null)
    })
    await expect(runClaude(PROMPT, { spawnFn: f.spawnFn })).resolves.toBe('Cześć!')
  })

  it('rejects on non-zero exit code', async () => {
    const f = fakeSpawn((c) => c.emit('close', 1, null))
    await expect(runClaude(PROMPT, { spawnFn: f.spawnFn })).rejects.toThrow()
  })

  it('rejects when is_error is true or the output is not JSON', async () => {
    const a = fakeSpawn((c) => c.succeed('{"result":"x","is_error":true}'))
    await expect(runClaude(PROMPT, { spawnFn: a.spawnFn })).rejects.toThrow()
    const b = fakeSpawn((c) => c.succeed('not json'))
    await expect(runClaude(PROMPT, { spawnFn: b.spawnFn })).rejects.toThrow()
  })

  it('rejects on spawn error', async () => {
    const f = fakeSpawn((c) => c.emit('error', new Error('ENOENT')))
    await expect(runClaude(PROMPT, { spawnFn: f.spawnFn })).rejects.toThrow()
  })

  it('kills the process and rejects after timeoutMs', async () => {
    vi.useFakeTimers()
    try {
      const f = fakeSpawn(() => {})
      const p = runClaude(PROMPT, { timeoutMs: 1000, spawnFn: f.spawnFn })
      const assertion = expect(p).rejects.toThrow(/timeout/i)
      await vi.advanceTimersByTimeAsync(1001)
      await assertion
      expect(f.children[0].killed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
