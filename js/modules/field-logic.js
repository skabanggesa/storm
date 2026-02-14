export const fieldLogic = {
    // 1. Cari jarak/tinggi terbaik daripada array cubaan
    calculateBest(trials) {
        // Cth: trials = [4.5, 5.2, 4.8]
        const validTrials = trials.filter(t => typeof t === 'number' && t > 0);
        return validTrials.length > 0 ? Math.max(...validTrials) : 0;
    },

    // 2. Fungsi utiliti: Susun semua cubaan dari paling jauh ke paling dekat
    getSortedTrials(trials) {
        return trials.filter(t => typeof t === 'number' && t > 0).sort((a, b) => b - a);
    },

    // 3. Susun pemenang berdasarkan jarak terbaik & pemecah seri
    rankParticipants(participants) {
        // Langkah A: Masukkan data 'terbaik' dan 'sortedCubaan' (untuk pemecah seri)
        const pWithStats = participants.map(p => ({
            ...p,
            terbaik: this.calculateBest(p.cubaan),
            sortedCubaan: this.getSortedTrials(p.cubaan)
        }));

        // Langkah B: Sort peserta
        pWithStats.sort((a, b) => {
            // Jika jarak terbaik tak sama, susun macam biasa (paling jauh di atas)
            if (b.terbaik !== a.terbaik) {
                return b.terbaik - a.terbaik; 
            }
            
            // JIKA SERI: Semak cubaan ke-2 terbaik, ke-3 terbaik, dsb.
            const maxTrials = Math.max(a.sortedCubaan.length, b.sortedCubaan.length);
            for (let i = 1; i < maxTrials; i++) { // Bermula dari index 1 (cubaan ke-2)
                const aNextBest = a.sortedCubaan[i] || 0;
                const bNextBest = b.sortedCubaan[i] || 0;
                
                if (bNextBest !== aNextBest) {
                    return bNextBest - aNextBest; // Siapa baling/lompat lebih jauh menang
                }
            }
            return 0; // Jika semua cubaan sebiji sama, barulah betul-betul seri
        });

        // Langkah C: Berikan nombor kedudukan (ranking)
        let currentRank = 1;
        return pWithStats.map((p, index, arr) => {
            if (index > 0) {
                const prev = arr[index - 1];
                // Semak adakah peserta ini betul-betul seri dengan peserta di atasnya
                const isTie = p.terbaik === prev.terbaik && 
                              JSON.stringify(p.sortedCubaan) === JSON.stringify(prev.sortedCubaan);
                
                // Jika tak seri, nombor kedudukan ikut index + 1
                // Jika seri, dia akan kongsi nombor currentRank yang sama
                if (!isTie) {
                    currentRank = index + 1;
                }
            }
            return {
                ...p,
                kedudukan: currentRank
            };
        });
    }
};
