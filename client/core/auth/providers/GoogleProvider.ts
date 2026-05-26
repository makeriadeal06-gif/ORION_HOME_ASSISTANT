import { GoogleAuthProvider } from 'firebase/auth';

export const googleAuthParams = {
  prompt: 'select_account',
  customParameters: {
    'access_type': 'offline'
  }
};

export const createGoogleProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters(googleAuthParams.customParameters);
  return provider;
};
