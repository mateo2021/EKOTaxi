# Eko Taxi — specyfikacja projektu

Data: 2026-10-23
Cel: projekt zaliczeniowy — webowa aplikacja przejazdów wzorowana na Bolt/Uber (własna nazwa i wygląd, bez marek Bolt/Uber).

## 1. Wymagania zaliczeniowe i ich realizacja

| # | Wymaganie | Realizacja w Eko Taxi |
|---|-----------|-----------------------|
| 1 | Logowanie użytkowników | Supabase Auth, e-mail + hasło |
| 2 | Zapisywanie preferencji | Tabela `profiles`: motyw, domyślna klasa, przełączniki powiadomień, webhook Discord |
| 3 | Zapis/odczyt danych z bazy | Kursy (`rides`), kierowcy (`drivers`), promocje (`promos`), czat (`chat_messages`) |
| 4 | Powiadomienia | Webhook Discord — zmiany statusu kursu oraz nowe promocje |
| 5 | Czatbot | Lokalny worker wywołujący Claude Code w trybie headless (`claude -p`) |
| 6 | Widoczność w sieci | Vercel |
| 7 | Repozytorium GitHub | Publiczne repo, README z mapowaniem wymagań |

## 2. Technologie

- Next.js (App Router, TypeScript) — hosting na Vercelu
- Supabase — Postgres, Auth, Realtime, RLS
- Leaflet + OpenStreetMap (mapa), Nominatim (wyszukiwanie adresów) — bez kluczy API
- Discord webhooks — powiadomienia
- Claude Code CLI w trybie headless — czatbot (worker Node.js uruchamiany lokalnie)
- Vitest — testy jednostkowe

## 3. Architektura

```
[Przeglądarka] ──► [Next.js na Vercelu] ──► [Supabase: Postgres + Auth + Realtime]
                          │                           ▲
                          ▼                           │ subskrypcja nowych pytań
                   [Webhook Discord]         [worker.mjs na PC autora] ──► claude -p
```

Vercel nie uruchamia `claude` CLI, dlatego czatbot działa jako lokalny worker komunikujący się z aplikacją wyłącznie przez bazę.

## 4. Model danych

- **profiles** — `id` (= auth user id), `display_name`, `theme` (`light`|`dark`), `default_class` (`economy`|`comfort`|`xl`), `notify_ride_status` (bool), `notify_promos` (bool), `discord_webhook_url` (nullable), `is_admin` (bool, domyślnie false).
- **drivers** — `id`, `name`, `car`, `plate`, `rating`, `class`. Seed ok. 8 fikcyjnych kierowców.
- **rides** — `id`, `user_id`, `pickup_address`, `pickup_lat`, `pickup_lng`, `dropoff_address`, `dropoff_lat`, `dropoff_lng`, `class`, `distance_km`, `price_pln`, `status` (`searching`|`accepted`|`in_progress`|`completed`|`cancelled`), `driver_id` (nullable), `last_notified_status` (nullable), `created_at`.
- **promos** — `id`, `title`, `body`, `created_at`.
- **chat_messages** — `id`, `user_id`, `question`, `answer` (nullable), `status` (`pending`|`done`|`error`), `created_at`, `answered_at`.
- **worker_heartbeat** — jeden wiersz, `last_seen` (timestamp).

**Bezpieczeństwo:** RLS na wszystkich tabelach — użytkownik czyta/zapisuje tylko własne `profiles`, `rides`, `chat_messages`; `drivers`, `promos`, `worker_heartbeat` tylko do odczytu dla zalogowanych; dodawanie `promos` tylko dla `is_admin`. Worker używa klucza service role trzymanego wyłącznie lokalnie (`worker/.env`, w `.gitignore`).

## 5. Ekrany

1. **Logowanie / rejestracja.**
2. **Mapa / zamawianie (ekran główny)** — pełnoekranowa mapa, panel „Skąd / Dokąd” z podpowiedziami Nominatim (alternatywnie kliknięcie na mapie), wybór klasy z ceną, przycisk „Zamów”, linia trasy.
3. **Aktywny kurs** — karta kierowcy, pasek statusu, ikonka auta przesuwana wzdłuż linii trasy proporcjonalnie do upływu czasu.
4. **Historia** — lista przejazdów (trasa, cena, data, status).
5. **Ustawienia** — motyw, domyślna klasa, przełączniki powiadomień, webhook Discord.
6. **Czat z asystentem** — wysuwany panel dostępny globalnie, wskaźnik online/offline.
7. **Promocje** — lista z tabeli `promos`; dla admina formularz dodawania (rozsyła powiadomienie do użytkowników z `notify_promos = true`).

## 6. Logika biznesowa

**Cena:** `distance_km = haversine(pickup, dropoff) × 1.3`; `price = (5 zł + 3 zł × distance_km) × mnożnik_klasy` (economy 1.0, comfort 1.3, xl 1.6), zaokrąglenie do 1 zł, minimum 10 zł.

**Symulacja kursu (bez timerów po stronie serwera):** status wyliczany z czasu od `created_at`:
- 0–5 s → `searching`
- ≥5 s → `accepted` (przypisanie losowego kierowcy pasującej klasy)
- ≥35 s → `in_progress`
- ≥95 s → `completed`

Klient odpytuje `GET /api/rides/[id]` co 3 s. Serwer przy odczycie przesuwa status, jeśli minął próg. Przy każdej zmianie, jeśli `notify_ride_status = true` i `last_notified_status ≠ nowy status`, wysyła powiadomienie Discord i aktualizuje `last_notified_status` (warunkowy UPDATE chroni przed duplikatami przy równoległych odczytach). Użytkownik może anulować kurs przed statusem `in_progress`.

**Powiadomienia Discord:** webhook z profilu, w razie braku — domyślny z `DISCORD_WEBHOOK_URL`. Treść np. „🚕 Kierowca Marek (Toyota Corolla, WX 12345) przyjął Twój kurs”.

## 7. Czatbot (worker)

- `worker/worker.mjs`, uruchamiany `npm run worker`.
- Subskrypcja Supabase Realtime na INSERT do `chat_messages`; przy starcie dodatkowo obsługuje zaległe `pending`.
- Prompt: rola asystenta Eko Taxi + cennik + 5 ostatnich kursów użytkownika + pytanie. Odpowiedź po polsku, krótko.
- Wywołanie: `claude -p "<prompt>" --output-format json`, timeout 60 s.
- Kolejka sekwencyjna (jedno pytanie na raz).
- Heartbeat co 10 s do `worker_heartbeat`; UI pokazuje „Asystent online”, jeśli `last_seen` < 30 s temu, w przeciwnym razie „Asystent offline — odpowiedź pojawi się po jego uruchomieniu”.
- Odpowiedź trafia do UI przez Supabase Realtime (UPDATE na `chat_messages`).

## 8. Obsługa błędów

- Błąd/timeout `claude` → `status = error`, w UI „Nie udało się odpowiedzieć — spróbuj ponownie”.
- Błąd webhooka Discord → log po stronie serwera, kurs przebiega normalnie (powiadomienie nie blokuje).
- Nominatim niedostępny → wybór punktu kliknięciem na mapie.
- Brak sesji → przekierowanie do logowania (middleware).

## 9. Testy

Vitest:
- obliczanie ceny (haversine, mnożniki, minimum),
- przejścia statusów wg czasu i decyzja o wysłaniu powiadomienia (brak duplikatów),
- budowanie promptu w workerze.

Ręczny scenariusz demo w README: rejestracja → zmiana motywu → zamówienie kursu → powiadomienia na Discordzie → pytanie do czatbota → dodanie promocji jako admin.

## 10. Wdrożenie

- GitHub: `.env.local` i `worker/.env` w `.gitignore`, w repo `.env.example`.
- Vercel podpięty do repo; zmienne: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DISCORD_WEBHOOK_URL`.
- Migracje SQL (tabele, RLS, seed kierowców) w `supabase/migrations/`.
- README: opis, link do wdrożenia, instrukcja uruchomienia workera, mapowanie 7 wymagań.

## 11. Poza zakresem

Prawdziwi kierowcy i ich panel, płatności, GPS na żywo, wyznaczanie tras po drogach, aplikacja mobilna, powiadomienia e-mail.

## 12. Sposób pracy

Implementacja wg planu (writing-plans), zadania realizowane przez agentów (subagent-driven-development); interfejs projektowany z użyciem wtyczki frontend-design.
