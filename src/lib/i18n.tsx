'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Language = 'zh' | 'en';

type TranslationMap = Record<Language, Record<string, string>>;

const STORAGE_KEY = 'nb-language';

const translations: TranslationMap = {
  zh: {
    'nav.tagline': 'AI 批量生成',
    'nav.explore': '探索',
    'nav.assets': '素材',
    'nav.gallery': '图库',
    'nav.login': '登录',
    'nav.subscribe': '订阅',
    'sidebar.section.create': 'AI 创作',
    'sidebar.section.library': '素材库',
    'sidebar.section.settings': '设置',
    'sidebar.tab.textToImage': '批量文生图',
    'sidebar.tab.imageToVideo': '批量图生视频',
    'sidebar.tab.videoWorkflow': '视频工作流',
    'sidebar.tab.settings': '设置中心',
    'sidebar.tab.styleLibrary': '风格库',
    'sidebar.tab.referenceLibrary': '参考图库',
    'sidebar.tab.keyManager': '密钥库',
    'sidebar.badge.new': '新品',
    'main.textToImage.title': '批量文生图',
    'main.textToImage.subtitle': '管理提示词，批量生成 AI 图片',
    'main.imageToVideo.title': '批量图生视频',
    'main.imageToVideo.subtitle': '使用 Veo3 将图片转换为视频',
    'main.videoWorkflow.title': '视频生成工作流',
    'main.videoWorkflow.subtitle': '从文本脚本到视频提示词的完整工作流程',
    'main.settings.title': '设置中心',
    'main.settings.subtitle': '配置批量出图与图生视频的全局参数',
    'main.styleLibrary.title': '风格库',
    'main.styleLibrary.subtitle': '维护常用风格模板，便于批量应用',
    'main.referenceLibrary.title': '参考图库',
    'main.referenceLibrary.subtitle': '集中管理出图所需的参考素材',
    'main.keyManager.title': '密钥库',
    'main.keyManager.subtitle': '统一维护各平台 API Key 与默认密钥',
    'footer.rights': '© 2025 Nano Banana. 保留所有权利。',
    'footer.terms': '条款',
    'footer.privacy': '隐私',
    'footer.about': '关于',
    'error.title': '发生错误',
    'error.description': '请稍后重试，或刷新页面恢复。',
    'error.retry': '重试',
    'notFound.title': '页面走丢了',
    'notFound.description': '未找到对应的页面，可能链接已失效或内容被移除。请返回主页或检查链接是否正确。',
    'notFound.back': '返回主页',
    'globalError.title': '页面出错了',
    'globalError.description': '请刷新页面或点击下方按钮重试。',
    'language.toggle.label': '中 / EN',
  },
  en: {
    'nav.tagline': 'AI batch generation',
    'nav.explore': 'Explore',
    'nav.assets': 'Assets',
    'nav.gallery': 'Gallery',
    'nav.login': 'Log in',
    'nav.subscribe': 'Subscribe',
    'sidebar.section.create': 'AI Create',
    'sidebar.section.library': 'Library',
    'sidebar.section.settings': 'Settings',
    'sidebar.tab.textToImage': 'Text → Image',
    'sidebar.tab.imageToVideo': 'Image → Video',
    'sidebar.tab.videoWorkflow': 'Video Workflow',
    'sidebar.tab.settings': 'Settings Center',
    'sidebar.tab.styleLibrary': 'Style Library',
    'sidebar.tab.referenceLibrary': 'Reference Library',
    'sidebar.tab.keyManager': 'Key Manager',
    'sidebar.badge.new': 'New',
    'main.textToImage.title': 'Batch Text to Image',
    'main.textToImage.subtitle': 'Manage prompts and batch-generate AI images',
    'main.imageToVideo.title': 'Batch Image to Video',
    'main.imageToVideo.subtitle': 'Use Veo3 to convert images into videos',
    'main.videoWorkflow.title': 'Video Workflow',
    'main.videoWorkflow.subtitle': 'Full pipeline from script to video prompts',
    'main.settings.title': 'Settings Center',
    'main.settings.subtitle': 'Configure batch image/video defaults',
    'main.styleLibrary.title': 'Style Library',
    'main.styleLibrary.subtitle': 'Maintain reusable style templates for batches',
    'main.referenceLibrary.title': 'Reference Library',
    'main.referenceLibrary.subtitle': 'Manage reference assets for generation',
    'main.keyManager.title': 'Key Manager',
    'main.keyManager.subtitle': 'Store API keys in one place',
    'footer.rights': '© 2025 Nano Banana. All rights reserved.',
    'footer.terms': 'Terms',
    'footer.privacy': 'Privacy',
    'footer.about': 'About',
    'error.title': 'Something went wrong',
    'error.description': 'Please try again later or refresh the page.',
    'error.retry': 'Retry',
    'notFound.title': 'Page not found',
    'notFound.description': 'The page could not be located. It may have moved or expired. Please return home or check the URL.',
    'notFound.back': 'Back to home',
    'globalError.title': 'Page error',
    'globalError.description': 'Please refresh the page or click the button below to retry.',
    'language.toggle.label': 'EN / 中',
  },
};

function detectInitialLanguage(defaultLanguage: Language = 'zh'): Language {
  if (typeof window === 'undefined') return defaultLanguage;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') {
      return stored;
    }

    const userLang = navigator.language?.toLowerCase() ?? '';
    if (userLang.startsWith('zh')) return 'zh';
    return defaultLanguage === 'zh' ? 'en' : defaultLanguage;
  } catch {
    return defaultLanguage;
  }
}

interface I18nContextValue {
  language: Language;
  setLanguage: (next: Language) => void;
  toggleLanguage: () => void;
  t: (key: string, fallback?: string) => string;
  select: <T>(options: { zh: T; en: T }) => T;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  initialLanguage,
}: {
  children: React.ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(() => initialLanguage ?? detectInitialLanguage());

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // ignore storage failures
    }
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguageState((prev) => (prev === 'zh' ? 'en' : 'zh'));
  }, []);

  const t = useCallback(
    (key: string, fallback?: string) => {
      const value = translations[language]?.[key];
      if (value) return value;
      return translations.zh[key] ?? fallback ?? key;
    },
    [language],
  );

  const select = useCallback(
    <T,>({ zh, en }: { zh: T; en: T }) => {
      return language === 'zh' ? (zh ?? en) : (en ?? zh);
    },
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      setLanguage,
      toggleLanguage,
      t,
      select,
    }),
    [language, setLanguage, toggleLanguage, t, select],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function getStoredLanguage() {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'zh' || stored === 'en' ? stored : null;
}

export { detectInitialLanguage };
