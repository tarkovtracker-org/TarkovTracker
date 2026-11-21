export const UNTAR_CONTROL_PREVIEW_ID = 'preview:untar-control';
export const UNTAR_CONTROL_POSTER_URL = 'https://t.me/escapefromtarkovEN/7003';
export interface PreviewPerk<Points extends number | null = number | null> {
  id: string;
  name: string;
  description: string;
  points: Points;
  exclusiveToPerks: string[];
  imageLink: string | null;
}
export interface SeasonPreview {
  provisional: true;
  source: string;
  season: {
    data: {
      id: string;
      name: string;
      start: number | null;
      end: number | null;
      perks: { common: PreviewPerk<null>[]; personal: PreviewPerk<number>[] };
    };
    translations: string[];
  };
  season_en: { data: Record<string, string> };
}
