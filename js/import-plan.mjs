// CSV parsing and validation for match imports; no database access in this module.
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const input = String(text ?? '').replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((v) => String(v).trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new Error('CSV sadrži nezatvoren navodnik.');
  row.push(field);
  if (row.some((v) => String(v).trim() !== '')) rows.push(row);
  return rows;
}

export function planMatches(rows, teams, seasonId) {
  const [head, ...data] = rows || [];
  if (!head) return { plan: [], errors: ['Fajl je prazan.'] };
  const headers = head.map((h) => String(h).trim().toLowerCase());
  const col = (k) => headers.indexOf(k);
  const need = ['kolo', 'domacin', 'gost', 'datum', 'vrijeme', 'mjesto'];
  const missing = need.filter((k) => col(k) < 0);
  if (missing.length) return { plan: [], errors: [`Nedostaju kolone: ${missing.join(', ')}.`] };
  const byName = new Map((teams || []).map((t) => [String(t.name).trim().toLocaleLowerCase('bs-BA'), t.id]));
  const plan = [], errors = [];
  data.forEach((r, i) => {
    const get = (k) => col(k) >= 0 ? String(r[col(k)] ?? '').trim() : '';
    const problems = [];
    const round = Number(get('kolo'));
    if (!Number.isInteger(round) || round < 1 || round > 99) problems.push('kolo mora biti 1–99');
    const homeName = get('domacin'), awayName = get('gost');
    const home = byName.get(homeName.toLocaleLowerCase('bs-BA'));
    const away = byName.get(awayName.toLocaleLowerCase('bs-BA'));
    if (!home) problems.push(`nepoznata ekipa domaćin "${homeName}"`);
    if (!away) problems.push(`nepoznata ekipa gost "${awayName}"`);
    if (home && away && home === away) problems.push('ekipa ne može igrati sama protiv sebe');
    const date = get('datum'), time = get('vrijeme');
    let when = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) {
      const candidate = new Date(`${date}T${time}:00`);
      if (!Number.isNaN(candidate.getTime()) && candidate.toISOString().slice(0, 10) === date &&
          candidate.getHours() >= 0 && Number(time.slice(0, 2)) < 24 && Number(time.slice(3, 5)) < 60) when = candidate;
    }
    if (!when) problems.push('datum (YYYY-MM-DD) ili vrijeme (HH:MM) nisu ispravni');
    const hs = get('golovi_domacin'), as = get('golovi_gost');
    const hasScore = hs !== '' || as !== '';
    let hScore = null, aScore = null;
    if (hasScore) {
      hScore = Number(hs); aScore = Number(as);
      if (hs === '' || as === '' || !Number.isInteger(hScore) || hScore < 0 || !Number.isInteger(aScore) || aScore < 0 || hScore > 99 || aScore > 99) {
        problems.push('rezultat: oba broja moraju biti cijeli brojevi 0–99');
      }
    }
    if (problems.length) { errors.push(`red ${i + 2}: ${problems.join(', ')}`); return; }
    plan.push({
      season_id: seasonId, round, home_team_id: home, away_team_id: away,
      scheduled_at: when.toISOString(), venue: get('mjesto') || null,
      status: hasScore ? 'finished' : 'scheduled',
      home_score: hasScore ? hScore : null, away_score: hasScore ? aScore : null,
    });
  });
  return { plan, errors };
}
