# Međasi Futsal Liga — v2

Odvojeni projekat sajta lige. Ovaj repozitorij je odvojen od starog repozitorija i ima vlastitu Supabase šemu.

## Tehnologije

- Frontend: HTML, CSS i JavaScript ES moduli; nema build koraka.
- Backend: Supabase Auth, PostgreSQL, RLS, Realtime i Storage.
- PWA: `manifest.json` i `sw.js`.
- Push obavještenja: Edge Function `supabase/functions/send-push/index.ts`.

## 1. Napravi novi Supabase projekat

1. Kreiraj **novi** projekat na Supabaseu. Nemoj pokretati šemu nad bazom starog sajta.
2. Otvori **SQL Editor → New query**.
3. Zalijepi cijeli `supabase/schema.sql` i pokreni ga jednom.
4. U **Authentication → Providers → Email** provjeri postavke potvrde e-maila.
5. U **Project Settings → API** kopiraj Project URL i anon/public ključ.

**Napomena:** SQL šema još nije pokrenuta na živom projektu u sklopu pripreme repozitorija.

## 2. Podesi frontend

Otvori `js/config.js` i zamijeni oba placeholdera podacima iz *novog* Supabase projekta:

```js
export const SUPABASE_URL = 'https://TVOJ-REF.supabase.co';
export const SUPABASE_ANON_KEY = 'TVOJ-ANON-PUBLIC-KLJUC';
```

U frontend nikad ne upisuj `service_role` ključ. On pripada samo sigurnom server-side okruženju/Edge Function secrets.

Dok `js/config.js` sadrži placeholder vrijednosti, aplikacija se neće moći povezati s bazom.

## 3. Prvi administrator

1. Pokreni sajt i registruj nalog.
2. U SQL Editoru pokreni naredbu ispod, zamjenjujući korisničko ime stvarnim imenom iz profila:

```sql
update public.profiles set role = 'admin' where username = 'tvoje_ime';
```

3. Osvježi sajt.

Uloge u šemi: `user`, `editor` i `admin`. Šema ograničava korisnike da sami sebi dodijele administratorsku ulogu.

## 4. Početak rada

1. U administraciji napravi sezonu i aktiviraj je.
2. Dodaj ekipe i igrače.
3. Dodaj utakmice, kola, datum i teren.
4. Tokom utakmice koristi kontrole za početak/pauzu/nastavak, promjenu perioda i završetak te dodaj događaje.
5. Objavljuj vijesti i dodaj sadržaj galerije.

## 5. Pokretanje lokalno

Pokreni statički server iz korijena projekta. ES moduli ne rade pouzdano preko `file://`.

```bash
python3 -m http.server 8080
```

Zatim otvori `http://localhost:8080`.

## 6. Push obavještenja (opciono)

1. Generiši VAPID ključeve.
2. Upiši javni ključ u `js/config.js`.
3. Dodaj secrets u Supabase: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` i `VAPID_SUBJECT`.
4. Deploy Edge Function `send-push` preko Supabase CLI-ja.

Push nije aktiviran niti testiran na živom projektu. Edge Function nikad ne treba izlagati service-role ključ u frontend kodu.

## Šta treba završiti prije produkcije

- Unijeti ispravne URL/anon podatke novog Supabase projekta.
- Pokrenuti šemu samo u novoj bazi i provjeriti da se kompletno izvršila.
- Testirati registraciju/prijavu, uloge, čitanje i upis podataka s pravim Supabase projektom.
- Testirati upload, Storage pravila, Realtime, PWA instalaciju i push na stvarnim uređajima.
- Provjeriti JavaScript i rute nakon završnog povezivanja s bazom.

## Struktura

- `index.html` — osnovni okvir i navigacija.
- `css/style.css` — tema i responzivni raspored.
- `js/config.js` — konfiguracija Supabasea.
- `js/pages/` — stranice lige, utakmica, tabela, vijesti, galerije, chata, fan igre, zajednice i administracije.
- `supabase/schema.sql` — tabele, funkcije, triggeri, pogledi, RLS, Storage i Realtime.
- `supabase/functions/send-push/index.ts` — Edge Function za push.

