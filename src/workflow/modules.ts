import type { LucideIcon } from 'lucide-react';
import { Braces, Newspaper, Heading, Search, Images, Clapperboard, WandSparkles, RadioTower, Settings2 } from 'lucide-react';

export type FlowModuleId = 'json-input' | 'news-package' | 'headline' | 'research' | 'assets' | 'studio' | 'img2vid' | 'accountticker' | 'settings';

export type FlowModuleDefinition = {
  id: FlowModuleId;
  name: string;
  short: string;
  category: 'Input' | 'Produktion' | 'Werkzeug';
  accent: string;
  icon: LucideIcon;
  description: string;
  singleton?: boolean;
};

export const flowModules: FlowModuleDefinition[] = [
  { id:'json-input', name:'JSON Input', short:'JSON', category:'Input', accent:'#0ea5e9', icon:Braces, description:'Importiert genau ein vollständiges Newspaket aus JSON.', singleton:true },
  { id:'news-package', name:'Newspaket', short:'Paket', category:'Produktion', accent:'#2563eb', icon:Newspaper, description:'Versionen, Sprechtext, Dreizeiler, Beschreibung, Prompter und Aufnahme.', singleton:true },
  { id:'headline', name:'Schlagzeile', short:'Headline', category:'Produktion', accent:'#7c3aed', icon:Heading, description:'Dreizeiler gestalten, PNGs sowie Artikel- und Social-Karten erzeugen.', singleton:true },
  { id:'research', name:'Recherche', short:'Recherche', category:'Produktion', accent:'#059669', icon:Search, description:'Alternative News, Plattform-Suche und Video-Downloader.', singleton:true },
  { id:'assets', name:'Assets', short:'Assets', category:'Produktion', accent:'#d97706', icon:Images, description:'Lokale Medienzentrale für Bilder, Videos, Audio, Headlines und Exporte.', singleton:true },
  { id:'studio', name:'Studio', short:'Studio', category:'Produktion', accent:'#dc2626', icon:Clapperboard, description:'9:16 Vorschau, Medienkombination, Audio, Headline und Browser-Export.', singleton:true },
  { id:'img2vid', name:'Img2Vid', short:'Img2Vid', category:'Produktion', accent:'#9333ea', icon:WandSparkles, description:'Bild-Assets über Replicate-Modelle in Clips umwandeln.', singleton:true },
  { id:'accountticker', name:'Accountticker', short:'Ticker', category:'Werkzeug', accent:'#475569', icon:RadioTower, description:'Service-Modul für externe Ticker und Account-Monitoring.', singleton:true },
  { id:'settings', name:'Settings', short:'Settings', category:'Werkzeug', accent:'#64748b', icon:Settings2, description:'Lokale Entwicklungs-Standards für Prompter, Audio, Studio und Img2Vid.', singleton:true },
];

export const flowModuleMap = Object.fromEntries(flowModules.map((module) => [module.id, module])) as Record<FlowModuleId, FlowModuleDefinition>;
