/** A filter the user turned on, shown as a removable chip next to the toolbar. */
export type ActiveFilter = {
  key: string;
  label: string;
  clear: () => void;
};
/** One saved on/off preference rendered as a labelled switch. */
export type PreferenceSetting = {
  key: string;
  label: string;
  description?: string;
  disabled?: boolean;
  get: () => boolean;
  set: (value: boolean) => void;
};
export type PreferenceSettingGroup = {
  key: string;
  title: string;
  hint?: string;
  settings: PreferenceSetting[];
};
