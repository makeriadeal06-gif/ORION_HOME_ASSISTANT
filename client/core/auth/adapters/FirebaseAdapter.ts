import { User } from 'firebase/auth';
import { auth, googleProvider } from '../firebase/config';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';

export class FirebaseAdapter {
  public static async signInWithGoogle() {
    return signInWithPopup(auth, googleProvider);
  }

  public static async signOut() {
    return signOut(auth);
  }

  public static onAuthChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  }

  public static async getIdToken(user: User): Promise<string> {
    return user.getIdToken();
  }
}
