import React, { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { toast } from 'sonner';

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
        try {
          const isAdminEmail = firebaseUser.email === 'pedrohardsolu2025@gmail.com' || firebaseUser.email === 'bsr.salvador2022@gmail.com';
          
          // First, try to get the user by their actual UID
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            const data = userDoc.data() as UserData;
            // Force upgrade to admin if they are one of the admin emails but their role isn't admin
            if (isAdminEmail && data.role !== 'admin') {
              data.role = 'admin';
              await setDoc(doc(db, 'users', firebaseUser.uid), data, { merge: true });
            }
            setUser(firebaseUser);
            setUserData(data);
          } else {
            // Document doesn't exist by UID. Check if they were pre-authorized by email.
            const q = query(collection(db, 'users'), where('email', '==', firebaseUser.email));
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              // They are authorized!
              const pendingDoc = querySnapshot.docs[0];
              const pendingData = pendingDoc.data();
              
              // Create the real document with their actual UID
              const newUserData: UserData = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || pendingData.name || 'User',
                email: firebaseUser.email || '',
                role: isAdminEmail ? 'admin' : pendingData.role,
                createdAt: new Date().toISOString(),
              };
              
              await setDoc(doc(db, 'users', firebaseUser.uid), newUserData);
              
              // Delete the pending document
              await deleteDoc(doc(db, 'users', pendingDoc.id));
              
              setUser(firebaseUser);
              setUserData(newUserData);
            } else if (isAdminEmail) {
               // Super admins get in automatically even if not pre-authorized
               const newUserData: UserData = {
                uid: firebaseUser.uid,
                name: firebaseUser.displayName || 'Admin',
                email: firebaseUser.email || '',
                role: 'admin',
                createdAt: new Date().toISOString(),
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), newUserData);
              setUser(firebaseUser);
              setUserData(newUserData);
            } else {
              // NOT AUTHORIZED
              toast.error('Acesso negado. Seu e-mail não está autorizado pelo administrador.');
              await signOut(auth);
              setUser(null);
              setUserData(null);
            }
          }
        } catch (error) {
          console.error("Error fetching/creating user data:", error);
          toast.error('Erro ao verificar autorização.');
          await signOut(auth);
          setUser(null);
          setUserData(null);
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
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        toast.error('O login foi cancelado ou a janela foi fechada.');
      } else if (error.code === 'auth/unauthorized-domain') {
        toast.error('Domínio não autorizado. Abra o app em uma nova guia ou adicione a URL no Firebase Console.');
      } else {
        toast.error(`Erro ao fazer login: ${error.message}`);
      }
    }
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
