import type { ReactNode, SVGProps } from 'react';

export type IconName = 'mic' | 'history' | 'user' | 'refresh' | 'database' | 'shield' | 'clock' | 'play' | 'pause' | 'stop' | 'trash' | 'download' | 'wifi' | 'menu' | 'check' | 'info' | 'mail' | 'phone' | 'search' | 'file' | 'gear' | 'layers' | 'chevron' | 'paperclip' | 'camera' | 'video' | 'edit' | 'cloud' | 'alert' | 'close' | 'arrow' | 'upload' | 'book' | 'network' | 'grid' | 'list';

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    mic: <><rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 10a6.5 6.5 0 0 0 13 0M12 17v4m-3 0h6"/></>,
    history: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2M3 4v5h5"/></>,
    user: <><circle cx="12" cy="8" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9a7 7 0 0 1 12-2L20 12M4 12l2.5 5a7 7 0 0 0 12-2"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/></>,
    shield: <><path d="m12 2 8 3v6c0 5-3.4 8.5-8 11-4.6-2.5-8-6-8-11V5z"/><path d="m8.5 12 2.3 2.3 4.8-5"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    play: <path d="m8 5 11 7-11 7z"/>, pause: <path d="M8 5v14M16 5v14"/>, stop: <rect x="5" y="5" width="14" height="14" rx="2"/>,
    trash: <><path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v5m4-5v5"/></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v4h16v-4"/></>,
    wifi: <><path d="M3 8a14 14 0 0 1 18 0M6 11a9 9 0 0 1 12 0m-9 3a4 4 0 0 1 6 0M12 18h.01"/></>,
    menu: <path d="M4 6h16M4 12h16M4 18h16"/>, check: <path d="m5 12 4 4L19 6"/>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    phone: <path d="M5 3h4l2 5-2.5 1.5a14 14 0 0 0 6 6L16 13l5 2v4c0 1.1-.9 2-2 2A16 16 0 0 1 3 5c0-1.1.9-2 2-2Z"/>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></>, file: <><path d="M6 3h8l5 5v13H6z"/><path d="M14 3v6h5"/></>,
    gear: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.2 2-2 2-2-1.2-.2.1-1.4.6-.5 2.4h-3l-.5-2.4-1.4-.6-.2-.1-2 1.2-2-2 1.2-2-.1-.2-.6-1.4L3.8 13v-3l2.4-.5.6-1.4.1-.2-1.2-2 2-2 2 1.2.2-.1 1.4-.6.5-2.4h3l.5 2.4 1.4.6.2.1 2-1.2 2 2-1.2 2 .1.2.6 1.4 2.4.5v3l-2.4.5z"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, paperclip: <path d="m8 12 7.5-7.5a3.5 3.5 0 0 1 5 5L10 20a5 5 0 0 1-7-7L14 2"/>,
    camera: <><path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="3.5"/></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/></>,
    edit: <><path d="m4 16-.8 4.8L8 20l11-11-4-4zM13.5 6.5l4 4"/></>,
    cloud: <path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 20 10a4 4 0 0 1-1 8H7zm5-7v8m-3-3 3 3 3-3"/>,
    alert: <><path d="M12 3 2.8 20h18.4z"/><path d="M12 9v5m0 3h.01"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>, arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    upload: <><path d="M12 16V4m0 0L8 8m4-4 4 4"/><path d="M4 15v5h16v-5"/></>, book: <><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v18H6.5A2.5 2.5 0 0 0 4 22z"/><path d="M4 4.5V22m4-15h8"/></>,
    network: <><circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="18" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="m10.8 7.2-4.5 8.5m6.9-8.5 4.5 8.5M7.5 18h9"/></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    list: <path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
