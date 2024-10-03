export const PASS_PLAY_TYPES: number[] = [3, 4, 6, 7, 24, 26, 36, 51, 67];
export const RUSH_PLAY_TYPES: number[] = [5, 9, 29, 39, 68];

export class AuthorizationError extends Error {}

export interface ApiUser {
  id: number;
  username: string;
  patronLevel: number;
  remainingCalls: number;
  isAdmin: boolean;
}

export class UserMessageError extends Error {
  message: string;

  constructor(message: string) {
    super(message);
    this.message = message;
  }
}
