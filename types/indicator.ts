export type IndicatorRegion = 'US' | 'CL';

export interface Indicator {
  id: string;
  label: string;
  region: IndicatorRegion;
  value: string;
  changePercent: number | null;
}
