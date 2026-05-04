export type PunchType = 'entrada' | 'pausa' | 'retorno' | 'fim';

export interface Punch {
  id: string;
  type: PunchType;
  timestamp: number;
  carPrefix: string;
}

export interface Damage {
  id: string;
  timestamp: number;
  description: string;
  photoUrl: string; // Firebase Storage URL
}

export interface DayLog {
  date: string; // YYYY-MM-DD
  carPrefix: string;
  punches: Punch[];
  damages?: Damage[];
  isDayOff?: boolean;
}

export type Theme = 'light' | 'dark';

export interface AppSettings {
  carPrefixes: string[];
  selectedPrefix: string;
  theme: Theme;
  alarmsEnabled: boolean;
  notificationsEnabled: boolean;
  alarmTimes: {
    entrada: string;
    pausa: string;
    retorno: string;
    fim: string;
  };
  activeAlarms: {
    entrada: boolean;
    pausa: boolean;
    retorno: boolean;
    fim: boolean;
  };
  scalePhotos?: string[];
  profilePhoto?: string;
}
