import { db } from '../firebase-config.js';
import { 
    collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

export const dbService = {
    // Ambil satu dokumen
    async get(path, id) {
        const docRef = doc(db, path, id);
        const snap = await getDoc(docRef);
        return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },

    // Ambil semua dokumen dalam koleksi
    async getAll(path, queries = []) {
        const colRef = collection(db, path);
        const q = queries.length > 0 ? query(colRef, ...queries) : colRef;
        const snap = await getDocs(q);
        return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    // Kemas kini dokumen
    async update(path, id, data) {
        const docRef = doc(db, path, id);
        return await updateDoc(docRef, data);
    }
};