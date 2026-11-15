'use client';
/* Client access to the platform owner switches ({ demo, maintenance }). */
import { useQuery } from '@tanstack/react-query';

const OFF = { demo: false, maintenance: false };

export function usePlatformPublic(): { demo: boolean; maintenance: boolean; loaded: boolean } {
  const { data, isSuccess } = useQuery({
    queryKey: ['platform-public'],
    queryFn: async () => {
      try {
        const r = await fetch('/api/platform/public-config', { cache: 'no-store' });
        if (!r.ok) return OFF;
        const j = await r.json();
        return { demo: !!j.demo, maintenance: !!j.maintenance };
      } catch {
        return OFF;
      }
    },
    staleTime: 15_000,
    gcTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const v = data ?? OFF;
  return { ...v, loaded: isSuccess };
}
