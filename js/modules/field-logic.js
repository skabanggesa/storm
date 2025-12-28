export const fieldLogic = {
    // Cari jarak/tinggi terbaik daripada array cubaan
    calculateBest(trials) {
        // trials = [4.5, 5.2, 4.8]
        const validTrials = trials.filter(t => typeof t === 'number' && t > 0);
        return validTrials.length > 0 ? Math.max(...validTrials) : 0;
    },

    // Susun pemenang berdasarkan jarak terbaik
    rankParticipants(participants) {
        return participants
            .map(p => ({
                ...p,
                terbaik: this.calculateBest(p.cubaan)
            }))
            .sort((a, b) => b.terbaik - a.terbaik)
            .map((p, index) => ({
                ...p,
                kedudukan: index + 1
            }));
    }
};