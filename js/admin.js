/* Admin credentials and session tokens are never stored in localStorage. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  let posts = [], current = null, csrf = '', dirty = false, slugEdited = false, pendingUploads = 0, generation = 0, deleteTarget = null;
  const names = ['title','slug','summary','body','fact','image','alt','imageCaption','imageFit','format','category','status','feedPriority','author','date','updatedDate','authorNote','tags'];
  const input = name => $(name === 'visibility' ? 'post-visibility-input' : 'post-' + name);
  function feedback(id, message, error = false) {const el = $(id);el.textContent = message;el.classList.toggle('is-error', error);}
  function showLogin(message = '') { $('login-view').hidden=false;$('workspace').hidden=true;feedback('login-status',message,Boolean(message)); }
  async function api(url, options = {}) {
    const headers = new Headers(options.headers);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type','application/json');
    if (options.method && options.method !== 'GET' && csrf) headers.set('X-CSRF-Token', csrf);
    let response;
    try {response = await fetch(url, { ...options, headers, credentials:'same-origin' });}
    catch {throw new Error('Could not reach the server. Start it with npm start, then open the admin panel at http://localhost:3000/admin.html.');}
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Open the admin panel through the running Node server at http://localhost:3000/admin.html.');
    const result = await response.json();
    if (!response.ok) {
      if (response.status===401 && url!=='/api/admin/login' && url!=='/api/admin/session') showLogin('Your session expired. Sign in again to continue.');
      const error = new Error(result.error || 'The request could not be completed.');error.status=response.status;throw error;
    }
    return result;
  }
  function canLeave() {
    if(pendingUploads){feedback('editor-status','Please wait for image uploads to finish.');return false;}
    return !dirty || window.confirm('Discard your unsaved changes?');
  }
  function setSaveState() { $('save-post').disabled = pendingUploads>0; }
  function renderList() {
    $('stat-all').textContent=posts.length;
    $('stat-published').textContent=posts.filter(p=>p.visibility==='published').length;
    $('stat-drafts').textContent=posts.filter(p=>p.visibility==='draft').length;
    const query=$('post-search').value.trim().toLowerCase(), state=$('post-visibility').value;
    const filtered=posts.filter(p=>(state==='all'||p.visibility===state)&&[p.title,p.category,p.format,p.slug].join(' ').toLowerCase().includes(query));
    $('post-rows').replaceChildren();
    for(const post of filtered) {
      const row=document.createElement('tr');
      // Static markup only; all post data is assigned through DOM properties.
      row.innerHTML='<td><div class="admin-post-cell"><img alt=""><div><h2><button type="button" data-edit></button></h2><p></p></div></div></td><td class="admin-topic"><strong></strong><span></span></td><td><span class="status-pill"></span></td><td><div class="row-actions"><button type="button" class="plain-button" data-edit>Edit</button><button type="button" class="plain-button row-delete" data-delete>Remove</button></div></td>';
      row.querySelector('img').src=post.image;row.querySelector('img').alt=post.alt;
      row.querySelector('h2 button').textContent=post.title;
      row.querySelector('.admin-post-cell p').textContent=post.date || (post.demo?'Educational sample':'No publication date');
      row.querySelector('.admin-topic strong').textContent=post.category;
      row.querySelector('.admin-topic span').textContent=({image:'Image story',fact:'Quick fact',article:'Article'})[post.format]||'Article';
      const badge=row.querySelector('.status-pill');badge.textContent=post.visibility==='published'?'Published':'Draft';badge.classList.toggle('is-draft',post.visibility!=='published');
      row.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openEditor(post)));
      row.querySelector('[data-delete]').setAttribute('aria-label','Remove '+post.title);
      row.querySelector('[data-delete]').addEventListener('click',()=>{deleteTarget=post;$('delete-post-title').textContent=post.title;feedback('delete-status','');$('delete-dialog').showModal();$('cancel-delete').focus();});
      $('post-rows').append(row);
    }
    $('posts-empty').hidden=filtered.length>0;
    $('posts-empty').textContent=posts.length?'No posts match these filters. Try another headline or status.':'No posts here yet. Create your first story.';
    $('posts-count').textContent=`${filtered.length} of ${posts.length} posts`;
  }
  async function loadPosts() {posts=await api('/api/admin/posts');renderList();}
  async function loadMedia() {
    const images=await api('/api/admin/media');$('media-library').replaceChildren();
    for(const src of images){const option=document.createElement('option');option.value=src;$('media-library').append(option);}
  }
  function updatePreview() {
    const src=input('image').value;
    const valid=/^(assets\/images|uploads)\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg)$/i.test(src);
    for(const id of ['image-preview','card-preview-image']){ $(id).hidden=!valid;if(valid)$(id).src=src;else $(id).removeAttribute('src'); }
    $('image-placeholder').hidden=valid;
    $('card-preview-title').textContent=input('title').value||'Your headline appears here.';
    $('card-preview-summary').textContent=input('summary').value||'A short introduction helps readers understand the story.';
    $('card-preview-topic').textContent=input('category').value;
  }
  async function upload(file, target, statusId) {
    if(!file)return;
    if(file.size>8*1024*1024){feedback(statusId,'Images must be 8 MB or smaller.',true);return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){feedback(statusId,'Choose a JPEG, PNG, or WebP image.',true);return;}
    const started=generation;pendingUploads++;setSaveState();feedback(statusId,'Uploading image…');
    try {const form=new FormData();form.append('image',file);const result=await api('/api/admin/uploads',{method:'POST',body:form});if(started===generation){target.value=result.src;dirty=true;updatePreview();feedback(statusId,'Image uploaded. Save the post to attach it.');await loadMedia();}}
    catch(error){if(started===generation)feedback(statusId,error.message,true);}
    finally{pendingUploads--;setSaveState();}
  }
  function addGallery(image = {}) {
    if($('gallery-fields').children.length>=12){feedback('editor-status','A post can have up to 12 additional images.',true);return;}
    const row=document.createElement('div');row.className='repeat-field';
    row.innerHTML='<div class="repeat-header"><span>Gallery image</span><button type="button">Remove</button></div><label>Image file<input type="file" class="gallery-upload" accept="image/jpeg,image/png,image/webp"></label><label>Image path<input data-field="src" list="media-library" required maxlength="250"></label><label>Image description<input data-field="alt" required maxlength="700"></label><label>Credit / caption<input data-field="caption" maxlength="700"></label><p class="admin-status" role="status"></p>';
    for(const name of ['src','alt','caption'])row.querySelector(`[data-field="${name}"]`).value=image[name]||'';
    const status=row.querySelector('[role=status]');status.id='gallery-upload-'+crypto.randomUUID();
    row.querySelector('input[type=file]').addEventListener('change',e=>upload(e.target.files[0],row.querySelector('[data-field=src]'),status.id));
    row.querySelector('button').addEventListener('click',()=>{if(pendingUploads)return;row.remove();dirty=true;});
    $('gallery-fields').append(row);
  }
  function addSource(source = []) {
    if($('source-fields').children.length>=30){feedback('editor-status','A post can have up to 30 sources.',true);return;}
    const row=document.createElement('div');row.className='repeat-field';
    row.innerHTML='<div class="repeat-header"><span>Source reference</span><button type="button">Remove</button></div><label>Source title<input data-field="label" required maxlength="200"></label><label>Source URL<input data-field="url" type="url" required maxlength="2000" placeholder="https://"></label>';
    row.querySelector('[data-field=label]').value=source[0]||'';row.querySelector('[data-field=url]').value=source[1]||'';
    row.querySelector('button').addEventListener('click',()=>{row.remove();dirty=true;});$('source-fields').append(row);
  }
  function openEditor(post = null) {
    if(!canLeave())return;
    generation++;current=post?structuredClone(post):null;slugEdited=Boolean(post);$('post-form').reset();
    $('source-fields').replaceChildren();$('gallery-fields').replaceChildren();
    const values=post||{format:'image',category:'Economy',imageFit:'contain',status:'ready',feedPriority:0,author:'The Economic Brief editorial desk'};
    for(const name of names)input(name).value=name==='tags'?(values.tags||[]).join(', '):(values[name]??({status:'ready',format:'article',imageFit:'contain',feedPriority:0}[name]??''));
    input('visibility').value=values.visibility||'draft';$('post-demo').checked=Boolean(values.demo);$('post-featured').checked=Boolean(values.featured);
    for(const image of values.gallery||[])addGallery(image);for(const source of values.sources||[])addSource(source);
    $('editor-title').textContent=post?'Edit post.':'Create a post.';
    $('save-post').textContent=post?'Save changes ↗':'Save post ↗';
    $('view-post').hidden=!post||post.visibility!=='published';if(post)$('view-post').href='article.html?slug='+encodeURIComponent(post.slug);
    $('posts-view').hidden=true;$('editor-view').hidden=false;$('show-posts').removeAttribute('aria-current');$('sidebar-new').setAttribute('aria-current','page');
    feedback('editor-status','');feedback('upload-status','');feedback('workspace-status','');dirty=false;updatePreview();window.scrollTo(0,0);input('title').focus();
  }
  function showPosts() {
    if(!canLeave())return;
    generation++;dirty=false;current=null;$('posts-view').hidden=false;$('editor-view').hidden=true;$('show-posts').setAttribute('aria-current','page');$('sidebar-new').removeAttribute('aria-current');window.scrollTo(0,0);
  }
  async function enterWorkspace(session) {
    csrf=session.csrf;$('account-email').textContent=session.email;$('login-view').hidden=true;$('workspace').hidden=false;
    try {await Promise.all([loadPosts(),loadMedia()]);}catch(error){feedback('workspace-status',error.message,true);}
  }
  $('login-form').addEventListener('submit',async e=>{
    e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;feedback('login-status','Signing in…');
    try{const session=await api('/api/admin/login',{method:'POST',body:JSON.stringify({email:$('login-email').value,password:$('login-password').value})});feedback('login-status','');await enterWorkspace(session);}
    catch(error){feedback('login-status',error.message,true);}finally{$('login-password').value='';button.disabled=false;}
  });
  $('logout').addEventListener('click',async()=>{if(!canLeave())return;try{await api('/api/admin/logout',{method:'POST',body:'{}'});csrf='';dirty=false;showPosts();showLogin();}catch(error){feedback('workspace-status',error.message,true);}});
  for(const id of ['sidebar-new','new-post'])$(id).addEventListener('click',()=>openEditor());
  for(const id of ['show-posts','cancel-edit'])$(id).addEventListener('click',showPosts);
  $('refresh-posts').addEventListener('click',async()=>{try{await loadPosts();feedback('workspace-status','Post list refreshed.');}catch(error){feedback('workspace-status',error.message,true);}});
  $('post-search').addEventListener('input',renderList);$('post-visibility').addEventListener('change',renderList);
  $('post-form').addEventListener('input',()=>{dirty=true;updatePreview();});$('post-form').addEventListener('change',()=>{dirty=true;updatePreview();});
  input('title').addEventListener('input',()=>{if(!slugEdited)input('slug').value=input('title').value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,160).replace(/-$/,'');});
  input('slug').addEventListener('input',()=>{slugEdited=true;});
  $('main-upload').addEventListener('change',e=>upload(e.target.files[0],input('image'),'upload-status'));
  $('add-gallery').addEventListener('click',()=>{addGallery();dirty=true;});$('add-source').addEventListener('click',()=>{addSource();dirty=true;});
  $('post-form').addEventListener('submit',async e=>{
    e.preventDefault();if(pendingUploads)return;const button=$('save-post');button.disabled=true;feedback('editor-status','Saving your post…');
    const post={};for(const name of names)post[name]=input(name).value;
    post.tags=post.tags.split(',').map(t=>t.trim()).filter(Boolean);post.feedPriority=Number(post.feedPriority);post.visibility=input('visibility').value;post.demo=$('post-demo').checked;post.featured=$('post-featured').checked;
    post.gallery=[...$('gallery-fields').children].map(row=>Object.fromEntries(['src','alt','caption'].map(n=>[n,row.querySelector(`[data-field="${n}"]`).value])));
    post.sources=[...$('source-fields').children].map(row=>[row.querySelector('[data-field=label]').value,row.querySelector('[data-field=url]').value]);
    if(current)post.revision=current.revision;
    try{
      const saved=await api(current?'/api/admin/posts/'+encodeURIComponent(current.id):'/api/admin/posts',{method:current?'PUT':'POST',body:JSON.stringify(post)});
      current=saved;slugEdited=true;dirty=false;input('body').value=saved.body;$('editor-title').textContent='Edit post.';$('save-post').textContent='Save changes ↗';
      $('view-post').hidden=saved.visibility!=='published';$('view-post').href='article.html?slug='+encodeURIComponent(saved.slug);
      feedback('editor-status',saved.visibility==='published'?'Saved and published. The post is visible on your website.':'Draft saved. It is only visible in the admin panel.');
      await loadPosts();
    }catch(error){feedback('editor-status',error.message,true);$('editor-status').scrollIntoView({block:'nearest'});}
    finally{button.disabled=false;}
  });
  $('cancel-delete').addEventListener('click',()=>$('delete-dialog').close());
  $('confirm-delete').addEventListener('click',async()=>{if(!deleteTarget)return;const button=$('confirm-delete');button.disabled=true;try{await api('/api/admin/posts/'+encodeURIComponent(deleteTarget.id),{method:'DELETE',body:JSON.stringify({revision:deleteTarget.revision})});$('delete-dialog').close();feedback('workspace-status','Post removed.');await loadPosts();}catch(error){feedback('delete-status',error.message,true);}finally{button.disabled=false;}});
  window.addEventListener('beforeunload',e=>{if(dirty||pendingUploads){e.preventDefault();e.returnValue='';}});
  (async()=>{if(location.protocol==='file:'){showLogin('The admin panel requires the running server. Run npm start, then open http://localhost:3000/admin.html.');return;}try{await enterWorkspace(await api('/api/admin/session'));}catch(error){showLogin(error.status===401?'':error.message);}})();
})();
