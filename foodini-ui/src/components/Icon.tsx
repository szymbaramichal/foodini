export type IconName =
  | 'recipes'
  | 'shuffle'
  | 'clock'
  | 'plus'
  | 'minus'
  | 'close'
  | 'lock'
  | 'unlock'
  | 'trash'
  | 'share'
  | 'cloud'
  | 'sync'

const paths: Record<IconName, string> = {
  recipes: 'M4 3h4v7a2 2 0 0 1-4 0V3Zm2 9v9M14 3v7h5V3m-2.5 7v11M6 3v6',
  shuffle: 'M3 6h3c5 0 7 12 12 12h3m-4-4 4 4-4 4M3 18h3c2 0 3-2 4-4m4-4c1-2 2-4 4-4h3m-4-4 4 4-4 4',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  lock: 'M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Zm2 0V6a4 4 0 0 1 8 0v4m-4 4v2',
  unlock: 'M6 10h12a1 1 0 0 1 1 1v9H5v-9a1 1 0 0 1 1-1Zm2 0V6a4 4 0 0 1 7.5-2m-3.5 10v2',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10Z',
  sync: 'M20 11a8.1 8.1 0 0 0-15.5-2m-.5-5v5h5M4 13a8.1 8.1 0 0 0 15.5 2m.5 5v-5h-5',
}

export function Icon({
  name,
  size = 20,
  className = '',
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}
