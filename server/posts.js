import { HttpError } from './http-error.js';
import sanitizeHtml from 'sanitize-html';
export const CATEGORIES = [
  'Economy',
  'Business',
  'Markets',
  'Investing',
  'Technology',
  'Entrepreneurship',
  'Personal Finance',
  'Opinion',
];
function text(value, name, max = 200, required = false) {
  if (typeof value !== 'string' || value.length > max)
    throw new HttpError(400, `${name} must be text, up to ${max} characters.`);
  const result = value.trim();
  if (required && !result) throw new HttpError(400, `${name} is required.`);
  return result;
}
export function imagePath(value) {
  const result = text(value, 'Image path', 250, true);
  if (!/^(?:assets\/images|uploads)\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|webp|svg)$/i.test(result))
    throw new HttpError(400, 'Choose an uploaded image or an image in assets/images.');
  return result;
}
function date(value, name) {
  if (!value) return null;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new HttpError(400, `${name} must be a valid date.`);
  return value;
}
export function validatePost(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new HttpError(400, 'Provide a post object.');
  const title = text(input.title, 'Headline', 200, true);
  const slug = text(input.slug, 'Slug', 160, true);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
    throw new HttpError(400, 'Use lowercase letters, numbers, and hyphens for the slug.');
  if (!CATEGORIES.includes(input.category)) throw new HttpError(400, 'Choose a valid category.');
  if (!['image', 'fact', 'article'].includes(input.format))
    throw new HttpError(400, 'Choose a valid post format.');
  if (!['draft', 'published'].includes(input.visibility))
    throw new HttpError(400, 'Choose draft or published.');
  let rawBody = text(input.body ?? '', 'Body', 150000);
  if (rawBody && !/<[a-z][\s\S]*>/i.test(rawBody))
    rawBody = rawBody
      .split(/\n\s*\n/)
      .map(
        (p) =>
          '<p>' +
          p
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>') +
          '</p>',
      )
      .join('');
  const body = sanitizeHtml(rawBody, {
    allowedTags: [
      'h2',
      'h3',
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'figure',
      'figcaption',
      'img',
      'table',
      'caption',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'div',
    ],
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'width', 'height', 'loading'],
      th: ['scope', 'colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      div: ['class'],
    },
    allowedClasses: { div: ['table-wrap'] },
    allowedSchemes: ['https', 'http'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === 'img' &&
      !/^(assets\/images|uploads)\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|svg)$/i.test(
        frame.attribs.src || '',
      ),
  });
  if (
    !Array.isArray(input.tags) ||
    input.tags.length > 20 ||
    !input.tags.every((t) => typeof t === 'string' && t.length <= 60)
  )
    throw new HttpError(400, 'Use up to 20 short tags.');
  if (!Array.isArray(input.sources) || input.sources.length > 30)
    throw new HttpError(400, 'Use up to 30 source references.');
  const sources = input.sources.map((source) => {
    if (!Array.isArray(source) || source.length !== 2)
      throw new HttpError(400, 'Each source needs a label and URL.');
    const label = text(source[0], 'Source label', 200, true),
      url = text(source[1], 'Source URL', 2000, true);
    try {
      if (!['https:', 'http:'].includes(new URL(url).protocol)) throw new Error();
    } catch {
      throw new HttpError(400, 'Source URLs must start with https:// or http://.');
    }
    return [label, url];
  });
  const gallery = input.gallery ?? [];
  if (!Array.isArray(gallery) || gallery.length > 12)
    throw new HttpError(400, 'Use up to 12 additional gallery images.');
  const feedPriority = Number(input.feedPriority || 0);
  if (!Number.isInteger(feedPriority) || Math.abs(feedPriority) > 10000)
    throw new HttpError(400, 'Feed priority must be a whole number between -10000 and 10000.');
  return {
    title,
    slug,
    category: input.category,
    format: input.format,
    visibility: input.visibility,
    summary: text(input.summary ?? '', 'Summary', 700, true),
    author: text(input.author, 'Author', 150, true),
    image: imagePath(input.image),
    alt: text(input.alt, 'Image description', 700, true),
    imageCaption: text(input.imageCaption ?? '', 'Image credit/caption', 700),
    imageFit: input.imageFit === 'contain' ? 'contain' : 'cover',
    body,
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    sources,
    gallery: gallery.map((g) => ({
      src: imagePath(g?.src),
      alt: text(g?.alt, 'Gallery image description', 700, true),
      caption: text(g?.caption ?? '', 'Gallery caption', 700),
    })),
    fact: text(input.fact ?? '', 'Key takeaway', 1500),
    authorNote: text(input.authorNote ?? '', 'Author note', 1500),
    date: date(input.date, 'Publication date'),
    updatedDate: date(input.updatedDate, 'Update date'),
    demo: input.demo === true,
    status: input.status === 'review-pending' ? 'review-pending' : 'ready',
    featured: input.featured === true,
    feedPriority,
    readingTime: Math.max(
      1,
      Math.ceil(
        sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} }).split(/\s+/).filter(Boolean)
          .length / 200,
      ),
    ),
  };
}
export const withoutMongoId = ({ _id, ...post }) => post;
export function publicPost(post) {
  const { visibility, revision, createdAt, modifiedAt, ...result } = withoutMongoId(post);
  return result;
}
