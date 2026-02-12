// =========================================================
// FAIL: js/modules/guru.js
// PEMBETULAN: Menukar "sukantara" kepada "kejohanan"
// =========================================================

import { db } from '../firebase-config.js'; 
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
        // PERUBAHAN DI SINI: Guna "kejohanan", bukan "sukantara"
        const pesertaRef = doc(collection(db, "kejohanan", tahun, "peserta"));
        
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
        // PERUBAHAN DI SINI
        const pesertaRef = doc(db, "kejohanan", tahun, "peserta", docId);
        await updateDoc(pesertaRef, data);
        return { success: true };
    } catch (error) {
        console.error("Ralat Update:", error);
        throw error;
    }
}

// 3. PADAM PESERTA
export async function deleteParticipant(tahun, docId) {
    try {
        // PERUBAHAN DI SINI
        const pesertaRef = doc(db, "kejohanan", tahun, "peserta", docId);
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
        // PERUBAHAN DI SINI (Pastikan folder acara juga ada dalam "kejohanan")
        const q = query(collection(db, "kejohanan", tahun, "acara"));
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
        // PERUBAHAN DI SINI: "kejohanan"
        const q = query(
            collection(db, "kejohanan", tahun, "peserta"),
            where("idRumah", "==", idRumah)
        );

        const snapshot = await getDocs(q);
        let list = [];
        
        console.log(`DEBUG: Mencari di kejohanan/${tahun}/peserta untuk rumah ${idRumah}`); // Debug log
        
        snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() });
        });
        
        console.log(`DEBUG: Jumpa ${list.length} data.`); // Debug log
        return list;

    } catch (error) {
        console.error("Ralat Senarai Peserta:", error);
        throw error;
    }
}
