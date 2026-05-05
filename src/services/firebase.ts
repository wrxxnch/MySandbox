import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where,
  serverTimestamp,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { ElementProperties } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error.message?.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

export const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Login failed", error);
    return null;
  }
};

export const logout = () => signOut(auth);

// Elements Persistence
export const saveCustomElements = async (userId: string, elements: ElementProperties[]) => {
  try {
    const coll = collection(db, 'user_elements');
    // For simplicity, we save the whole list or individual ones
    // Here we'll just add them
    for (const el of elements) {
      if (el.id.startsWith('custom-')) {
        await addDoc(coll, {
          ...el,
          userId,
          createdAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    console.error("Save failed", error);
  }
};

export const loadUserElements = async (userId: string): Promise<ElementProperties[]> => {
  try {
    const q = query(collection(db, 'user_elements'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as ElementProperties);
  } catch (error) {
    console.error("Load failed", error);
    return [];
  }
};

export const saveMap = async (userId: string, grid: Uint32Array, name: string) => {
  try {
    const coll = collection(db, 'user_maps');
    await addDoc(coll, {
      userId,
      name,
      // We convert the grid to a base64 string or similar for storage
      // For now, let's just use an array (be careful with size though)
      // Actually, Firestore has a 1MB limit. 612*384 is 234k. If we use a string, it fits.
      grid: Array.from(grid).join(','),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Map save failed", error);
  }
};

export const loadMaps = async (userId: string) => {
  try {
    const q = query(collection(db, 'user_maps'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    console.error("Load maps failed", error);
    return [];
  }
};
