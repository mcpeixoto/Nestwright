import { icon } from '../../tools/icons'

/** One small glyph per library tab. */
export const CATEGORY_ICONS: Record<string, string> = {
  favourites: icon('<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>'),
  recent: icon('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  living: icon('<path d="M4 11V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M3 11h18v5H3z"/><path d="M5 16v2M19 16v2"/>'),
  dining: icon('<path d="M4 9h16"/><path d="M6 9v10M18 9v10"/><path d="M9 5h6"/>'),
  bedroom: icon('<path d="M3 18V7"/><path d="M3 13h18v5"/><path d="M7 13v-2.5a1.5 1.5 0 0 1 1.5-1.5H11v4"/>'),
  kitchen: icon('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M5 9h14"/><path d="M9 5.5v1M9 12v3"/>'),
  bathroom: icon('<path d="M3 12h18v2a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"/><path d="M6 12V6a2 2 0 0 1 4 0"/>'),
  office: icon('<rect x="4" y="4" width="16" height="11" rx="1"/><path d="M9 20h6M12 15v5"/>'),
  outdoor: icon('<path d="M12 3l6 9H6z"/><path d="M12 12v8"/><path d="M8 20h8"/>'),
  lighting: icon('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z"/>'),
  decor: icon('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 16l5-5 4 4 2-2 5 5"/>'),
  plants: icon('<path d="M7 14h10l-1.5 7h-7z"/><path d="M12 14V8"/><path d="M12 9c0-3 2-5 5-5 0 3-2 5-5 5zM12 11c0-2.5-1.8-4-4.5-4 0 2.5 1.8 4 4.5 4z"/>'),
  structure: icon('<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M10 21v-6h4v6"/>'),
  imported: icon('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/>'),
}
