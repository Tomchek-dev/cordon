import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Internal Chat',
    short_name: 'Chat',
    description: 'Self-hosted internal chat tool',
    start_url: '/',
    display: 'standalone',
    background_color: '#070a08',
    theme_color: '#070a08',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
