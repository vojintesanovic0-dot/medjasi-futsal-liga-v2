// Dinamički naslov i opis po hash-ruti. Hash-rute ne mijenjaju HTML URL putanju.
const BASE = 'Međasi Futsal Liga';
const RULES = [
  [/^\/$/, null, 'Utakmice uživo, tabela, ekipe i vijesti Međasi Futsal Lige.'],
  [/^\/utakmice/, 'Utakmice', 'Raspored i rezultati utakmica Međasi Futsal Lige.'],
  [/^\/utakmica\//, 'Utakmica', 'Tok utakmice, sastavi i rezultat uživo.'],
  [/^\/tabela/, 'Tabela', 'Aktuelna tabela lige sa bodovima i formom ekipa.'],
  [/^\/statistika/, 'Statistika', 'Strijelci, asistencije i fair play lige.'],
  [/^\/ekipe$|^\/ekipa\//, 'Ekipe', 'Ekipe i sastavi Međasi Futsal Lige.'],
  [/^\/vijest/, 'Vijesti', 'Najnovije vijesti iz lige.'],
  [/^\/galerija/, 'Galerija', 'Fotografije i video iz lige.'],
  [/^\/fan/, 'Fan game', 'Pogodi rezultat i takmiči se s navijačima.'],
  [/^\/zajednica/, 'Zajednica', 'Objave i razgovor navijača.'],
  [/^\/chat/, 'Chat', 'Razgovor navijača uživo.'],
  [/^\/pretraga/, 'Pretraga', 'Pretraži ekipe, igrače i vijesti.'],
];

function apply() {
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0].split('#')[0];
  const rule = RULES.find(([pattern]) => pattern.test(path));
  document.title = rule?.[1] ? `${rule[1]} · ${BASE}` : BASE;
  document.querySelector('meta[name="description"]')
    ?.setAttribute('content', rule?.[2] || 'Međasi Futsal Liga.');
}

export function initSeo() {
  apply();
  window.addEventListener('hashchange', apply);
}
