export async function generateJudgeSheet(eventData, participants) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Tajuk Borang
    doc.setFontSize(16);
    doc.text(`BORANG HAKIM: ${eventData.nama.toUpperCase()}`, 10, 10);
    doc.setFontSize(12);
    doc.text(`Kategori: ${eventData.kategori} | Status: ${eventData.status}`, 10, 20);
    doc.line(10, 25, 200, 25);

    // Header Jadual
    let y = 35;
    doc.text("No", 10, y);
    doc.text("Nama Peserta", 30, y);
    doc.text("Rumah", 100, y);
    doc.text("Keputusan", 150, y);
    
    doc.line(10, y + 2, 200, y + 2);
    y += 10;

    // Isi Peserta
    participants.forEach((p, index) => {
        doc.text(`${index + 1}`, 10, y);
        doc.text(`${p.nama}`, 30, y);
        doc.text(`${p.idRumah || p.rumah}`, 100, y);
        doc.rect(150, y - 5, 40, 8); // Kotak untuk hakim tulis tangan
        y += 10;
    });

    doc.save(`Borang_${eventData.nama}_${eventData.kategori}.pdf`);
}