// =========================================================
// FAIL: js/modules/guru.js
// =========================================================

// Import DB yang telah di-initialise di firebase-config.js
import { db } from '../firebase-config.js'; 

// PENTING: Gunakan versi 11.1.0 sama seperti dalam firebase-config.js anda
import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// 1. DAFTAR PESERTA
export async function registerParticipant(tahun, data) {
    try {
        const pesertaRef = doc(collection(db, "sukantara", tahun, "peserta"));
        const dataLengkap = { ...data, id: pesertaRef.id };
        await setDoc(pesertaRef, dataLengkap);
        return { success: true, id: pesertaRef.id };
    } catch (error) {
        console.error("Ralat Daftar:", error);
        throw error;
    }
}

// 2. KEMASKINI DATA
export async function updateParticipant(tahun, docId, data) {
    try {
        const pesertaRef = doc(db, "sukantara", tahun, "peserta", docId);
        await updateDoc(pesertaRef, data);
        return { success: true };
    } catch (error) {
        console.error("Ralat Update:", error);
        throw error;
    }
}

// 3. PADAM PESERTA (Wajib ada)
export async function deleteParticipant(tahun, docId) {
    try {
        const pesertaRef = doc(db, "sukantara", tahun, "peserta", docId);
        await deleteDoc(pesertaRef);
        return { success: true };
    } catch (error) {
        console.error("Ralat Padam:", error);
        throw error;
    }
}

// 4. DAPATKAN SENARAI ACARA
export async function getEventsByCategory(tahun, kategori) {
    try {
        const q = query(collection(db, "sukantara", tahun, "acara"));
        const snapshot = await getDocs(q);
        let events = [];
        snapshot.forEach((doc) => {
            events.push({ id: doc.id, ...doc.data() });
        });
        return events;
    } catch (error) {
        console.error("Ralat Acara:", error);
        throw error;
    }
}

// 5. DAPATKAN SENARAI PESERTA (Untuk Table)
export async function getRegisteredParticipants(tahun, idRumah) {
    try {
        const q = query(
            collection(db, "sukantara", tahun, "peserta"),
            where("idRumah", "==", idRumah)
        );

        const snapshot = await getDocs(q);
        let list = [];
        snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() });
        });
        return list;

    } catch (error) {
        console.error("Ralat Senarai Peserta:", error);
        throw error; // Ini akan ditangkap oleh main-guru.js
    }
}
