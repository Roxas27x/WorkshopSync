const ID = /^[1-9]\d{0,19}$/;
function id(value) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error('Enter a valid Workshop item ID.');
  return value;
}
function parseInput(text) {
  if (typeof text !== 'string' || text.length > 250000) throw new Error('Paste up to 250 KB of Workshop links.');
  const parts = text.trim().split(/[\s,]+/).filter(Boolean);
  if (!parts.length) throw new Error('Paste at least one Workshop URL or item ID.');
  const ids = parts.map(part => {
    if (ID.test(part)) return part;
    let url;
    try { url = new URL(part); } catch { throw new Error('Use Steam Workshop URLs or numeric item IDs, one per line.'); }
    if (url.protocol !== 'https:' || url.hostname !== 'steamcommunity.com' || url.port || url.username || url.password || !/^\/(sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname))
      throw new Error('Only https://steamcommunity.com/sharedfiles/filedetails/?id=… links are accepted.');
    return id(url.searchParams.get('id'));
  });
  if (ids.length > 5000) throw new Error('Use at most 5,000 items at a time.');
  return [...new Set(ids)];
}
function gameId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value) || Number(value) > 4294967295) throw new Error('Invalid Steam game ID.');
  return value;
}
function normalizeDetail(x) {
  if (Number(x.result) !== 1) throw new Error(`Workshop item ${x.publishedfileid || ''} is private, missing, or unavailable.`);
  return {
    id: id(String(x.publishedfileid)), appid: String(x.consumer_app_id || x.consumer_appid || '0'),
    title: String(x.title || `Workshop item ${x.publishedfileid}`).slice(0,500),
    type: Number(x.file_type ?? x.filetype ?? 0), creator: String(x.creator || ''),
    image: safeImage(x.preview_url), updated: Number(x.time_updated || 0), size: Number(x.file_size || 0)
  };
}
function safeImage(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && ['steamusercontent.com','steamstatic.com','akamaihd.net'].some(h => u.hostname === h || u.hostname.endsWith('.'+h)) ? u.href : '';
  } catch { return ''; }
}
function eligible(items, game, known = {}, installed = []) {
  if (!game || game.sync !== true) return [];
  const skip = new Set([...Object.keys(known).filter(k=>known[k]), ...installed]);
  const seen = new Set();
  return items.filter(x => {
    if (x.appid !== game.id || x.type === 2 || skip.has(x.id) || (game.autoSyncBlacklist||[]).some(row=>row.id===x.id) || seen.has(x.id)) return false;
    id(x.id); seen.add(x.id); return true;
  });
}
function parseVdf(text) {
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}]|\/\/[^\r\n]*/g) || [];
  let i=0;
  function parse() {
    const out = Object.create(null);
    while (i<tokens.length) {
      const k=tokens[i++];
      if(k.startsWith('//')) continue;
      if(k==='}') return out;
      if(k==='{') throw new Error('Invalid Steam library manifest.');
      while(tokens[i]?.startsWith('//')) i++;
      const v=tokens[i++];
      const decode=s=>s.slice(1,-1).replace(/\\\\/g,'\\').replace(/\\"/g,'"');
      if(!v) throw new Error('Incomplete Steam library manifest.');
      out[decode(k)] = v==='{' ? parse() : decode(v);
    }
    return out;
  }
  return parse();
}
module.exports={id,gameId,parseInput,normalizeDetail,safeImage,eligible,parseVdf};
