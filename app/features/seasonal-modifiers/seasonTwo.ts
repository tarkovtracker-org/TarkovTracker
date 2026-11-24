import { UNTAR_CONTROL_PREVIEW_ID } from '@/types/seasonPreview';
import type { ModifierCategory, ModifierDisplay } from '@/features/seasonal-modifiers/planner';
import type { PreviewPerk, SeasonPreview } from '@/types/seasonPreview';
const categoryMembers = {
  skills: [
    'introvert',
    'tap_rack_roll',
    'kleptomaniac',
    'the_tarkov_shooter',
    'hercules',
    'prodigy',
    'average',
    'extrovert',
    'incompetent',
    'personality_vacuum',
  ],
  hideout: ['fast_crafting', 'refs_builders', 'advanced_hideout'],
  raid_combat: [
    'lockpicker',
    'friends_extract',
    'cold_blooded',
    'safecracker',
    'bushborne',
    'lucky',
    'schizo',
    'loose_tongue',
    'three_fingered',
    'shaky_aim',
    'no_scav_runs',
    'unlucky',
  ],
  movement_stamina: [
    'heavyweight',
    'marathon_runner',
    'youth',
    'sprinter',
    'exhaustion',
    'third_leg',
  ],
  health_provisions: [
    'juice_time',
    'sailors_nostalgia',
    'diet',
    'thrombophilia',
    'hypodipsia',
    'polyphagia',
    'sturdy_bones',
    'coagulopathy',
    'hemophilia',
    'osteoporosis',
    'well_that_hurt',
    'polydipsia',
    'chronic_fatigue_syndrome',
    'dr_jekyll',
    'allergic',
  ],
  traders_economy: [
    'peacekeepers_insurance',
    'street_tax',
    'no_repairs',
    'no_love_from_fence',
    'no_flea_market',
  ],
  gear_goals: [
    'enhanced_secure_container',
    'kappa_protocol',
    'zero_to_hero',
    'deadline',
    'broken_secure_container',
  ],
} satisfies Partial<Record<ModifierCategory, string[]>>;
const categories = new Map(
  Object.entries(categoryMembers).flatMap(([category, ids]) =>
    ids.map((id) => [UNTAR_CONTROL_PREVIEW_ID + ':' + id, category as ModifierCategory] as const)
  )
);
const highlight =
  /(?:\blevel \d+|[+\u2212-]?\d+(?:\.\d+)?(?:%| health regeneration| arm and leg stamina points| kg| seconds?| days?| Fence reputation)(?: (?:faster|slower|more slowly|more|less|later|each))?|twice as fast|solo play|without inspecting|\bheavy bleed\b|Found in Raid status|\bFresh Wound\b)/gi;
function displayText(perk: PreviewPerk, dictionary: Record<string, string>) {
  return { id: perk.id, name: dictionary[perk.name]!, effect: dictionary[perk.description]! };
}
export function previewRules(preview: SeasonPreview) {
  return preview.season.data.perks.common.map((perk) => displayText(perk, preview.season_en.data));
}
export function previewModifiers(preview: SeasonPreview): ModifierDisplay[] {
  return preview.season.data.perks.personal.map((perk) => {
    const text = displayText(perk, preview.season_en.data);
    return {
      ...text,
      category: categories.get(perk.id) ?? 'general',
      netCost: -perk.points,
      effect: text.effect.replace(highlight, '**$&**'),
    };
  });
}
