const systemAppearance=window.matchMedia('(prefers-color-scheme: dark)');
function applyAppearance(){
 const appearance=Themes.normalize(state?.appearance),theme=Themes.tokens(appearance,systemAppearance.matches),element=document.documentElement;
 for(const [key,value] of Object.entries(theme.variables))element.style.setProperty('--'+key,value);
 element.style.colorScheme=theme.mode;element.dataset.palette=theme.palette;element.dataset.appearance=appearance.mode;
 for(const choice of document.querySelectorAll('[data-theme-palette]')){
  const active=choice.dataset.themePalette===appearance.palette;choice.classList.toggle('current',active);choice.setAttribute('aria-pressed',String(active));
  const preview=Themes.tokens({...appearance,palette:choice.dataset.themePalette},systemAppearance.matches).variables;
  for(const key of ['bg','panel','accent'])choice.style.setProperty('--preview-'+key,preview[key]);
 }
 const selector=document.querySelector('#appearance-mode');if(selector)selector.value=appearance.mode;
}
function appearanceSettings(){
 const selected=Themes.normalize(state.appearance);
 return `<section class="appearance-settings" aria-label="Appearance settings"><div class="settings-section-heading"><div><h3>Appearance</h3><p>Choose a color palette and how it follows your display.</p></div><label class="mode-label" for="appearance-mode">Mode<select id="appearance-mode" aria-label="Appearance mode">${[['dark','Dark'],['light','Light'],['system','System']].map(([value,label])=>`<option value="${value}" ${selected.mode===value?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="palette-options" role="group" aria-label="Color palette">${Themes.palettes.map(p=>`<button class="palette-choice ${selected.palette===p.id?'current':''}" data-action="palette" data-id="${p.id}" data-theme-palette="${p.id}" aria-pressed="${selected.palette===p.id}" aria-label="Use ${p.name} palette"><span class="palette-preview" aria-hidden="true"><span></span><i></i></span><span>${p.name}</span></button>`).join('')}</div></section>`;
}
systemAppearance.addEventListener('change',()=>{if(state?.appearance?.mode==='system')applyAppearance();});
