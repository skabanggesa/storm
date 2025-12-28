import { db } from '../firebase-config.js';
import { 
    collection, 
    query, 
    where, 
    getDocs, 
    addDoc,
    doc,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

/**
 * Mengambil senarai acara berdasarkan tahun dan kategori (L7-P12)
 */
export async function getEventsByCategory(tahun, kategori) {
    try {
        const acaraRef = collection(db, "kejohanan", tahun, "acara");
        const q = query(acaraRef, where("kategori", "==", kategori));
        const querySnapshot = await getDocs(q);
        
        let senaraiAcara = [];
        querySnapshot.forEach((doc) => {
            senaraiAcara.push({ id: doc.id, ...doc.data() });
        });
        
        return senaraiAcara.sort((a, b) => a.nama.localeCompare(b.nama));
    } catch (e) {
        console.error("Ralat ambil acara: ", e);
        return [];
    }
}

/**
 * Mendaftarkan peserta baru
 */
export async function registerParticipant(tahun, data) {
    try {
        const pesertaRef = collection(db, "kejohanan", tahun, "peserta");
        await addDoc(pesertaRef, {
            ...data,
            tarikhDaftar: new Date()
        });
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * Mengemaskini data peserta sedia ada
 */
export async function updateParticipant(tahun, id, data) {
    try {
        const docRef = doc(db, "kejohanan", tahun, "peserta", id);
        await updateDoc(docRef, {
            ...data,
            tarikhKemaskini: new Date()
        });
        return { success: true };
    } catch (e) {
        return { success: false, message: e.message };
    }
}

/**
 * Mengambil senarai atlet untuk rumah sukan tertentu
 */
export async function getRegisteredParticipants(tahun, idRumah) {
    try {
        const pesertaRef = collection(db, "kejohanan", tahun, "peserta");
        const q = query(pesertaRef, where("idRumah", "==", idRumah));
        const querySnapshot = await getDocs(q);
        
        let senarai = [];
        querySnapshot.forEach((doc) => {
            // Penting: Masukkan id dokumen untuk rujukan Edit
            senarai.push({ id: doc.id, ...doc.data() });
        });
        return senarai;
    } catch (e) {
        return [];
    }
}