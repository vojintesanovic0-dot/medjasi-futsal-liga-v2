# Međasi Futsal Liga — v2

Odvojeni projekat sajta lige. Novi frontend je povezan s novim Supabase projektom; stari sajt i njegova baza nisu mijenjani.

- **GitHub repo:** https://github.com/vojintesanovic0-dot/medjasi-futsal-liga-v2
- **Supabase project:** https://supabase.com/dashboard/project/fmrypbvjaytecjinpsnp
- **Live site:** https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/
- **Latest successful deployment:** https://github.com/vojintesanovic0-dot/medjasi-futsal-liga-v2/actions/runs/40186542162

## Status

- Nova Supabase baza je kreirana u EU Central i šema je primijenjena.
- RLS je uključen na svih 14 glavnih tabela.
- Frontend `js/config.js` je povezan s URL-om i javnim `sb_publishable_` ključem novog projekta.
- GitHub Actions validacija prolazi.
- **GitHub Pages je aktiviran i deployment je uspješno završen** (commit `6e7a1e978dcdb15e5283ef04227e4eaf022b1052`).
- Edge Function `send-push` je deploy-ovana u Supabase, ali push slanje nije spremno za produkciju dok se ne podese VAPID ključevi kao Supabase secrets; privatni ključ se ne stavlja u frontend ili repozitorij.

## 1. GitHub Pages — objavljeno

GitHub Actions potvrđuje uspješan deployment. Stranica je na https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/ . Za kasnije izmjene dovoljno je poslati commit na `main`; workflow automatski ponavlja provjeru i objavu.

## 2. Supabase

Novi projekat je već kreiran:

- Project ref: `fmrypbvjaytecjinpsnp`
- URL: `https://fmrypbvjaytecjinpsnp.supabase.co`
- Regija: `eu-central-1` (EU Central)

Šema se nalazi u `supabase/schema.sql`; izvršena je u novoj bazi i zasebne bezbjednosne migracije su zabilježene u istoriji projekta.

Nakon prvog uključivanja GitHub Pages, u Supabase otvori **Authentication → URL Configuration** i postavi:

- **Site URL:** `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/`
- **Redirect URLs:** dodaj istu adresu.

To je važno za e-mail potvrdu i povratak nakon prijave.

## 3. Prvi administrator

1. Otvori sajt nakon objave i registruj se u **Prijava → Registracija**.
2. U [Supabase SQL Editoru](https://supabase.com/dashboard/project/fmrypbvjaytecjinpsnp/sql/new) pokreni sljedeći SQL uz tačno korisničko ime koje si izabrao:

```sql
update public.profiles set role = 'admin' where username = 'tvoje_korisnicko_ime';
```

3. Odjavi se i prijavi ponovo. Admin dugme treba da postane vidljivo.

Uloge: `user`, `editor` (vijesti i galerija) i `admin` (sve).

## 4. Početno podešavanje lige

U administraciji dodaj i aktiviraj sezonu (npr. `2026/27`), zatim dodaj ekipe, igrače i raspored utakmica. Nova baza počinje prazna; podaci nisu automatski prekopirani iz starog sajta.

## 5. Pokretanje lokalno

```bash
python3 -m http.server 8080
```

Otvori `http://localhost:8080`. ES moduli ne rade pouzdano preko `file://`.

## 6. Funkcije

- Uživo utakmice, sat, periodi, događaji i rezultat iz događaja.
- Tabela, ekipe, sastavi i igrači.
- Vijesti, javna galerija i chat.
- Fan game, anonimna raspodjela prognoza i rang-lista.
- Zajednica s objavama, slikama, komentarima i lajkovima.
- PWA manifest i service worker.
- Edge Function izvor za push nalazi se u `supabase/functions/send-push/index.ts`.

Naslovna slika vijesti se unosi kao URL u admin panelu; upload slike direktno s uređaja u vijesti još nije povezan. Push zahtijeva VAPID ključeve i test na stvarnom uređaju.

## 7. Provjere

- GitHub Actions provjera sintakse, lokalnih importova, HTML referenci, PWA ikonica i potrebnih SQL tabela prolazi.
- Supabase je potvrdio 14 tabela s uključenim RLS-om.
- Security advisors trenutno ne prikazuju upozorenja.
- RPC za fan raspodjelu i rang-listu izvršava se uspješno nad praznom bazom.
- Registracija kroz browser, stvarna prijava, objava vijesti, Storage upload i mobilni push još zahtijevaju test nakon aktiviranja Pages i kreiranja prvog admin naloga.


## v4 izmjene (26.10.2026.)

- Zelena akcentna tema, animacije i poštovanje postavke smanjenih animacija.
- Oporavak zaboravljene lozinke, forma posljednjih pet završenih utakmica i .ics kalendar cijele sezone.
- Nova stranica Statistika: strijelci, asistencije i fair play.
- Profil nudi brisanje naloga uz potvrdu; Edge Function provjerava ulogu, štiti posljednjeg administratora i čisti korisnikove slike objava.
- Dodana je stranica Privatnost i uslovi.

### Koraci prije pune produkcijske upotrebe

1. U Supabase Authentication → URL Configuration postavi Site URL na `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/` i dodaj Redirect URL `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/**`. Ovo je potrebno da reset lozinke vrati korisnika na ispravnu rutu.
2. U `privatnost.html` obavezno zamijeni sve vrijednosti u uglastim zagradama (kontakt, organizator, pravni osnov i starosna granica) i provjeri tekst prije konačne objave.
3. Statistika čita view `public.player_stats`; za postojeću bazu primjenjuje se migracija `supabase/migrations/20261026_player_stats.sql`.


## v5 — preostale funkcije

- Administracija vijesti podržava naslovnu sliku s uređaja (do 10 MB) i zakazivanje po lokalnom datumu/vremenu.
- Dodani su generator rasporeda, audit log, obrada prijava i upozorenja korisnicima.
- Zajednica može prijaviti objavu ili komentar; Fan game prikazuje značke.
- Detalj utakmice ima MVP glasanje i razgovor uživo, a tabela prikazuje formu posljednjih pet utakmica.
- Dodani su pretraga, dinamički naslovi/opisi, Open Graph oznake, `sitemap.xml`, `robots.txt` i dodatne provjere u GitHub Actions.
- Dodan je opciono pozivani `remind-predictions` Edge Function. Izvor je u repozitoriju i funkcija je deployovana, ali automatsko pokretanje podsjetnika nije uključeno dok se ne podese tajne i cron raspored.

### Obavezna ručna podešavanja

1. U Supabase → Authentication → Providers → Email uključi **Confirm email** ako želiš obaveznu potvrdu adrese.
2. U Supabase → Authentication → URL Configuration postavi Site URL na `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/`. Dodaj Redirect URL `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/**` i po potrebi tačan reset URL `https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/#/nova-lozinka`.
3. Za web push i podsjetnike podesi `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` i `CRON_SECRET` u Supabase Edge Function Secrets; javni VAPID ključ upiši u `js/config.js`. Nemoj commitovati vrijednosti tajni u GitHub.
4. Tek nakon toga uključi `pg_cron` i `pg_net` te podesi siguran cron poziv ka `remind-predictions`. Dokumentacija Supabase preporučuje da se tajne za cron pozive čuvaju u Vault-u, a ne u SQL fajlu u repozitoriju.
5. `privatnost.html` ostaje nacrt: zamijeni placeholder-e za kontakt, organizatora, pravni osnov i starosnu granicu. Sentry nije uključen jer zahtijeva tvoj Sentry projekat i DSN.
