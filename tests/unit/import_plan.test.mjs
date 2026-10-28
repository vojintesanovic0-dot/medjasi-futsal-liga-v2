import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, planMatches } from '../../js/import-plan.mjs';

const teams = [{ id: 't1', name: 'Alfa' }, { id: 't2', name: 'Beta' }];
const head = ['kolo', 'domacin', 'gost', 'datum', 'vrijeme', 'mjesto', 'golovi_domacin', 'golovi_gost'];

test('CSV parser supports quoted commas and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,b\n"hala, velika","klub ""A"""'), [['a','b'],['hala, velika','klub "A"']]);
});
test('valid scheduled match is planned', () => {
  const { plan, errors } = planMatches([head, ['1','Alfa','Beta','2026-11-01','18:30','Hala','','']], teams, 7);
  assert.equal(errors.length, 0); assert.equal(plan.length, 1); assert.equal(plan[0].status, 'scheduled');
  assert.equal(plan[0].season_id, 7); assert.equal(plan[0].home_team_id, 't1'); assert.equal(plan[0].home_score, 0);
});
test('result makes match finished', () => {
  const { plan } = planMatches([head, ['2','Alfa','Beta','2026-11-08','19:00','Hala','3','1']], teams, 7);
  assert.equal(plan[0].status, 'finished'); assert.equal(plan[0].home_score, 3); assert.equal(plan[0].away_score, 1);
});
test('unknown and same teams are rejected', () => {
  const { plan, errors } = planMatches([head, ['1','X','Beta','2026-11-01','18:30','Hala','',''], ['1','Alfa','Alfa','2026-11-01','18:30','Hala','','']], teams, 7);
  assert.equal(plan.length, 0); assert.equal(errors.length, 2);
});
test('bad date, partial score, and missing columns are rejected', () => {
  assert.equal(planMatches([head, ['1','Alfa','Beta','01.11.2026','18:30','Hala','','']], teams, 7).plan.length, 0);
  assert.equal(planMatches([head, ['1','Alfa','Beta','2026-11-01','18:30','Hala','2','']], teams, 7).plan.length, 0);
  assert.match(planMatches([['kolo','domacin'],['1','Alfa']], teams, 7).errors[0], /Nedostaju kolone/);
});
