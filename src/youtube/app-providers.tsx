'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from 'sonner';
import { I18nProvider } from '@youtube/lib/i18n';

interface YoutubeProvidersProps {
  children: ReactNode;
}

export function YoutubeProviders({ children }: YoutubeProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150} skipDelayDuration={0}>
        <I18nProvider>
          {children}
          <Toaster richColors position="top-center" expand={false} />
        </I18nProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

