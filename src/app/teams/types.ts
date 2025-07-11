import { DivisionClassification } from '../enums';

export interface Team {
  /**
   * @isInt
   */
  id: number;
  school: string;
  mascot: string | null;
  abbreviation: string | null;
  alternateNames: string[] | null;
  conference: string | null;
  division: string | null;
  classification: string | null;
  color: string | null;
  alternateColor: string | null;
  logos: string[] | null;
  twitter: string | null;
  location: Venue | null;
}

export interface Venue {
  /**
   * @isInt
   */
  id: number | null;
  name: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  countryCode: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation: string | null;
  /**
   * @isInt
   */
  capacity: number | null;
  /**
   * @isInt
   */
  constructionYear: number | null;
  grass?: boolean | null;
  dome?: boolean | null;
}

export interface Matchup {
  team1: string;
  team2: string;
  /**
   * @isInt
   */
  startYear: number | undefined;
  /**
   * @isInt
   */
  endYear: number | undefined;
  /**
   * @isInt
   */
  team1Wins: number;
  /**
   * @isInt
   */
  team2Wins: number;
  /**
   * @isInt
   */
  ties: number;
  games: MatchupGame[];
}

export interface MatchupGame {
  /**
   * @isInt
   */
  season: number;
  /**
   * @isInt
   */
  week: number;
  seasonType: string;
  date: string;
  neutralSite: boolean;
  venue: string | null;
  homeTeam: string;
  /**
   * @isInt
   */
  homeScore: number | null;
  awayTeam: string;
  /**
   * @isInt
   */
  awayScore: number | null;
  winner: string | null;
}

export interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  team: string;
  /**
   * @isInt
   */
  height: number | null;
  /**
   * @isInt
   */
  weight: number | null;
  /**
   * @isInt
   */
  jersey: number | null;
  /**
   * @isInt
   * @deprecated
   */
  year: number;
  position: string | null;
  homeCity: string | null;
  homeState: string | null;
  homeCountry: string | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
  homeCountyFIPS: string | null;
  /**
   * @isInt
   */
  recruitIds: string[] | null;
}

export interface Conference {
  /**
   * @isInt
   */
  id: number;
  name: string;
  shortName: string | null;
  abbreviation: string | null;
  classification: DivisionClassification | null;
}

export interface TeamTalent {
  /**
   * @isInt
   */
  year: number;
  team: string;
  talent: number;
}
