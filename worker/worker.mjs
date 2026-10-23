// Eko Taxi — lokalny worker czatbota.
// Uruchomienie: `npm run worker` (wymaga worker/.env, patrz worker/.env.example).
// Słucha nowych wierszy chat_messages (Supabase Realtime), odpowiada przez `claude -p`
// i co 10 s zapisuje heartbeat, po którym panel czatu pokazuje „Asystent online”.
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { buildPrompt, MAX_RIDES } from './prompt.mjs'
import { runClaude } from './claude.mjs'

const ERROR_ANSWER = 'Nie udało się odpowiedzieć — spróbuj ponownie.'
const MAX_ANSWER_CHARS = 2000
const HEARTBEAT_MS = 10_000

try {
  process.loadEnvFile(fileURLToPath(new URL('.env', import.meta.url)))
} catch {
  console.error('Brak pliku worker/.env — skopiuj worker/.env.example i uzupełnij wartości.')
  process.exit(1)
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('worker/.env: wymagane SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const log = (/** @type {string} */ msg) => console.log(`[${new Date().toISOString()}] ${msg}`)

// ── Sekwencyjna kolejka z deduplikacją ──────────────────────────────────────
/** @type {string[]} */
const queue = []
/** @type {Set<string>} */
const queued = new Set()
let running = false
let stopping = false
/** @type {Promise<void> | null} */
let current = null

function enqueue(/** @type {string} */ id) {
  if (stopping || !id || queued.has(id)) return
  queued.add(id)
  queue.push(id)
  void drain()
}

async function drain() {
  if (running) return
  running = true
  while (queue.length && !stopping) {
    const id = /** @type {string} */ (queue.shift())
    current = handle(id)
    await current
    current = null
    queued.delete(id)
  }
  running = false
}

async function handle(/** @type {string} */ id) {
  const started = Date.now()
  const short = id.slice(0, 8)
  try {
    const { data: msg, error } = await supabase
      .from('chat_messages')
      .select('id, user_id, question, status')
      .eq('id', id)
      .maybeSingle()
    if (error) throw new Error(`odczyt wiadomości: ${error.message}`)
    if (!msg || msg.status !== 'pending') return // już obsłużona (np. przez inny worker)

    const [{ data: profile }, { data: rides }] = await Promise.all([
      supabase.from('profiles').select('display_name').eq('id', msg.user_id).maybeSingle(),
      supabase
        .from('rides')
        .select('pickup_address, dropoff_address, class, distance_km, price_pln, status, created_at')
        .eq('user_id', msg.user_id)
        .order('created_at', { ascending: false })
        .limit(MAX_RIDES),
    ])

    const prompt = buildPrompt({
      question: msg.question,
      rides: rides ?? [],
      displayName: profile?.display_name ?? null,
    })

    let answer
    let status = 'done'
    try {
      answer = (await runClaude(prompt)).trim().slice(0, MAX_ANSWER_CHARS)
      if (!answer) throw new Error('pusta odpowiedź')
    } catch (e) {
      status = 'error'
      answer = ERROR_ANSWER
      log(`${short} claude: ${e instanceof Error ? e.message : String(e)}`)
    }

    // Warunek status='pending' = „zajęcie” wiersza: drugi worker nie nadpisze odpowiedzi.
    const { error: upErr } = await supabase
      .from('chat_messages')
      .update({ answer, status, answered_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
    if (upErr) throw new Error(`zapis odpowiedzi: ${upErr.message}`)
    log(`${short} ${status} (${((Date.now() - started) / 1000).toFixed(1)} s, ${answer.length} zn.)`)
  } catch (e) {
    log(`${short} błąd: ${e instanceof Error ? e.message : String(e)}`)
  }
}

async function processBacklog() {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) {
    log(`zaległe pytania: ${error.message}`)
    return
  }
  if (data.length) log(`zaległe pytania: ${data.length}`)
  for (const row of data) enqueue(row.id)
}

// ── Heartbeat ───────────────────────────────────────────────────────────────
async function heartbeat() {
  const { error } = await supabase
    .from('worker_heartbeat')
    .update({ last_seen: new Date().toISOString() })
    .eq('id', 1)
  if (error) log(`heartbeat: ${error.message}`)
}

// ── Start ───────────────────────────────────────────────────────────────────
await heartbeat()
const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS)

await processBacklog()

const channel = supabase
  .channel('ekotaxi-chat-worker')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
    const row = /** @type {{ id?: string, status?: string }} */ (payload.new)
    if (row?.id && row.status === 'pending') enqueue(row.id)
  })
  .subscribe((status, err) => {
    if (status === 'SUBSCRIBED') {
      log('Realtime: nasłuch chat_messages aktywny')
      // Po (ponownym) połączeniu dobieramy pytania, które mogły przyjść w przerwie.
      void processBacklog()
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      log(`Realtime: ${status}${err ? ` (${err.message})` : ''}`)
    }
  })

log('Worker Eko Taxi uruchomiony (Ctrl+C kończy).')

async function shutdown() {
  if (stopping) process.exit(1) // drugie Ctrl+C — wyjście natychmiast
  stopping = true
  log('Zatrzymywanie…')
  clearInterval(heartbeatTimer)
  await supabase.removeChannel(channel).catch(() => {})
  if (current) await current
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
