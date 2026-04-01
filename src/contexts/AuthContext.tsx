import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export type Role = 'admin' | 'manager' | 'waiter' | 'kitchen' | 'bar' | 'cashier';

export interface UserData {
  uid: string;
  name: string;
  email: string;
  role: Role;
  pin?: string;
  createdAt: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setLoading(true);
        setUser(firebaseUser);
        try {
          const isAdminEmail = firebaseUser.email === 'pedrohardsolu2025@gmail.com' || firebaseUser.email === 'bsr.salvador2022@gmail.com';
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            // Force upgrade to admin if they are one of the admin emails but their role isn't admin
            if (isAdminEmail && data.role !== 'admin') {
              data.role = 'admin';
              await setDoc(doc(db, 'users', firebaseUser.uid), data, { merge: true });
            }
            setUserData(data);
          } else {
            // Create new user
            const newUserData: UserData = {
              uid: firebaseUser.uid,
              name: firebaseUser.displayName || 'User',
              email: firebaseUser.email || '',
              role: isAdminEmail ? 'admin' : 'waiter', // Default new Google users to waiter
              createdAt: new Date().toISOString(),
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newUserData);
            setUserData(newUserData);
          }
        } catch (error) {
          console.error("Error fetching/creating user data:", error);
          // If creation fails due to rules, we might just set them as manager locally or sign out
          setUserData({
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'User',
            email: firebaseUser.email || '',
            role: 'manager',
            createdAt: new Date().toISOString(),
          });
        }
        setLoading(false);
      } else {
        setUser(null);
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, userData, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
