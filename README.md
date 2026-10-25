# Međasi Futsal Liga — v2

Odvojeni projekat sajta lige. Novi frontend je povezan s novim Supabase projektom; stari sajt i njegova baza nisu mijenjani.

- **GitHub repo:** https://github.com/vojintesanovic0-dot/medjasi-futsal-liga-v2
- **Supabase project:** https://supabase.com/dashboard/project/fmrypbvjaytecjinpsnp
- **Target URL:** https://vojintesanovic0-dot.github.io/medjasi-futsal-liga-v2/

## Status

- Nova Supabase baza je kreirana u EU Central i šema je primijenjena.
- RLS je uključen na svih 14 glavnih tabela.
- Frontend `js/config.js` je povezan s URL-om i javnim `sb_publishable_` ključem novog projekta.
- GitHub Actions validacija prolazi.
- **GitHub Pages još nije aktiviran:** automatizacija nema GitHub dozvolu da prvi put uključi Pages stranicu. Jednokratno uključi Pages u repo podešavanjima (koraci ispod). Nakon toga workflow automatski objavljuje stranicu.
- Push obavještenja nisu spremna za produkciju dok se ne podese VAPID ključevi kao Supabase secrets; privatni ključ se ne stavlja u frontend ili repozitorij.

## 1. Jednokratno uključi GitHub Pages

Otvori [Settings → Pages](https://github.com/vojintesanovic0-dot/medjasi-futsal-liga-v2/settings/pages), pa u sekciji **Build and deployment** postavi **Source: GitHub Actions**. Sačuvaj ako se dugme Save prikaže. To omogućava workflow-u `.github/workflows/pages.yml` da objavi sajt na target URL-u iznad.

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
