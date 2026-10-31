export type IconName = 'leaf' | 'recipes' | 'calendar' | 'basket' | 'search' | 'shuffle' | 'clock' | 'people' | 'plus' | 'arrow' | 'check' | 'close' | 'lock' | 'unlock' | 'copy' | 'trash' | 'chevron' | 'sparkle' | 'minus'

const paths: Record<IconName, string> = {
  leaf: 'M20 4c-7-1-14 1-14 7a6 6 0 0 0 6 6c6 0 8-6 8-13ZM4 20 15 9M8 14v-4m4 0h4',
  recipes: 'M4 3h4v7a2 2 0 0 1-4 0V3Zm2 9v9M14 3v7h5V3m-2.5 7v11M6 3v6',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm2-3v6m10-6v6M3 11h18M7 15h2m3 0h2m3 0h1M7 18h2m3 0h2',
  basket: 'M3 9h18l-2 11H5L3 9Zm4 0 4-7m6 7-4-7M8 13v3m4-3v3m4-3v3',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z',
  shuffle: 'M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m14-11a4 4 0 0 1 0 8m6 3v-2a4 4 0 0 0-3-3M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  plus: 'M12 5v14M5 12h14', arrow: 'M4 12h16m-6-6 6 6-6 6', check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  lock: 'M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Zm2 0V6a4 4 0 0 1 8 0v4m-4 4v2',
  unlock: 'M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Zm2 0V6a4 4 0 0 1 7.5-2m-3.5 10v2',
  copy: 'M8 8h13v13H8V8ZM16 8V3H3v13h5', trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  chevron: 'm8 4 8 8-8 8', sparkle: 'm12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z',
  minus: 'M5 12h14',
}

export function Icon({ name, size = 20, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}
