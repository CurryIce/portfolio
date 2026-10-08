import profileData from '../data/profile.json';
import zhProfileData from '../data/zh/profile.json';
import workGroups from '../data/work-groups.json';
import zhWorkGroups from '../data/zh/work-groups.json';
import order from '../data/project-order.json';
import { validateProjectSet, validateGroups, validateLanguageParity, validateMediaLayout } from '../../scripts/content-validation.mjs';
import type { Lang } from './i18n';

export const url = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
export const pageUrl = (path = '', lang: Lang = 'zh') => url(`${lang === 'en' ? 'en/' : ''}${path.replace(/^\//, '')}`);
export type Media = {
  src: string; alt: string; width: number; height: number;
  srcSmall?: string; widthSmall?: number; heightSmall?: number;
  label?: string; caption?: string; source?: string; sourceHref?: string; animation?: string; autoplay?: boolean;
  originalSrc?: string; originalCaption?: string;
  stage?: 'sketch' | 'shipped'; layout?: 'tall'; anchor?: string;
};
export type WorkGroup = {
  id: string; title: string; subtitle?: string; category: string; summary: string;
  cases: {slug: string; label: string; preview?: string}[];
};
export type Section = {
  id: string; title: string; intro?: string; paragraphs?: string[];
  media?: Media[]; gallery?: string; note?: string; steps?: string[];
  mediaGroups?: {id?: string; title: string; intro?: string; gallery?: string; media: Media[]}[];
  points?: {title: string; text: string}[];
  placeholder?: {title: string; text: string};
};
export type Project = {
  slug: string; title: string; subtitle: string; category: string; tags: string[];
  summary: string; description: string; role: string; company: string;
  period: string; status: string; cover: Media | null; homeCover?: Media; repositoryUrl?: string;
  ownership: string[]; evidence: string;
  sections: Section[]; outcomes: string[]; limitations: string[];
};
const files = import.meta.glob<{default: Project}>('../data/projects/*.json', {eager: true});
const zhFiles = import.meta.glob<{default: Project}>('../data/zh/projects/*.json', {eager: true});
const readProjects = (modules: Record<string, {default: Project}>, language: Lang) => {
  const projects = Object.values(modules).map(module => module.default);
  validateProjectSet(projects, order, language);
  for (const project of projects) validateMediaLayout(project, language);
  return order.map(slug => projects.find(project => project.slug === slug)!);
};
// Contacts and professional URLs intentionally come from profile.json in both
// languages. A Chinese value with the same key explicitly overrides the default.
const content = {
  zh: {profile: {...profileData, ...zhProfileData}, projects: readProjects(zhFiles, 'zh'), workGroups: zhWorkGroups as WorkGroup[]},
  en: {profile: profileData, projects: readProjects(files, 'en'), workGroups: workGroups as WorkGroup[]},
};
for (const lang of ['zh', 'en'] as const) validateGroups(content[lang].projects, content[lang].workGroups, lang);
validateLanguageParity(content.en.projects, content.zh.projects, content.en.workGroups, content.zh.workGroups);
export const getContent = (lang: Lang = 'zh') => content[lang];
export const projectSlugs = order;
