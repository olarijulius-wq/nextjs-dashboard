export type LoginState = {
  success: boolean;
  message: string | null;
  needsVerification: boolean;
  emailForVerification: string | null;
  needsTwoFactor: boolean;
  emailForTwoFactor: string | null;
};

export const initialLoginState: LoginState = {
  success: false,
  message: null,
  needsVerification: false,
  emailForVerification: null,
  needsTwoFactor: false,
  emailForTwoFactor: null,
};
