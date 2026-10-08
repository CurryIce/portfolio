import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { validateProjectSet, validateGroups, validateLanguageParity, validateMediaLayout, projectMedia } from './content-validation.mjs';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export async function checkSourceContent() {
  const order = await readJson('src/data/project-order.json');
  const projects = {}, groups = {};
  const publicRoot = resolve('public');
  const checked = new Set();
  const asset = path => {
    const fullPath = resolve(publicRoot, path);
    if (relative(publicRoot, fullPath).startsWith('..') || /[?#]/.test(path)) throw new Error(`Invalid media path: ${path}`);
    return fullPath;
  };
  for (const lang of ['en', 'zh']) {
    const dataRoot = `src/data/${lang === 'zh' ? 'zh/' : ''}`;
    groups[lang] = await readJson(`${dataRoot}work-groups.json`);
    const files = (await readdir(`${dataRoot}projects`)).filter(file => file.endsWith('.json'));
    projects[lang] = await Promise.all(files.map(async file => {
      const project = await readJson(`${dataRoot}projects/${file}`);
      if ('missing' in project) throw new Error(`${lang}/${file}: maintenance records belong outside public project data`);
      if (file !== `${project.slug}.json`) throw new Error(`${lang}: file ${file} does not match its slug`);
      return project;
    }));
    validateProjectSet(projects[lang], order, lang);
    validateGroups(projects[lang], groups[lang], lang);
    const profile = await readJson(`${dataRoot}profile.json`);
    for (const focus of profile.aboutFocus) for (const link of focus.links) {
      if (!projects[lang].some(project => project.slug === link.slug) || !link.label.trim()) throw new Error(`${lang}: invalid About link ${link.slug}`);
    }
    for (const project of projects[lang]) {
      validateMediaLayout(project, lang);
      for (const media of projectMedia(project)) {
        if (!media.alt?.trim()) throw new Error(`${lang}/${project.slug}: empty media alternative`);
        for (const field of ['label', 'caption', 'source']) if (media[field] !== undefined && !media[field].trim()) throw new Error(`${lang}/${project.slug}: empty media ${field}`);
        if (Boolean(media.srcSmall) !== Boolean(media.widthSmall && media.heightSmall)) throw new Error(`${project.slug}: a small image needs srcSmall, widthSmall, and heightSmall together`);
        for (const [path, width, height] of [[media.src, media.width, media.height], ...(media.srcSmall ? [[media.srcSmall, media.widthSmall, media.heightSmall]] : [])]) {
          if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error(`${path}: invalid image dimensions`);
          const metadata = await sharp(asset(path)).metadata();
          if (metadata.width !== width || metadata.height !== height) throw new Error(`${path}: declared ${width}x${height}, actual ${metadata.width}x${metadata.height}`);
          checked.add(path);
        }
        if (media.animation) await stat(asset(media.animation));
        if (media.originalSrc) {
          if (!media.originalCaption?.trim()) throw new Error(`${project.slug}: original image needs a caption`);
          await sharp(asset(media.originalSrc)).metadata();
        }
      }
    }
  }
  validateLanguageParity(projects.en, projects.zh, groups.en, groups.zh);
  console.log(`Verified content: project inventory, bilingual media, labels, and ${checked.size} image renditions with actual dimensions.`);
  return {projects, groups};
}
if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) await checkSourceContent();
