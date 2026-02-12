// =========================================================
// FAIL: js/modules/guru.js
// =========================================================

// Import Database dari fail config
import { db } from '../firebase-config.js'; 

// Import fungsi Firestore dari CDN (Pastikan versi sama dengan firebase-config.js)
import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc, 
    deleteDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

/**
 * 1. Mendaftar Peserta Baru
 */
export async function registerParticipant(tahun, data) {
    try {
        // Create reference dengan Auto-ID
        const pesertaRef = doc(collection(db, "sukantara", tahun, "peserta"));
        
        // Masukkan ID ke dalam data
        const dataLengkap = {
            ...data,
            id: pesertaRef.id
        };

        await setDoc(pesertaRef, dataLengkap);
        return { success: true, id: pesertaRef.id };

    } catch (error) {
        console.error("Ralat Daftar:", error);
        throw error;
    }
}

/**
 * 2. Mengemaskini Data Peserta
 */
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

/**
 * 3. Memadam Peserta
 * (Wajib ada supaya main-guru.js tidak error)
 */
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

/**
 * 4. Mendapatkan Senarai Acara Mengikut Kategori
 */
export async function getEventsByCategory(tahun, kategori) {
    try {
        const q = query(collection(db, "sukantara", tahun, "acara"));
        const snapshot = await getDocs(q);
        
        let events = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            // Di sini kita ambil semua acara dahulu
            // Anda boleh tambah logic filter jika perlu
            events.push({ id: doc.id, ...data });
        });
        return events;

    } catch (error) {
        console.error("Ralat Acara:", error);
        throw error;
    }
}

/**
 * 5. Mendapatkan Senarai Peserta Berdaftar (Ikut Rumah)
 */
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
        throw error;
    }
}
