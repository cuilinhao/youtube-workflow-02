'use client';

import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';

interface LanguageToggleProps {
  className?: string;
}

export function LanguageToggle({ className }: LanguageToggleProps) {
  const { language, toggleLanguage, t, select } = useI18n();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className={className}
      aria-label={select({ zh: '切换到英文', en: 'Switch to Chinese' })}
      title={select({ zh: '切换到英文', en: 'Switch to Chinese' })}
    >
      <Languages className="h-4 w-4 mr-2" />
      <span className="text-sm font-medium">
        {language === 'zh' ? t('language.toggle.label', '中 / EN') : t('language.toggle.label', 'EN / 中')}
      </span>
    </Button>
  );
}
