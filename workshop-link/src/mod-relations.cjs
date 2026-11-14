const {load}=require('cheerio');
function workshopId(value){
 try{let url=new URL(value);for(let n=0;n<3;n++){
  if(!['steamcommunity.com','www.steamcommunity.com'].includes(url.hostname)||!['http:','https:'].includes(url.protocol))return null;
  if(url.pathname.replace(/\/$/,'')==='/linkfilter'){url=new URL(url.searchParams.get('u')||url.searchParams.get('url'));continue;}
  const id=url.searchParams.get('id');return /^\/(?:sharedfiles|workshop)\/filedetails\/?$/.test(url.pathname)&&/^[1-9]\d{0,19}$/.test(id||'')?id:null;
 }}catch{}return null;
}
const clean=text=>String(text||'').replace(/\s+/g,' ').trim();
const headingText=text=>clean(text).replace(/^[\s\-–—_=~*#:\[\]<>]+|[\s\-–—_=~*#:\[\]<>]+$/g,'');
function sectionKind(text){
 const value=headingText(text);
 if(/^(?:optional(?: (?:mods|addons|items|recommendations))?|recommend(?:ed|ations)(?: (?:mods|addons|items))?|suggested (?:mods|addons|items))$/i.test(value))return'optional';
 if(/^(?:compatibility(?: (?:patches|mods|notes))?|patches|load order)$/i.test(value))return'compatibility';
 if(/^(?:incompatibilit(?:y|ies)|conflicts|known (?:conflicts|incompatibilities))$/i.test(value))return'conflict';
 if(/^(?:required (?:mods|items|addons|libraries)|requirements|dependencies|prerequisites)$/i.test(value))return'author-required';
 return null;
}
function textLines($,element){const copy=$(element).clone();copy.find('br').replaceWith('\n');copy.find('p,li,blockquote,div,h1,h2,h3,h4').each((_,node)=>{$(node).prepend('\n').append('\n');});return copy.text().split(/\n+/).map(clean).filter(Boolean);}
function analyzeDescription(html,self){
 const $=load(html||''),related=new Map(),notes=[];$('button').remove();
 const headings=new Set($('h1,h2,h3,h4').toArray().map(node=>clean($(node).text()))),links=[];
 $('a').each((_,node)=>{const link=$(node),index=links.length;links.push({id:workshopId(link.attr('href')),title:clean(link.text()),href:link.attr('href')});link.prepend('WORKSHOPSYNC_LINK_'+index+'_');});
 const source=textLines($,$('body')),marker=/WORKSHOPSYNC_LINK_(\d+)_/g,lines=source.map(text=>({text:clean(text.replace(marker,'')),links:[...text.matchAll(marker)].map(match=>links[Number(match[1])]).filter(Boolean)}));
 const relevant=/\b(?:requir(?:e[sd]?|ements?)|mandatory|optional|recommend(?:ed|s)?|incompatib\w*|compatib\w*|conflicts?|will not work|won.t work|load order|load (?:before|after)|do not use)\b/i;
 const addNote=value=>{const text=clean(value);if(text.length<15||notes.length>=15)return;const match=relevant.exec(text),start=Math.max(0,(match?.index||0)-120),excerpt=text.slice(start,start+650);if(!notes.some(note=>note.includes(excerpt)||excerpt.includes(note)))notes.push(excerpt);};
 let heading='',kind=null;
 for(let index=0;index<lines.length;index++){
  const line=lines[index],text=line.text,next=lines[index+1],previous=lines[index-1],label=sectionKind(text);
  const header=!line.links.length&&(label||headings.has(text)||text.length<160&&(/^[\-_=~*#]{2,}.+[\-_=~*#]{2,}$/.test(text)||/^(?:updates?|change\s?log|credits|description|features|installation)\s*:?$/i.test(headingText(text))));
  if(header){heading=headingText(text);kind=label;continue;}
  for(const sentence of text.split(/(?<=[.!?])\s+/))if(relevant.test(sentence))addNote(sentence);
  // Text-only recommendations still matter, but a heading or a label for a linked item is not a warning by itself.
  if(kind&&!line.links.some(link=>link.id)&&!next?.links.some(link=>link.id)&&!/^https?:\/\//i.test(text))addNote(heading+' — '+text);
  const previousLabel=previous&&!previous.links.length&&!sectionKind(previous.text)&&!headings.has(previous.text)&&previous.text.length<240&&!/^[\-_=~*#]{2,}/.test(previous.text)?previous.text:'';
  for(const link of line.links){
   if(!link.id||link.id===self)continue;
   const bare=!link.title||/^https?:\/\//i.test(link.title),context=clean((bare&&previousLabel?previousLabel+' ':'')+text),title=bare&&previousLabel?previousLabel.replace(/:\s*$/,''):link.title||'Workshop item '+link.id;
   const location=context.indexOf(link.title),before=context.slice(0,Math.max(0,location)),after=context.slice(location+link.title.length);let relation=kind||'related';
   if(/\b(?:not compatible|incompatib\w*|conflicts? with|do not use|don.t use)\b/i.test(context))relation='conflict';
   else if(/\b(?:optional|recommend\w*|suggest\w*)\b/i.test(context))relation='optional';
   else if(/\b(?:compatib\w*|patch(?:es)?|load order|load before|load after)\b/i.test(context))relation='compatibility';
   else if(/\b(?:requires?|needs?|install|required items?)\s*[:\-]?\s*$/i.test(before)||/^\s*(?:is required|is mandatory|must be installed)\b/i.test(after))relation='author-required';
   const prior=related.get(link.id),rank={related:0,optional:1,compatibility:2,'author-required':3,conflict:4};if(!prior||rank[relation]>rank[prior.kind])related.set(link.id,{id:link.id,title:title.slice(0,300),kind:relation,context:clean((heading?heading+' — ':'')+context).slice(0,650)});
  }
 }
 return{relatedItems:[...related.values()].slice(0,100),compatibilityNotes:notes};
}
module.exports={workshopId,analyzeDescription};
