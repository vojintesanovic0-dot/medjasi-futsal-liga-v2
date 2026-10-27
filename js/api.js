import { sb } from './supabase.js';

const unwrap = async (q) => { const { data, error } = await q; if (error) throw error; return data; };
const TEAM = 'id,name,short_name,logo_url,color';
const MATCH_SELECT = `*, home:teams!matches_home_team_id_fkey(${TEAM}), away:teams!matches_away_team_id_fkey(${TEAM})`;

export const getActiveSeason = () => unwrap(sb.from('seasons').select('*').eq('is_active', true).maybeSingle());
export const getSeasons = () => unwrap(sb.from('seasons').select('*').order('id', { ascending: false }));
export const getStandings = () => unwrap(sb.from('standings').select('*')
  .order('points', { ascending: false }).order('goal_diff', { ascending: false })
  .order('goals_for', { ascending: false }).order('name'));
export const getTeams = () => unwrap(sb.from('teams').select(TEAM).order('name'));
export const getTeam = (id) => unwrap(sb.from('teams').select('*').eq('id', id).maybeSingle());
export const getPlayers = (teamId) => teamId
  ? unwrap(sb.from('players').select('*').eq('team_id', teamId).order('number'))
  : unwrap(sb.from('players').select('*, team:teams(id,name,short_name)').order('last_name'));
export const getMatches = (seasonId) => unwrap(sb.from('matches').select(MATCH_SELECT)
  .eq('season_id', seasonId).order('scheduled_at'));
export const getMatch = (id) => unwrap(sb.from('matches').select(MATCH_SELECT).eq('id', id).maybeSingle());
export const getEvents = (matchId) => unwrap(sb.from('match_events')
  .select('*, player:players!match_events_player_id_fkey(id,first_name,last_name,number), assist:players!match_events_assist_id_fkey(id,first_name,last_name)')
  .eq('match_id', matchId).order('minute').order('created_at'));
export const getPublishedNews = (limit = 50) => unwrap(sb.from('news').select('*')
  .eq('published', true).order('published_at', { ascending: false }).limit(limit));
export const getNewsBySlug = (slug) => unwrap(sb.from('news').select('*').eq('slug', slug).maybeSingle());
export const getAllNews = () => unwrap(sb.from('news').select('*').order('created_at', { ascending: false }));
export const getGallery = () => unwrap(sb.from('gallery').select('*').order('created_at', { ascending: false }).limit(120));
export const getProfile = (id) => unwrap(sb.from('profiles').select('id,username,display_name,avatar_url,bio,role').eq('id', id).maybeSingle());
export const getPlayerStats = () => unwrap(sb.from('player_stats').select('*'));

// ---------- Fan game ----------
export const getOpenMatches = (seasonId) => unwrap(sb.from('matches').select(MATCH_SELECT)
  .eq('season_id', seasonId).eq('status', 'scheduled').order('scheduled_at').limit(30));
export const getMyPredictions = (userId) => unwrap(sb.from('fan_predictions')
  .select('*').eq('user_id', userId));
export const getAllPredictionsForMatches = (matchIds) => matchIds.length
  ? unwrap(sb.rpc('get_fan_prediction_distribution', { match_ids: matchIds }))
  : Promise.resolve([]);
export const getLeaderboard = async () => {
  const rows = await unwrap(sb.rpc('get_fan_leaderboard'));
  return rows.sort((a, b) => b.points - a.points || b.exact_hits - a.exact_hits).slice(0, 50);
};
export const getMyPoints = (userId) => unwrap(sb.from('fan_points')
  .select('points, exact_hit, match_id').eq('user_id', userId).not('points', 'is', null));
export const savePrediction = (userId, matchId, homePred, awayPred) => unwrap(sb.from('fan_predictions')
  .upsert({ user_id: userId, match_id: matchId, home_pred: homePred, away_pred: awayPred,
            updated_at: new Date().toISOString() }, { onConflict: 'user_id,match_id' }).select());

// ---------- Zajednica ----------
export const getFeed = (limit = 30, before = null) => {
  let q = sb.from('post_feed').select('*').order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  return unwrap(q);
};
export const getMyLikes = (userId) => unwrap(sb.from('post_likes').select('post_id').eq('user_id', userId));
export const getComments = (postId) => unwrap(sb.from('post_comments').select('*')
  .eq('post_id', postId).order('created_at').limit(200));
export const createPost = (userId, content, imageUrl) => unwrap(sb.from('posts')
  .insert({ user_id: userId, content, image_url: imageUrl || null }).select().single());
export const addComment = (userId, postId, content) => unwrap(sb.from('post_comments')
  .insert({ user_id: userId, post_id: postId, content }).select().single());
export const likePost = (userId, postId) => unwrap(sb.from('post_likes').insert({ user_id: userId, post_id: postId }));
export const unlikePost = (userId, postId) => unwrap(sb.from('post_likes').delete()
  .eq('user_id', userId).eq('post_id', postId));
export const deletePost = (postId) => unwrap(sb.from('posts').delete().eq('id', postId).select());

// ---------- Mediji (Storage bucket "media") ----------
export async function uploadMedia(file, folder) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
  const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb.storage.from('media').upload(path, file, { cacheControl: '3600', contentType: file.type });
  if (error) throw error;
  return sb.storage.from('media').getPublicUrl(path).data.publicUrl;
}

// ---------- Galerija (staff) ----------
export const addGalleryItem = (item) => unwrap(sb.from('gallery').insert(item).select().single());
export const deleteGalleryItem = (id) => unwrap(sb.from('gallery').delete().eq('id', id).select());

// ---------- Push ----------
export const saveSubscription = (userId, sub) => unwrap(sb.from('push_subscriptions').upsert({
  user_id: userId, endpoint: sub.endpoint,
  p256dh: sub.keys.p256dh, auth: sub.keys.auth,
}, { onConflict: 'endpoint' }).select());
export const removeSubscription = (endpoint) => unwrap(sb.from('push_subscriptions').delete().eq('endpoint', endpoint));

// Sastavi, zamjene i ocjene po utakmici.
export const getMatchPlayers = (matchId) => unwrap(sb.from('match_players').select('match_id,player_id,team_id,is_starter,player:players(id,first_name,last_name,number,position,is_captain)').eq('match_id', matchId));
export const getSubstitutions = (matchId) => unwrap(sb.from('match_substitutions').select('id,match_id,team_id,minute,player_out_id,player_in_id,out:players!match_substitutions_player_out_id_fkey(id,first_name,last_name,number),in:players!match_substitutions_player_in_id_fkey(id,first_name,last_name,number)').eq('match_id', matchId).order('minute'));
export const getMatchPlayerStats = (matchId) => unwrap(sb.from('match_player_stats').select('match_id,player_id,team_id,rating,saves').eq('match_id', matchId));

export const getPlayer = id => unwrap(sb.from('players').select('*, team:teams(id,name,short_name,color,logo_url)').eq('id',id).maybeSingle());
export const getPlayerSeasonStats = id => unwrap(sb.from('player_stats').select('*').eq('player_id',id).maybeSingle());
export const getPlayerMatchRows = id => unwrap(sb.from('match_players').select(`is_starter,match_id,match:matches(id,round,status,scheduled_at,home_score,away_score,home_team_id,away_team_id,home:teams!matches_home_team_id_fkey(id,name,short_name),away:teams!matches_away_team_id_fkey(id,name,short_name))`).eq('player_id',id));
export const getPlayerMatchStats = id => unwrap(sb.from('match_player_stats').select('match_id,rating,saves').eq('player_id',id));
export const getPlayerEvents = id => unwrap(sb.from('match_events').select('match_id,type,minute,player_id,assist_id').or(`player_id.eq.${id},assist_id.eq.${id}`));
export const getMyTeamApplications = userId => unwrap(sb.from('team_applications').select('*').eq('user_id',userId).order('created_at',{ascending:false}));
export const createTeamApplication = row => unwrap(sb.from('team_applications').insert(row).select().single());
export const getAllTeamApplications = () => unwrap(sb.from('team_applications').select('*').order('created_at',{ascending:false}));

// ---------- Sponzori ----------
export const getActiveSponsors = () => unwrap(sb.from('sponsors').select('*')
  .eq('active', true).order('sort_order').order('name'));
export const getAllSponsors = () => unwrap(sb.from('sponsors').select('*').order('sort_order').order('name'));
export const addSponsor = (row) => unwrap(sb.from('sponsors').insert(row).select().single());
export const updateSponsor = (id, patch) => unwrap(sb.from('sponsors').update(patch).eq('id', id).select());
export const deleteSponsor = (id) => unwrap(sb.from('sponsors').delete().eq('id', id).select());
