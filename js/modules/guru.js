import { db } from '../firebase-config.js'; 
import { 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc, 
    deleteDoc,
    orderBy // Ditambah untuk susunan
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// ============================================================================
// 1. DAFTAR PESERTA BARU
// ============================================================================
export async function registerParticipant(tahun, data) {
    try {
        // Rujukan ke koleksi peserta dalam tahun kejohanan
        const pesertaRef = doc(collection(db, "kejohanan", tahun, "peserta"));
        
        // Gabungkan data dengan ID yang dijana
        const dataLengkap = { 
            ...data, 
            id: pesertaRef.id,
            tarikhDaftar: new Date().toISOString() // Pastikan ada timestamp
        };

        // Simpan ke database
        // PENTING: Fungsi ini HANYA simpan data peribadi. 
        // Ia TIDAK mencipta saringan/lorong (itu kerja Admin nanti).
        await setDoc(pesertaRef, dataLengkap);
        
        return { success: true, id: pesertaRef.id };
    } catch (error) {
        console.error("Ralat Daftar Peserta:", error);
        throw error;
    }
}

// ============================================================================
// 2. KEMASKINI DATA PESERTA
// ============================================================================
export async function updateParticipant(tahun, docId, data) {
    try {
        const pesertaRef = doc(db, "kejohanan", tahun, "peserta", docId);
        
        // Update data sedia ada
        await updateDoc(pesertaRef, {
            ...data,
            tarikhKemaskini: new Date().toISOString()
        });
        
        return { success: true };
    } catch (error) {
        console.error("Ralat Kemaskini Peserta:", error);
        throw error;
    }
}

// ============================================================================
// 3. PADAM PESERTA
// ============================================================================
export async function deleteParticipant(tahun, docId) {
    try {
        const pesertaRef = doc(db, "kejohanan", tahun, "peserta", docId);
        await deleteDoc(pesertaRef);
        return { success: true };
    } catch (error) {
        console.error("Ralat Padam Peserta:", error);
        throw error;
    }
}

// ============================================================================
// 4. DAPATKAN SENARAI ACARA (MENGIKUT KATEGORI)
// ============================================================================
export async function getEventsByCategory(tahun, kategori) {
    try {
        // Kita tapis terus dari database supaya ringan
        // Cari acara dalam tahun tersebut yang field 'kategori' == kategori atlet (cth: "L18")
        const eventsRef = collection(db, "kejohanan", tahun, "acara");
        const q = query(eventsRef, where("kategori", "==", kategori));
        
        const snapshot = await getDocs(q);
        let events = [];
        
        snapshot.forEach((doc) => {
            events.push({ id: doc.id, ...doc.data() });
        });
        
        // Susun acara mengikut nama (A-Z)
        events.sort((a, b) => a.nama.localeCompare(b.nama));

        return events;
    } catch (error) {
        console.error("Ralat Dapatkan Acara:", error);
        throw error;
    }
}

// ============================================================================
// 5. DAPATKAN SENARAI PESERTA RUMAH SUKAN (Untuk Table)
// ============================================================================
export async function getRegisteredParticipants(tahun, idRumah) {
    try {
        const q = query(
            collection(db, "kejohanan", tahun, "peserta"),
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
