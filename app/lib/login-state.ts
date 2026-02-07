export type LoginState = {
  message: string | null;
  needsVerification?: boolean;
  email?: string;
};

export const initialLoginState: LoginState = {
  message: null,
};
