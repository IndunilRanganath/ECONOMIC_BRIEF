/* Shared UI and JSON-driven collections. No framework or build required. */
'use strict';
window.briefReady = (async () => {
  try { await window.articlesReady; }
  catch {
    const notice = document.createElement('p');
    notice.className = 'demo-note';
    notice.setAttribute('role', 'alert');
    notice.textContent = 'Posts could not be loaded. Please reload, or check the article data and local snapshot.';
    document.getElementById('main').replaceChildren(notice);
    return false;
  }
  window.BRIEF = { name: 'THE ECONOMIC BRIEF', tagline: 'Understanding Business. Decoding the Economy.', productionOrigin: '' };
  const categories = ['Economy', 'Business', 'Markets', 'Investing', 'Technology', 'Entrepreneurship', 'Personal Finance', 'Opinion'];
  const formats = { image: 'Image story', fact: 'Quick fact', article: 'Article' };
  ARTICLES.forEach(a => {
    if (!a.readingTime) {
      const template = document.createElement('template');
      template.innerHTML = a.body;
      a.readingTime = Math.max(1, Math.ceil(template.content.textContent.trim().split(/\s+/).filter(Boolean).length / 200));
    }
    if (!formats[a.format]) a.format = 'article';
  });
  const escapeText = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const articleURL = a => `article.html?slug=${encodeURIComponent(a.slug)}`;
  const categoryURL = name => `category.html?category=${encodeURIComponent(name)}`;
  const categoryLink = name => `<a href="${categoryURL(name)}">${escapeText(name)}</a>`;
  const formatLabel = a => formats[a.format] || 'Article';
  const dateLabel = a => a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-GB', {day:'numeric', month:'short', year:'numeric'}) : a.demo ? 'Educational sample' : a.status === 'review-pending' ? 'Review pending' : 'Undated post';
  const photo = (a, eager = false) => `<img src="${escapeText(a.image)}" alt="${escapeText(a.alt)}" width="1200" height="800" class="${a.imageFit === 'contain' ? 'fit-contain' : ''}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}>`;
  const metadata = a => `<span>${escapeText(a.author)}</span><span>${escapeText(dateLabel(a))} · ${a.readingTime} min read</span>`;
  const card = a => `<article class="story-card format-${a.format}"><a class="image-link" href="${articleURL(a)}">${photo(a)}<span class="format-badge">${formatLabel(a)}</span><span class="image-arrow" aria-hidden="true">↗</span></a><div class="card-copy"><a class="eyebrow" href="${categoryURL(a.category)}">${escapeText(a.category)}</a><h3><a href="${articleURL(a)}">${escapeText(a.title)}</a></h3><p>${escapeText(a.summary)}</p><div class="card-meta"><span>${escapeText(dateLabel(a))}</span><span>${a.readingTime} min read</span></div></div></article>`;
  window.BriefUI = {escapeText, articleURL, categoryURL, photo, metadata, card, formatLabel, dateLabel};
  const page = document.body.dataset.page;
  const navNames = ['Home', 'Economy', 'Business', 'Markets', 'Investing', 'Technology', 'Opinion'];
  document.querySelector('[data-header]').innerHTML = `<a class="skip-link" href="#main">Skip to content</a><div class="topbar"><div class="container"><span>Independent perspectives. A global outlook.</span><div><time id="today"></time><span class="edition-label">Global edition</span></div></div></div><header class="site-header"><div class="header-inner container"><a class="brand-lockup" href="index.html" aria-label="${BRIEF.name} home"><span class="brand-mark" aria-hidden="true">eb<span>.</span></span><span class="brand">THE ECONOMIC<br>BRIEF<span class="brand-dot">.</span></span></a><button class="menu-toggle" aria-expanded="false" aria-controls="primary-nav"><svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" fill="none" stroke="currentColor" stroke-width="1.5"/></svg><span>Menu</span></button><nav id="primary-nav" aria-label="Main navigation">${navNames.map(n => `<a href="${n === 'Home' ? 'index.html' : categoryURL(n)}" ${n === 'Home' && page === 'home' ? 'aria-current="page"' : ''}>${n}</a>`).join('')}</nav><div class="nav-actions"><a class="search-link" href="search.html" aria-label="Search posts"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></a><a class="button small" href="#newsletter">The Briefing <span aria-hidden="true">↗</span></a></div></div></header>`;
  document.getElementById('today').textContent = new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short', year:'numeric'}).format(new Date());
  const menu = document.querySelector('.menu-toggle');
  menu.addEventListener('click', () => { const open = menu.getAttribute('aria-expanded') !== 'true'; menu.setAttribute('aria-expanded', String(open)); document.getElementById('primary-nav').classList.toggle('is-open', open); });
  document.addEventListener('keydown', e => { if(e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {menu.click(); menu.focus();} });
  matchMedia('(min-width: 981px)').addEventListener('change', e => {if(e.matches){menu.setAttribute('aria-expanded', 'false');document.getElementById('primary-nav').classList.remove('is-open');}});
  document.querySelector('[data-footer]').innerHTML = `<section id="newsletter" class="newsletter"><div class="container newsletter-inner"><div><span class="eyebrow">A LITTLE PERSPECTIVE IN YOUR INBOX</span><h2>Make sense of what matters<span>.</span></h2><p>A thoughtful briefing on business, the economy, and the bigger picture.</p></div><form id="newsletter-form" novalidate><label for="newsletter-email">Your email address</label><div class="input-row"><input id="newsletter-email" name="email" type="email" autocomplete="email" placeholder="Enter your email address" required><button class="button" type="submit">Join the Briefing ↗</button></div><p class="form-note">Newsletter preview. No subscription is saved or email sent.</p><p id="newsletter-status" role="status"></p></form></div></section><footer class="footer container"><div class="footer-top"><div class="footer-brand"><a class="brand-lockup" href="index.html"><span class="brand-mark" aria-hidden="true">eb<span>.</span></span><span class="brand">THE ECONOMIC<br>BRIEF.</span></a><p>Visual stories. Useful facts. Independent perspectives on a changing world.</p></div><div><h3>Explore</h3>${categories.slice(0,4).map(categoryLink).join('')}</div><div><h3>More perspectives</h3>${categories.slice(4).map(categoryLink).join('')}</div><div><h3>The publication</h3><a href="about.html">About us</a><a href="contact.html">Contact</a><a href="editorial-policy.html">Editorial Policy</a><a href="privacy.html">Privacy Policy</a><a href="admin.html">Publishing desk ↗</a></div></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} ${BRIEF.name}</span><span>Independent thinking. Clearly explained.</span><a href="#main">Back to top ↑</a></div></footer>`;
  // Replace this seam with a real newsletter service before collecting subscriptions.
  window.subscribeToNewsletter = async email => ({saved:false, message:'Email format accepted. This is a demo: no subscription was saved or email sent.'});
  document.getElementById('newsletter-form').addEventListener('submit', async e => {
    e.preventDefault(); const input = document.getElementById('newsletter-email'), status = document.getElementById('newsletter-status');
    if(!input.validity.valid){ input.setAttribute('aria-invalid','true');status.textContent='Please enter a valid email address.';input.focus();return; }
    input.removeAttribute('aria-invalid');const button=e.target.querySelector('button');button.disabled=true;
    try{status.textContent=(await window.subscribeToNewsletter(input.value.trim())).message;}catch{status.textContent='Unable to connect. Please try again later.';}finally{button.disabled=false;}
  });
  if (page === 'home') {
    const lead = ARTICLES.find(a => a.featured) || ARTICLES[0];
    const heroPosts = [lead, ARTICLES.find(a=>a.format==='image' && a.id!==lead?.id), ARTICLES.find(a=>a.format==='fact')].filter(Boolean);
    document.getElementById('featured-posts').hidden = heroPosts.length === 0;
    document.getElementById('featured-posts').innerHTML = heroPosts.map((a,i) => `<article class="feature-tile ${i===0?'feature-lead':''} ${a.format==='fact'?'feature-fact':''}"><a class="feature-image" href="${articleURL(a)}">${photo(a,true)}<span class="sr-only">${escapeText(a.title)}</span></a><div class="feature-copy"><div class="feature-kicker"><span>${escapeText(a.category)}</span><span>${formatLabel(a)}</span></div><h2><a href="${articleURL(a)}">${escapeText(a.title)}</a></h2><div class="feature-meta"><span>${escapeText(dateLabel(a))} · ${a.readingTime} min read</span><a href="${articleURL(a)}" aria-label="Read ${escapeText(a.title)}">↗</a></div></div></article>`).join('');
    let selected='all', shown=6;
    const render = () => {
      const posts=[...ARTICLES].sort((a,b)=>(b.feedPriority||0)-(a.feedPriority||0)).filter(a=>selected==='all'||a.format===selected);
      document.getElementById('latest-grid').innerHTML=posts.slice(0,shown).map(card).join('') || '<p class="empty-state">No posts are published in this format yet. Check back soon or explore another format.</p>';
      document.getElementById('feed-count').textContent=`${posts.length} post${posts.length===1?'':'s'}`;
      document.getElementById('more-analysis').hidden=shown>=posts.length;
    };
    document.querySelectorAll('[data-format]').forEach(button=>button.addEventListener('click',()=>{selected=button.dataset.format;shown=6;document.querySelectorAll('[data-format]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render();}));
    document.getElementById('more-analysis').addEventListener('click',()=>{shown+=6;render();document.getElementById('latest-status').textContent=`Showing ${document.querySelectorAll('#latest-grid article').length} posts.`;});
    render();
    document.getElementById('topics').innerHTML=categories.map(n=>`<a href="${categoryURL(n)}">${n}<span aria-hidden="true">↗</span></a>`).join('');
    document.querySelector('.facts-section').hidden = !ARTICLES.some(a=>a.format==='fact');
    document.getElementById('facts-grid').innerHTML=ARTICLES.filter(a=>a.format==='fact').slice(0,3).map(a=>`<article class="fact-brief"><span class="eyebrow">${escapeText(a.category)} / QUICK FACT</span><h3><a href="${articleURL(a)}">${escapeText(a.title)}</a></h3><p>${escapeText(a.fact || a.summary)}</p><a class="text-link" href="${articleURL(a)}">See the full picture ↗</a></article>`).join('');
  }
  if (page === 'category') {
    const selected=new URLSearchParams(location.search).get('category') || 'Economy'; const valid=categories.includes(selected);
    const descriptions={Economy:'The ideas, policies, and people shaping our economic world.',Business:'A visual perspective on enterprise, ideas, and better decisions.',Markets:'Understand the context behind the numbers.',Investing:'Useful ideas for a more informed financial perspective.',Technology:'AI, innovation, and the changing way we do business.',Entrepreneurship:'Fresh perspectives on building something that matters.','Personal Finance':'Make room for clearer thinking about money.',Opinion:'Different perspectives. A broader understanding.'};
    document.getElementById('category-title').textContent=valid?selected:'Topic not found';document.getElementById('category-description').textContent=descriptions[selected]||'Choose a topic from the main menu to keep exploring.';document.title=`${valid?selected:'Topic not found'} | ${BRIEF.name}`;
    const list=ARTICLES.filter(a=>a.category===selected);let shown=6;
    if(list.length){const a=list[0];document.getElementById('category-featured').innerHTML=`<a class="category-feature-image" href="${articleURL(a)}">${photo(a,true)}</a><div><span class="eyebrow">FEATURED / ${formatLabel(a)}</span><h2><a href="${articleURL(a)}">${escapeText(a.title)}</a></h2><p>${escapeText(a.summary)}</p><div class="meta">${metadata(a)}</div><a class="text-link" href="${articleURL(a)}">View the post ↗</a></div>`;}
    const render=()=>{const query=document.getElementById('category-filter').value.trim().toLowerCase();const filtered=list.filter(a=>(a.title+' '+a.summary+' '+a.tags.join(' ')).toLowerCase().includes(query));document.getElementById('category-results').innerHTML=filtered.length?filtered.slice(0,shown).map(card).join(''):'<p class="empty-state">No posts match. Try another word.</p>';document.getElementById('category-count').textContent=`${filtered.length} posts`;document.getElementById('category-more').hidden=shown>=filtered.length;};
    document.getElementById('category-filter').addEventListener('input',()=>{shown=6;render();});document.getElementById('category-more').addEventListener('click',()=>{shown+=6;render();});render();
    document.querySelectorAll('#primary-nav a').forEach(a=>{if(a.textContent===selected)a.setAttribute('aria-current','page');});
  }
  if (page === 'search') {
    const params=new URLSearchParams(location.search), input=document.getElementById('search-query'), format=document.getElementById('search-format');input.value=params.get('q')||'';format.value=formats[params.get('format')]?params.get('format'):'all';
    const run=()=>{const words=input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);const found=ARTICLES.filter(a=>(format.value==='all'||a.format===format.value)&&words.every(w=>[a.title,a.summary,a.category,...a.tags].join(' ').toLowerCase().includes(w)));document.getElementById('search-count').textContent=`${found.length} post${found.length===1?'':'s'}${input.value.trim()?` matching “${input.value.trim()}”`:''}`;document.getElementById('search-results').innerHTML=found.length?found.map(card).join(''):'<div class="empty-state"><h2>No posts found</h2><p>Try a different format or a broader topic, such as economy or business.</p></div>';};
    const sync=()=>{const query=new URLSearchParams();if(input.value.trim())query.set('q',input.value.trim());if(format.value!=='all')query.set('format',format.value);try{history.replaceState(null,'','search.html'+(query.size?'?'+query:''));}catch{}};
    document.getElementById('search-form').addEventListener('submit',e=>{e.preventDefault();run();sync();});input.addEventListener('input',run);format.addEventListener('change',()=>{run();sync();});document.getElementById('clear-search').addEventListener('click',()=>{input.value='';format.value='all';run();sync();input.focus();});run();
  }
  if(page==='contact')document.getElementById('contact-form').addEventListener('submit',e=>{e.preventDefault();if(e.target.reportValidity())document.getElementById('contact-status').textContent='Your message is ready, but this demonstration has no delivery service. Nothing has been sent or saved.';});
  return true;
})();
