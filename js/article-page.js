 'use strict';
(async () => {
 if (!await window.briefReady) return;
 const ui=window.BriefUI;
 const params=new URLSearchParams(location.search);
 const slug=params.get('slug') || params.get('id') || 'economic-experts-2026';
 const article=ARTICLES.find(a=>a.slug===slug);
 const root=document.getElementById('article-root');
 if(!article){document.title='Article not found | '+BRIEF.name;root.innerHTML='<section class="page-heading"><span class="eyebrow">404 / ARTICLE</span><h1>We couldn’t find that article.</h1><p>Explore our latest analysis or search for another topic.</p><a class="button" href="search.html">Search the publication →</a></section>';return;}
 document.title=article.title+' | '+BRIEF.name;
 document.querySelector('meta[name="description"]').content=article.summary;
 document.querySelector('meta[property="og:title"]').content=article.title;
 document.querySelector('meta[property="og:description"]').content=article.summary;
 document.querySelector('meta[property="og:type"]').content='article';
 if(BRIEF.productionOrigin){const url=new URL(ui.articleURL(article),BRIEF.productionOrigin+'/').href;document.querySelector('link[rel="canonical"]').href=url;document.querySelector('meta[property="og:url"]').content=url;document.querySelector('meta[property="og:image"]').content=new URL(article.image,BRIEF.productionOrigin+'/').href;}
 // Drafts deliberately omit publication dates and structured data. Add true dates after editorial approval.
 if(!article.demo && article.status!=='review-pending' && article.date && BRIEF.productionOrigin){const data=document.createElement('script');data.type='application/ld+json';data.textContent=JSON.stringify({'@context':'https://schema.org','@type':'Article',headline:article.title,description:article.summary,datePublished:article.date,...(article.updatedDate?{dateModified:article.updatedDate}:{}),author:{'@type':'Organization',name:article.author},publisher:{'@type':'Organization',name:BRIEF.name},image:new URL(article.image,BRIEF.productionOrigin+'/').href,mainEntityOfPage:new URL(ui.articleURL(article),BRIEF.productionOrigin+'/').href});document.head.append(data);}
 const images = [{src:article.image, alt:article.alt, caption:article.imageCaption || 'Editorial image'}, ...(article.gallery || []).filter(image => image && typeof image.src === 'string' && typeof image.alt === 'string')];
 const figure = (image, index) => `<figure class="article-figure"><button class="image-open" type="button" data-image-index="${index}" aria-label="Enlarge image ${index+1}: ${ui.escapeText(image.alt)}"><img src="${ui.escapeText(image.src)}" alt="${ui.escapeText(image.alt)}" width="1200" height="800" ${index===0?'fetchpriority="high"':'loading="lazy"'}></button><figcaption><span>${ui.escapeText(image.caption || '')}</span><button class="plain-button" data-image-index="${index}" type="button">View full image ↗</button></figcaption></figure>`;
 root.innerHTML=`<nav class="breadcrumb" aria-label="Breadcrumb"><a href="index.html">Home</a><span>/</span><a href="${ui.categoryURL(article.category)}">${article.category}</a><span>/</span><span>${ui.formatLabel(article)}</span></nav><header class="article-heading"><a class="eyebrow" href="${ui.categoryURL(article.category)}">${article.category} / ${ui.formatLabel(article).toUpperCase()}</a><h1>${ui.escapeText(article.title)}</h1><p class="article-intro">${ui.escapeText(article.summary)}</p><div class="article-byline"><div class="meta">${ui.metadata(article)}${article.updatedDate?`<span>Updated ${ui.escapeText(article.updatedDate)}</span>`:''}</div><div class="article-actions"><button id="copy-link" class="plain-button">Copy link ↗</button><button id="share-article" class="plain-button">Share</button><button id="print-article" class="plain-button">Print</button></div></div><p id="share-status" role="status"></p></header><div class="${article.format==='article'?'':'post-gallery'}">${images.map(figure).join('')}</div><div class="article-layout ${article.format==='article'?'':'compact-post'}"><aside class="contents"><span class="eyebrow">IN THIS ARTICLE</span><nav id="table-of-contents" aria-label="Table of contents"></nav><p class="form-note">${article.readingTime} min read · ${ui.dateLabel(article)}</p></aside><div class="reading-column">${article.demo || article.status==='review-pending' ? `<p class="demo-note">${article.demo ? 'Editorial demonstration · Educational sample, not a news report.' : 'Editorial review pending · Time-sensitive claims require verification.'}</p>` : ''}${article.fact?`<aside class="post-takeaway"><span class="eyebrow">THE KEY TAKEAWAY</span><p>${ui.escapeText(article.fact)}</p></aside>`:''}<div id="article-body">${article.body}</div>${article.sources.length?`<section class="references"><h2>Sources & further reading</h2><ul>${article.sources.map(([label,url])=>`<li><a href="${ui.escapeText(url)}" target="_blank" rel="noopener noreferrer">${ui.escapeText(label)} ↗</a></li>`).join('')}</ul></section>`:''}<aside class="author-box"><div class="author-monogram" aria-hidden="true">EB</div><div><span class="eyebrow">ABOUT THE AUTHOR</span><h3>${ui.escapeText(article.author)}</h3><p>${ui.escapeText(article.authorNote || (article.demo ? 'Demonstration content prepared for this publication prototype. No professional credentials are claimed.' : 'Published by The Economic Brief.'))}</p><a class="text-link" href="editorial-policy.html">Our editorial standards ↗</a></div></aside></div></div><section class="related section-space"><div class="section-heading"><h2>Continue reading</h2><a class="text-link" href="${ui.categoryURL(article.category)}">More in ${article.category} ↗</a></div><div class="story-grid" id="related-articles"></div></section>`;
 // Native dialog supplies keyboard focus containment and Escape-to-close behavior.
 const dialog = document.createElement('dialog');
 dialog.className = 'image-dialog';
 dialog.setAttribute('aria-label', 'Full image viewer');
 dialog.innerHTML = `<div class="viewer-toolbar"><p>THE ECONOMIC BRIEF / FULL IMAGE</p><button type="button" class="plain-button" data-close-viewer>Close ×</button></div><img class="viewer-image" alt=""><p class="viewer-caption"></p><div class="viewer-controls"><button type="button" class="outline-button" data-previous>← Previous</button><span role="status" data-viewer-count></span><button type="button" class="outline-button" data-next>Next →</button><a class="text-link" data-original target="_blank" rel="noopener">Open original ↗</a></div>`;
 document.body.append(dialog);
 let imageIndex = 0, opener = null, previousOverflow = '';
 const renderImage = () => {
  const current = images[imageIndex];
  const img = dialog.querySelector('.viewer-image'); img.src = current.src; img.alt = current.alt;
  dialog.querySelector('.viewer-caption').textContent = current.caption || current.alt;
  dialog.querySelector('[data-viewer-count]').textContent = `${imageIndex+1} / ${images.length}`;
  dialog.querySelector('[data-original]').href = current.src;
  const previous = dialog.querySelector('[data-previous]'), next = dialog.querySelector('[data-next]');
  previous.hidden = next.hidden = images.length < 2;
  previous.disabled = imageIndex === 0; next.disabled = imageIndex === images.length-1;
 };
 root.querySelectorAll('[data-image-index]').forEach(button => button.addEventListener('click', () => {
  imageIndex = Number(button.dataset.imageIndex); renderImage(); opener = button;
  if (typeof dialog.showModal !== 'function') {window.open(images[imageIndex].src, '_blank', 'noopener'); return;}
  previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog.showModal();
 }));
 dialog.querySelector('[data-close-viewer]').addEventListener('click', () => dialog.close());
 dialog.addEventListener('click', e => {if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
 dialog.addEventListener('close', () => {document.body.style.overflow=previousOverflow;if(opener)opener.focus();});
 dialog.querySelector('[data-previous]').addEventListener('click', () => {if(imageIndex>0){imageIndex--;renderImage();}});
 dialog.querySelector('[data-next]').addEventListener('click', () => {if(imageIndex<images.length-1){imageIndex++;renderImage();}});
 dialog.addEventListener('keydown', e => {if(e.key==='ArrowRight'&&imageIndex<images.length-1){imageIndex++;renderImage();e.preventDefault();}if(e.key==='ArrowLeft'&&imageIndex>0){imageIndex--;renderImage();e.preventDefault();}});
 const body=document.getElementById('article-body');
 const headings=[...body.querySelectorAll('h2')];
 if(!headings.length || article.format!=='article') document.querySelector('.contents').hidden=true;
 headings.forEach((h,i)=>h.id='section-'+(i+1));
 document.getElementById('table-of-contents').innerHTML=headings.map(h=>`<a href="#${h.id}">${ui.escapeText(h.textContent)}</a>`).join('');
 if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){document.querySelectorAll('#table-of-contents a').forEach(a=>{if(a.hash==='#'+entry.target.id)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});}},{rootMargin:'-10% 0px -65% 0px'});headings.forEach(h=>observer.observe(h));}
 const sorted=ARTICLES.filter(a=>a.id!==article.id).sort((a,b)=>Number(b.category===article.category)-Number(a.category===article.category));document.getElementById('related-articles').innerHTML=sorted.slice(0,3).map(a=>ui.card(a)).join('');
 const feedback=document.getElementById('share-status');
 async function copyLink(){try{if(navigator.clipboard && window.isSecureContext)await navigator.clipboard.writeText(location.href);else{const input=document.createElement('textarea');input.value=location.href;input.className='clipboard-helper';document.body.append(input);input.select();const copied=document.execCommand('copy');input.remove();if(!copied)throw Error('copy unavailable');}feedback.textContent='Article link copied.';}catch{feedback.textContent='Automatic copying is unavailable. Copy the address from your browser’s address bar.';}}
 document.getElementById('copy-link').addEventListener('click',copyLink);
 document.getElementById('share-article').addEventListener('click',async()=>{if(!navigator.share || location.protocol==='file:'){await copyLink();return;}try{await navigator.share({title:article.title,text:article.summary,url:location.href});feedback.textContent='Share dialog opened.';}catch(e){if(e.name!=='AbortError')await copyLink();}});
 document.getElementById('print-article').addEventListener('click',()=>window.print());
 let scheduled=false;
 const updateProgress=()=>{scheduled=false;const start=body.getBoundingClientRect().top+window.scrollY;const distance=body.offsetHeight-window.innerHeight*0.35;const percent=Math.max(0,Math.min(100,(window.scrollY-start+window.innerHeight*0.25)/Math.max(1,distance)*100));document.getElementById('reading-progress').style.width=percent+'%';};
 const queueProgress=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(updateProgress);}};window.addEventListener('scroll',queueProgress,{passive:true});window.addEventListener('resize',queueProgress);updateProgress();
})();
