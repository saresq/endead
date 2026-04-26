/**
 * Icon helper — wraps Lucide icons for use in innerHTML templates.
 *
 * Usage:
 *   icon('Search')           → SVG string at default (md) size
 *   icon('Search', 'sm')     → SVG string at small size
 */

import {
  Search,
  Volume2,
  VolumeX,
  DoorOpen,
  Target,
  Handshake,
  SkipForward,
  Swords,
  Shield,
  Crosshair,
  Flame,
  Backpack,
  Package,
  ArrowLeftRight,
  Heart,
  Zap,
  Star,
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  Trophy,
  Skull,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Menu,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Crown,
  UserPlus,
  Play,
  ArrowLeft,
  Info,
  Loader2,
  LogOut,
  Power,
  Settings,
  Sun,
  Moon,
  Trash2,
  Plus,
  Minus,
  Footprints,
  Sparkles,
  ShieldCheck,
  type IconNode,
} from 'lucide';

type IconSize = 'sm' | 'md' | 'lg' | 'xl';

// Lucide IconNode is an array of [tag, attrs] tuples
const ICON_REGISTRY: Record<string, IconNode> = {
  Search,
  Volume2,
  VolumeX,
  DoorOpen,
  Target,
  Handshake,
  SkipForward,
  Swords,
  Shield,
  Crosshair,
  Flame,
  Backpack,
  Package,
  ArrowLeftRight,
  Heart,
  Zap,
  Star,
  TrendingUp,
  Users,
  Clock,
  AlertTriangle,
  Trophy,
  Skull,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Menu,
  Maximize2,
  Minimize2,
  Copy,
  Check,
  Crown,
  UserPlus,
  Play,
  ArrowLeft,
  Info,
  Loader2,
  LogOut,
  Power,
  Settings,
  Sun,
  Moon,
  Trash2,
  Plus,
  Minus,
  Footprints,
  Sparkles,
  ShieldCheck,
};

export function icon(name: string, size: IconSize = 'md'): string {
  const iconData = ICON_REGISTRY[name];
  if (!iconData) {
    console.warn(`Icon "${name}" not found in registry`);
    return '';
  }

  // Each icon is an array of [tagName, attributes] tuples
  const innerSvg = (iconData as [string, Record<string, string>][])
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${attrStr}/>`;
    })
    .join('');

  return `<svg class="icon icon--${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${innerSvg}</svg>`;
}