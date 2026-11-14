const {load}=require('cheerio');
const {id,gameId,safeImage}=require('./core.cjs');
function signedIn(html,expected){
  const actual=html.match(/\bg_steamID\s*=\s*["']?(\d{17})/)?.[1];
  if(!actual || actual!==expected){const error=new Error('Steam sign-in expired or the account changed. Sign in again.');error.code='STEAM_WEB_AUTH_REQUIRED';throw error;}
}
function parseSubscriptions(html,expected,page=1){
  signedIn(html,expected);const $=load(html);const rows=[];
  $('.workshopItemSubscription').each((_i,e)=>{
    const row=$(e);if((row.attr('id')||'').startsWith('Unsubscribed'))return;
    const title=row.find('.workshopItemTitle').first();if(!title.length)return;
    const link=title.closest('a').attr('href');let itemId;try{itemId=id(new URL(link,'https://steamcommunity.com').searchParams.get('id'));}catch{return;}
    const control=row.find('[onclick*="ToggleSubscribed("]').first().attr('onclick') || '';
    const match=control.match(/ToggleSubscribed\(\s*\d+\s*,\s*(\d+)\s*\)/);
    if(!match)throw new Error('Steam changed the subscription page format. Your previous list was kept.');
    rows.push({id:itemId,appid:gameId(match[1]),title:title.text().trim(),gameName:row.find('.workshopItemApp').first().text().trim(),image:safeImage(row.find('.workshopItemPreviewImage').first().attr('src')),type:0});
  });
  const text=$('.workshopBrowsePagingInfo').first().text().trim();
  const match=text.match(/Showing\s+([\d,]+)\s*-\s*([\d,]+)\s+of\s+([\d,]+)\s+entr/i);
  const total=match?Number(match[3].replaceAll(',','')):null;
  const next=$('.workshopBrowsePagingControls a').toArray().map(e=>{
    try{const u=new URL($(e).attr('href'),'https://steamcommunity.com');return Number(u.searchParams.get('p'));}catch{return 0;}
  }).filter(n=>n>page).sort((a,b)=>a-b)[0] || null;
  const emptyRecognized=/No (?:matching files|items|subscriptions)|Showing 0|0 entries/i.test($('#leftContents').text());
  if(!rows.length && total!==0 && !emptyRecognized)throw new Error('Steam did not return a recognizable subscription list. Your previous list was kept.');
  if(total!==null && total>rows.length && !next && page===1)throw new Error('Steam omitted subscription pagination. Your previous list was kept.');
  return {rows:[...new Map(rows.map(x=>[x.id,x])).values()],total,next};
}
function parseFriends(html,expected,{publicProfile=false}={}){
  if(publicProfile){const profile=html.match(/\bg_rgProfileData\s*=\s*(\{[^;]+\})\s*;/)?.[1];let actual;try{actual=JSON.parse(profile).steamid;}catch{}if(actual!==expected)throw new Error('Steam did not return the requested public friend profile. Previous friends were kept.');}
  else signedIn(html,expected);const $=load(html);
  if(!$('#search_results').length && !$('.profile_friends').length)throw new Error('Steam did not return your friend list. Previous friends were kept.');
  const friends=[];
  $('.friend_block_v2[data-steamid]').each((_i,e)=>{
    const node=$(e);const steamid=node.attr('data-steamid');if(!/^765\d{14}$/.test(steamid || ''))return;
    const content=node.find('.friend_block_content').first().clone();content.find('span,br').remove();
    friends.push({id:steamid,name:content.text().trim().slice(0,120)||'Steam friend',avatar:safeImage(node.find('.player_avatar img').attr('src'))});
  });
  return [...new Map(friends.map(f=>[f.id,f])).values()];
}
async function ownSubscriptions(steam,expected,onPage=()=>{}){
  const auth=await steam.auth();if(!auth || auth.steamid!==expected)throw new Error('Sign in to Steam before reading subscriptions.');
  const all=new Map();let page=1,total=null;const visited=new Set();
  while(page){
    if(visited.has(page)||visited.size>=200)throw new Error('Subscription pagination exceeded the safety limit. Previous data was kept.');visited.add(page);
    const current=await steam.auth();if(current?.steamid!==expected)throw new Error('Steam account changed during refresh. Previous data was kept.');
    const url=`https://steamcommunity.com/my/myworkshopfiles/?appid=0&browsefilter=mysubscriptions&numperpage=30&p=${page}&l=english`;
    const response=await steam.ses.fetch(url,{signal:AbortSignal.timeout(30000)});
    if(response.status===429)throw new Error('Steam is rate limiting subscription reads. Try again later.');
    if(!response.ok)throw new Error(`Steam subscription page returned HTTP ${response.status}.`);
    const parsed=parseSubscriptions(await response.text(),expected,page);
    if(total===null)total=parsed.total;else if(parsed.total!==null && total!==parsed.total)throw new Error('Subscriptions changed during refresh. Try again to get a consistent list.');
    for(const row of parsed.rows)all.set(row.id,row);
    if(all.size>5000)throw new Error('This beta supports up to 5,000 subscriptions per account.');
    onPage(all.size,total);page=parsed.next;
    if(page)await new Promise(r=>setTimeout(r,800));
  }
  if(total!==null && all.size!==total)throw new Error(`Steam reported ${total} subscriptions but returned ${all.size}. Previous data was kept.`);
  return [...all.values()];
}
async function ownFriends(steam,expected){
  const auth=await steam.auth();const privateAccess=auth?.steamid===expected;
  const response=privateAccess?await steam.ses.fetch('https://steamcommunity.com/my/friends/?l=english',{signal:AbortSignal.timeout(30000)}):await fetch(`https://steamcommunity.com/profiles/${expected}/friends/?l=english`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Steam friend list returned HTTP ${response.status}.`);
  try{return parseFriends(await response.text(),expected,{publicProfile:!privateAccess});}catch(error){if(!privateAccess)throw new Error('Your Steam friend list is private or unavailable. Authorize Steam Community access to refresh it. Previous friends were kept.');throw error;}
}
module.exports={signedIn,parseSubscriptions,parseFriends,ownSubscriptions,ownFriends};
