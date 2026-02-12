// Pastikan path ini betul mengikut struktur folder anda
import { db } from '../firebase-config.js'; 
import { 
    collection, 
    doc, 
    setDoc, 
    updateDoc, 
    deleteDoc,
    getDocs, 
    query, 
    where 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// =========================================================
// 1. DAFTAR PESERTA BARU
// =========================================================
export async function registerParticipant(tahun, data) {
    try {
        // Validation data asas
        if (!tahun || !data) throw new Error("Data tahun atau peserta tidak lengkap.");

        // Guna doc() tanpa ID untuk auto-generate ID
        const pesertaRef = doc(collection(db, "sukantara", tahun, "peserta"));
        
        const dataLengkap = {
            ...data,
            id: pesertaRef.id // Simpan ID dalam dokumen juga
        };

        await setDoc(pesertaRef, dataLengkap);
        return { success: true, id: pesertaRef.id };

    } catch (error) {
        console.error("DEBUG - Ralat Register:", error);
        throw error;
    }
}

// =========================================================
// 2. KEMASKINI DATA PESERTA
// =========================================================
export async function updateParticipant(tahun, docId, data) {
    try {
        const pesertaRef = doc(db, "sukantara", tahun, "peserta", docId);
        await updateDoc(pesertaRef, data);
        return { success: true };
    } catch (error) {
        console.error("DEBUG - Ralat Update:", error);
        throw error;
    }
}

// =========================================================
// 3. PADAM PESERTA
// =========================================================
export async function deleteParticipant(tahun, docId) {
    try {
        if (!docId) throw new Error("ID Peserta diperlukan.");
        
        const pesertaRef = doc(db, "sukantara", tahun, "peserta", docId);
        await deleteDoc(pesertaRef);
        return { success: true };
    } catch (error) {
        console.error("DEBUG - Ralat Delete:", error);
        throw error;
    }
}

// =========================================================
// 4. DAPATKAN SENARAI ACARA
// =========================================================
export async function getEventsByCategory(tahun, kategori) {
    try {
        const colRef = collection(db, "sukantara", tahun, "acara");
        const snapshot = await getDocs(colRef);
        
        let events = [];
        snapshot.forEach((doc) => {
            events.push({ id: doc.id, ...doc.data() });
        });
        return events;

    } catch (error) {
        console.error("DEBUG - Ralat Get Acara:", error);
        throw new Error("Gagal memuatkan senarai acara.");
    }
}

// =========================================================
// 5. DAPATKAN PESERTA (PUNCA RALAT ANDA)
// =========================================================
export async function getRegisteredParticipants(tahun, idRumah) {
    // 1. Debugging Log - Lihat di Console Browser
    console.log(`DEBUG: Meminta data peserta... Tahun: ${tahun}, ID Rumah: ${idRumah}`);

    try {
        // Validasi input
        if (!tahun) throw new Error("Tahun tidak ditemui (Undefined).");
        if (!idRumah) throw new Error("ID Rumah tidak ditemui.");
        if (!db) throw new Error("Sambungan DB (firebase-config) gagal.");

        // 2. Setup Query
        // Pastikan path: sukantara -> [tahun] -> peserta
        const colRef = collection(db, "sukantara", tahun, "peserta");
        const q = query(colRef, where("idRumah", "==", idRumah));

        // 3. Execute
        const snapshot = await getDocs(q);
        
        let list = [];
        snapshot.forEach((doc) => {
            list.push({ id: doc.id, ...doc.data() });
        });

        console.log(`DEBUG: Berjaya dapat ${list.length} peserta.`);
        return list;

    } catch (error) {
        // Ini akan paparkan ralat sebenar dari Firebase di console
        console.error("CRITICAL ERROR (getRegisteredParticipants):", error);
        
        // Buang mesej custom, kita mahu lihat error asal dulu
        throw new Error(error.message); 
    }
}
