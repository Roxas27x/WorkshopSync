const validSteamId=value=>typeof value==='string'&&/^765\d{14}$/.test(value);
function selectIdentity(community,relay){
 const steamid=relay.verified&&validSteamId(relay.steamid)?relay.steamid:validSteamId(community?.steamid)?community.steamid:null;
 return steamid?{steamid,communityAuthorized:community?.steamid===steamid}:null;
}
function assertSameAccount(expected,actual){if(!validSteamId(expected)||actual!==expected)throw new Error('The Steam account changed. Review your selected mods and try again.');}
module.exports={selectIdentity,assertSameAccount};
