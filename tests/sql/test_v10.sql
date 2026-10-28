-- V10: trener i zamjenik kapitena. Testovi se izvršavaju nad izolovanom bazom.
begin;

do $$
declare
  t1 uuid;
  t2 uuid;
  p1 uuid;
  saved text;
begin
  insert into public.teams (name) values ('V10 test A') returning id into t1;
  insert into public.teams (name) values ('V10 test B') returning id into t2;

  update public.teams set coach_name = 'Marko Marković' where id = t1;
  select coach_name into saved from public.teams where id = t1;
  if saved <> 'Marko Marković' then raise exception 'FAIL: trener nije sačuvan'; end if;
  raise notice 'PASS: trener je sačuvan';

  begin
    update public.teams set coach_name = 'A' where id = t1;
    raise exception 'FAIL: prekratko ime trenera je prihvaćeno';
  exception when check_violation then
    raise notice 'PASS: prekratko ime trenera je odbijeno';
  end;

  insert into public.players (team_id, first_name, last_name, number, is_captain, is_vice_captain)
    values (t1, 'Test', 'Kapiten', 91, true, false) returning id into p1;
  begin
    update public.players set is_vice_captain = true where id = p1;
    raise exception 'FAIL: kapiten je mogao biti i zamjenik';
  exception when check_violation then
    raise notice 'PASS: kapiten i zamjenik ne mogu biti ista osoba';
  end;

  insert into public.players (team_id, first_name, last_name, number, is_vice_captain)
    values (t1, 'Prvi', 'Zamjenik', 92, true);
  begin
    insert into public.players (team_id, first_name, last_name, number, is_vice_captain)
      values (t1, 'Drugi', 'Zamjenik', 93, true);
    raise exception 'FAIL: dva zamjenika u istoj ekipi su prihvaćena';
  exception when unique_violation then
    raise notice 'PASS: ekipa može imati samo jednog zamjenika';
  end;

  insert into public.players (team_id, first_name, last_name, number, is_vice_captain)
    values (t2, 'Treći', 'Zamjenik', 94, true);
  raise notice 'PASS: druga ekipa može imati svog zamjenika';
end $$;

rollback;
