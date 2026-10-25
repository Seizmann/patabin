import { useEffect } from 'react';

export function usePageTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = `${title} · PataBin`;
    const desc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (desc && description) desc.content = description;
  }, [title, description]);
}
