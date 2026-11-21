// Consensus images, shared by the New sample form, the detail page, the
// import page and the admin page.
//
// Images are lab data: only personnel and admin may see them. A Dropbox share
// link is public to anyone who has it, so the site never displays one.
// Every image is copied into the private `consensus-images` bucket (0009),
// and pages show it by downloading it with the viewer's own session, as a
// blob. No signed or shareable URL is ever created.
//
// The Dropbox link is still the lab's record that an image exists (no link,
// no image). It's kept in consensus_image.source_link, visible to members.

import { supabase } from './supabase.js';
import { checkCell, linkKey } from './import-rules.js';

export const BUCKET = 'consensus-images';
const MAX_BYTES = 50 * 1024 * 1024;  // the bucket's file_size_limit
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const isLink = (v) => /^[a-z][a-z0-9+.-]*:\/\//i.test(v ?? '');

// Check and tidy the two fields with the import's rules. Returns
// { link, folder } (null when blank), or { error }. A folder alone is ignored.
export function readImageFields(rawLink, rawFolder) {
  const link = checkCell('raw_image', rawLink);
  if (link.error) return { error: `Image link: ${link.error}` };
  if (!link.value) return { link: null, folder: null };
  const folder = checkCell('image_folder', rawFolder);
  if (folder.error) return { error: `Image folder: ${folder.error}` };
  return { link: link.value, folder: folder.value || null };
}

// The STSSN that already has this image, or null. Matches source_link, and
// raw_image for legacy rows that still hold a link; Dropbox links compare on
// the part before the "?", as import_samples() does.
export async function findLinkOwner(link) {
  const key = linkKey(link);
  const like = key === link ? link : `${key.replace(/[\\%_]/g, '\\$&')}%`;
  const op = key === link ? 'eq' : 'ilike';
  const [a, b] = await Promise.all([
    supabase.from('consensus_image').select('of_stssn, source_link')[op]('source_link', like),
    supabase.from('consensus_image').select('of_stssn, raw_image')[op]('raw_image', like),
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  const hit = [...a.data.map((r) => [r.of_stssn, r.source_link]), ...b.data.map((r) => [r.of_stssn, r.raw_image])]
    .find(([, l]) => linkKey(l) === key);
  return hit?.[0] ?? null;
}

// Dropbox's download host serves the file itself with CORS allowed; the
// www.dropbox.com link redirects first, and the redirect doesn't allow it.
function directUrl(link) {
  const u = new URL(link);
  if (/(^|\.)dropbox\.com$/i.test(u.hostname)) {
    u.hostname = 'dl.dropboxusercontent.com';
    for (const p of ['dl', 'raw', 'st']) u.searchParams.delete(p);
  }
  return u.toString();
}

const safe = (s) => String(s).replace(/[^\w.-]+/g, '_');

export function newPath(stssn, fileName) {
  return `${safe(stssn)}/${Date.now()}-${safe(fileName || 'image.jpg')}`;
}

export function fileNameOf(link) {
  try {
    return decodeURIComponent(new URL(link).pathname.split('/').pop()) || 'image.jpg';
  } catch {
    return 'image.jpg';
  }
}

// Quick check that a link still opens a file, without downloading it.
// Returns an error message or null.
export async function probeLink(link) {
  try {
    const res = await fetch(directUrl(link), { method: 'HEAD', referrerPolicy: 'no-referrer' });
    if (!res.ok) return `Dropbox answered ${res.status}: the link is dead or not shared.`;
    const size = Number(res.headers.get('content-length'));
    if (size > MAX_BYTES) return 'The file is over 50 MB.';
    return null;
  } catch {
    return 'Could not reach the link.';
  }
}

// Download the file behind a Dropbox link and store it at `path` in the
// bucket. Never overwrites. Returns an error message or null.
export async function copyLinkToBucket(link, path) {
  let blob;
  try {
    const res = await fetch(directUrl(link), { referrerPolicy: 'no-referrer' });
    if (!res.ok) return `Dropbox answered ${res.status}: the link is dead or not shared.`;
    blob = await res.blob();
  } catch {
    return 'Could not download the file from the link.';
  }
  const type = TYPES.includes(blob.type) ? blob.type : guessType(link);
  if (!type) return 'The link is not a JPEG, PNG or WebP image.';
  if (blob.size > MAX_BYTES) return 'The file is over 50 MB.';
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, blob, { upsert: false, contentType: type });
  if (!error) return null;
  if (/exists|duplicate/i.test(error.message)) return null;  // already copied
  return /row-level|policy|unauthorized/i.test(error.message)
    ? "You don't have permission to store images."
    : 'Could not store the image: ' + error.message;
}

// Dropbox sometimes serves images as application/octet-stream.
function guessType(link) {
  const ext = fileNameOf(link).split('.').pop().toLowerCase();
  return { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[ext] ?? null;
}

// Attach a Dropbox link to a sample: copy the file into the bucket, then save
// the row. Returns an error message, or null.
export async function addImageLink(stssn, link, folder) {
  let owner;
  try {
    owner = await findLinkOwner(link);
  } catch (e) {
    return 'Could not check the image link: ' + e.message;
  }
  if (owner === stssn) return 'This image link is already on this sample.';
  if (owner) return `This image link is already on sample ${owner}. Each turtle needs its own image.`;

  const path = newPath(stssn, fileNameOf(link));
  const problem = await copyLinkToBucket(link, path);
  if (problem) return problem;

  const { error } = await supabase.from('consensus_image')
    .insert({ image_folder: folder ?? '', raw_image: path, source_link: link, of_stssn: stssn })
    .select('image_id').single();
  if (!error) return null;
  // Personnel can't delete files, so the copy stays; name it for an admin.
  return (error.code === '42501' ? "You don't have permission to add images."
    : 'Could not save the image record: ' + error.message)
    + ` The file was stored at ${path}.`;
}

// A row whose file isn't in the bucket yet: a legacy row (raw_image is still
// the Dropbox link), or an import whose copy failed (raw_image is a path with
// no file). Copies it and points raw_image at the file. Returns an error or null.
export async function copyRowIntoBucket(row) {
  const link = row.source_link ?? (isLink(row.raw_image) ? row.raw_image : null);
  if (!link) return 'There is no Dropbox link to copy this image from.';
  const path = isLink(row.raw_image) ? newPath(row.of_stssn, fileNameOf(link)) : row.raw_image;
  const problem = await copyLinkToBucket(link, path);
  if (problem) return problem;
  if (path === row.raw_image && row.source_link) return null;
  const { error } = await supabase.from('consensus_image')
    .update({ raw_image: path, source_link: link })
    .eq('image_id', row.image_id)
    .select('image_id').single();
  if (!error) return null;
  return error.code === 'PGRST116' ? "You don't have permission to change images."
    : 'Could not update the image record: ' + error.message;
}

// Download a bucket file with the viewer's session and return an object URL
// (revoke it when done), or null if it isn't there or isn't allowed.
export async function objectUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return URL.createObjectURL(data);
}
