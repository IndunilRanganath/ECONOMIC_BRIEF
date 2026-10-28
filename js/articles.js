/* Live server: MongoDB API. Static HTTP preview: JSON. Local files: generated snapshot. */
'use strict';
window.articlesReady = (async () => {
 let articles;
 if (location.protocol === 'file:') {
  await new Promise((resolve, reject) => {
   const script = document.createElement('script');
   script.src = 'js/articles-local.js';
   script.onload = resolve;
   script.onerror = () => reject(new Error('The local article snapshot could not be loaded.'));
   document.head.append(script);
  });
  articles = window.ARTICLES_LOCAL;
  delete window.ARTICLES_LOCAL;
 } else {
  let response = await fetch('/api/posts');
  // A plain static preview has no API. Only a missing endpoint uses the JSON snapshot.
  if (response.status === 404) response = await fetch('data/articles.json');
  if (!response.ok) throw new Error('Article data request failed: ' + response.status);
  articles = await response.json();
 }
 if (!Array.isArray(articles) || !articles.every(article =>
  ['id','slug','title','summary','category','author','image','alt','body'].every(key => typeof article[key] === 'string') &&
  Array.isArray(article.tags) && Array.isArray(article.sources) &&
  (article.gallery === undefined || (Array.isArray(article.gallery) && article.gallery.every(image => image && typeof image.src === 'string' && typeof image.alt === 'string')))
 )) throw new Error('Invalid article data.');
 window.ARTICLES = articles;
 return articles;
})();
