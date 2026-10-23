// Uruchamianie Claude Code w trybie headless (`claude -p`) dla jednego pytania.
// Bezpieczeństwo: pytania pochodzą od dowolnych użytkowników aplikacji, a proces działa
// na komputerze właściciela — więc: bez shella, bez narzędzi, bez MCP, prompt tylko przez
// stdin, pusty katalog tymczasowy jako cwd, bez sekretów Supabase w środowisku procesu.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const DISALLOWED_TOOLS = 'Bash Edit Write Read Glob Grep WebFetch WebSearch NotebookEdit Task'

export const CLAUDE_ARGS = [
  '-p',
  '--output-format', 'json',
  '--tools', '', // wyłącza WSZYSTKIE wbudowane narzędzia
  '--disallowedTools', DISALLOWED_TOOLS, // druga warstwa, gdyby --tools przestało działać
  '--strict-mcp-config', // ignoruje serwery MCP skonfigurowane u użytkownika
  '--no-session-persistence', // sesje czatu nie trafiają do historii Claude Code
  // Bez '--bare': w tym trybie CLI nie używa logowania OAuth (tylko ANTHROPIC_API_KEY)
  // i zwraca „Not logged in”.
]

const MAX_STDOUT_BYTES = 1024 * 1024

/** Środowisko procesu bez sekretów workera. */
function childEnv() {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (/^SUPABASE_|^NEXT_PUBLIC_SUPABASE_/i.test(key)) delete env[key]
  }
  return env
}

/**
 * @param {string} prompt
 * @param {{ timeoutMs?: number, spawnFn?: typeof spawn, bin?: string }} [options]
 * @returns {Promise<string>}
 */
export function runClaude(prompt, { timeoutMs = 60000, spawnFn = spawn, bin } = {}) {
  const exe = bin || process.env.CLAUDE_BIN || 'claude'
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'ekotaxi-'))

  return new Promise((resolve, reject) => {
    let settled = false
    /** @type {Buffer[]} */
    const chunks = []
    let size = 0
    let timer

    const finish = (/** @type {Error | null} */ err, /** @type {string} */ value = '') => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        rmSync(cwd, { recursive: true, force: true })
      } catch {
        // katalog tymczasowy — brak usunięcia nie jest krytyczny
      }
      if (err) reject(err)
      else resolve(value)
    }

    let child
    try {
      child = spawnFn(exe, CLAUDE_ARGS, {
        cwd,
        shell: false,
        windowsHide: true,
        env: childEnv(),
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      finish(e instanceof Error ? e : new Error(String(e)))
      return
    }

    timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // proces mógł już się zakończyć
      }
      finish(new Error(`claude: timeout po ${timeoutMs} ms`))
    }, timeoutMs)

    child.on('error', (/** @type {Error} */ e) => finish(new Error(`claude: nie udało się uruchomić (${e.message})`)))

    child.stdout.on('data', (/** @type {Buffer} */ d) => {
      size += d.length
      if (size > MAX_STDOUT_BYTES) {
        try {
          child.kill()
        } catch {}
        finish(new Error('claude: za duża odpowiedź'))
        return
      }
      chunks.push(Buffer.from(d))
    })
    child.stderr?.on('data', () => {}) // stderr ignorujemy (nie logujemy treści)

    child.on('close', (/** @type {number | null} */ code) => {
      if (code !== 0) {
        finish(new Error(`claude: kod wyjścia ${code}`))
        return
      }
      let parsed
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        finish(new Error('claude: nieprawidłowy JSON na wyjściu'))
        return
      }
      if (!parsed || parsed.is_error === true || typeof parsed.result !== 'string') {
        finish(new Error('claude: odpowiedź z błędem'))
        return
      }
      finish(null, parsed.result)
    })

    child.stdin.on?.('error', () => {}) // EPIPE, gdy proces padnie przed odczytem
    child.stdin.end(prompt)
  })
}
