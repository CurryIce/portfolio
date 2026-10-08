/** @typedef {import('../src/lib/content').Project} Project */
/** @typedef {import('../src/lib/content').WorkGroup} WorkGroup */

/** @param {Project[]} projects @param {string[]} order @param {string} language */
export function validateProjectSet(projects, order, language) {
  const slugs = projects.map(project => project.slug);
  if (new Set(slugs).size !== slugs.length) throw new Error(`${language}: duplicate project slug`);
  if (new Set(order).size !== order.length) throw new Error('Duplicate slug in project-order.json');
  for (const slug of new Set([...order, ...slugs])) {
    if (!slugs.includes(slug)) throw new Error(`${language}: missing project ${slug}`);
    if (!order.includes(slug)) throw new Error(`${language}: project ${slug} is not listed in project-order.json`);
  }
}

/** @param {Project[]} projects @param {WorkGroup[]} groups @param {string} language */
export function validateGroups(projects, groups, language) {
  const ids = groups.map(group => group.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${language}: duplicate work group id`);
  const linked = groups.flatMap(group => group.cases.map(item => item.slug));
  const slugs = projects.map(project => project.slug);
  for (const slug of new Set([...linked, ...slugs])) {
    if (!slugs.includes(slug) || linked.filter(item => item === slug).length !== 1) {
      throw new Error(`${language}: case ${slug} must exist and belong to exactly one project`);
    }
  }
  for (const group of groups) {
    if (!group.cases.length || !group.title.trim()) throw new Error(`${language}: empty work group ${group.id}`);
    for (const item of group.cases) if (!item.label.trim()) throw new Error(`${language}: empty case label ${item.slug}`);
  }
}

/** Collect all displayed media in their logical page order.
 * @param {Project} project
 */
export function projectMedia(project) {
  return [project.homeCover, project.cover, ...project.sections.flatMap(section => [
    ...(section.media || []), ...(section.mediaGroups || []).flatMap(group => group.media),
  ])].filter(/** @returns {media is import('../src/lib/content').Media} */ media => Boolean(media));
}

/** Encounter studies name their media roles explicitly, independent of order.
 * @param {Project} project @param {string} language
 */
export function validateMediaLayout(project, language) {
  for (const section of project.sections) for (const group of section.mediaGroups || []) {
    if (group.gallery !== 'encounter') continue;
    const context = `${language}/${project.slug}/${group.id || section.id}`;
    for (const media of group.media) {
      if (!['sketch', 'shipped'].includes(media.stage || '')) throw new Error(`${context}: media needs a sketch or shipped stage`);
      if (media.layout !== undefined && (media.layout !== 'tall' || media.stage !== 'sketch')) throw new Error(`${context}: tall layout belongs to a sketch`);
      if (media.anchor !== undefined && !/^[a-z][a-z0-9-]*$/.test(media.anchor)) throw new Error(`${context}: invalid media anchor`);
    }
    if (!group.media.some(media => media.stage === 'sketch') || !group.media.some(media => media.stage === 'shipped')) throw new Error(`${context}: an encounter study needs sketches and shipped media`);
  }
}

/** @param {Project[]} english @param {Project[]} chinese @param {WorkGroup[]} enGroups @param {WorkGroup[]} zhGroups */
export function validateLanguageParity(english, chinese, enGroups, zhGroups) {
  const groupShape = /** @param {WorkGroup[]} groups */ groups => groups.map(group => [group.id, group.cases.map(item => item.slug)]);
  if (JSON.stringify(groupShape(enGroups)) !== JSON.stringify(groupShape(zhGroups))) throw new Error('Project grouping differs between languages');
  const sectionShape = /** @param {Project} project */ project => project.sections.map(section => [section.id, section.gallery || null, (section.media || []).length, (section.mediaGroups || []).map(group => [group.id || null, group.gallery || null, group.media.length])]);
  const structure = /** @param {import('../src/lib/content').Media} media */ media => [media.src, media.srcSmall || null, media.width, media.height, media.widthSmall || null, media.heightSmall || null, media.animation || null, Boolean(media.autoplay), media.sourceHref || null, media.originalSrc || null, media.stage || null, media.layout || null, media.anchor || null];
  for (const project of english) {
    const other = chinese.find(item => item.slug === project.slug);
    if (!other || JSON.stringify(sectionShape(project)) !== JSON.stringify(sectionShape(other))) throw new Error(`${project.slug}: sections or media groups differ between languages`);
    if (Boolean(project.cover) !== Boolean(other.cover) || Boolean(project.homeCover) !== Boolean(other.homeCover)) throw new Error(`${project.slug}: cover differs between languages`);
    const enMedia = projectMedia(project), zhMedia = projectMedia(other);
    if (JSON.stringify(enMedia.map(structure)) !== JSON.stringify(zhMedia.map(structure))) throw new Error(`${project.slug}: image paths, dimensions, or playback differ between languages`);
    for (const [i, media] of enMedia.entries()) {
      const counterpart = zhMedia[i];
      for (const field of /** @type {const} */ (['alt', 'label', 'caption', 'source', 'originalCaption'])) {
        if (Boolean(media[field]) !== Boolean(counterpart[field])) throw new Error(`${project.slug}: media ${i} ${field} missing in one language`);
      }
    }
  }
}
