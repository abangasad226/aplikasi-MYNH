import "@/app/rapor/[id]/rapor.css";
import type { JenisKegiatan } from "@/lib/api-types";
import { KATEGORI_MAPEL_LABEL, KEGIATAN_RAPOR_LABEL, type KategoriMapel, type RaporDetail } from "@/lib/akademik-types";

function tanggal(value: string) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "Asia/Jakarta" }).format(new Date(value));
}

export function RaporDocument({ rapor }: { rapor: RaporDetail }) {
  const { isi } = rapor;
  return (
    <article className="rapor-document mx-auto max-w-[210mm] bg-white p-5 text-slate-900 sm:p-9">
      <header className="border-b-4 border-double border-slate-700 pb-5 text-center flex items-center justify-between px-4">
        <div className="w-16 h-16 shrink-0 flex items-center justify-center">
          <img src="/images/logo-pesantren.png" alt="Logo" className="h-14 w-14 object-contain" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
        </div>
        <div className="flex-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.15em]">Pondok Pesantren</p>
          <h1 className="mt-1 text-2xl font-bold uppercase">Nurul Huda Pangauban</h1>
          <p className="text-[11px] text-slate-600">MyNurulHuda — Sistem Digitalisasi Pondok Pesantren Nurul Huda Pangauban</p>
          <p className="mt-2 text-sm font-semibold">LAPORAN HASIL BELAJAR SANTRI</p>
          <p className="text-sm">Semester {rapor.semester === "GANJIL" ? "Ganjil" : "Genap"} · Tahun Ajaran {rapor.tahunAjaran}</p>
        </div>
        <div className="w-16"></div>
      </header>
      {rapor.statusRapor === "DRAFT" && <p className="my-4 border-2 border-dashed border-amber-600 p-2 text-center font-bold text-amber-800">DRAFT — BELUM DITERBITKAN</p>}
      <section className="my-6 flex items-start justify-between gap-5">
        <dl className="grid flex-1 grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt>Nama Santri</dt><dd className="font-semibold">{isi.santri.name}</dd>
          <dt>NIS / NISN</dt><dd>{isi.santri.nis} / {isi.santri.nisn || "—"}</dd>
          <dt>Kelas</dt><dd>{isi.santri.kelas}</dd>
          <dt>Tempat, Tanggal Lahir</dt><dd>{isi.santri.tempatLahir}, {tanggal(isi.santri.tanggalLahir)}</dd>
          <dt>Orang Tua / Wali</dt><dd>{isi.santri.namaWali}</dd>
        </dl>
        <div className="flex h-28 w-20 shrink-0 items-center justify-center overflow-hidden border border-slate-300 bg-slate-50 text-center text-xs text-slate-400">
          {isi.santri.fotoSantriUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={isi.santri.fotoSantriUrl} alt={`Foto ${isi.santri.name}`} className="h-full w-full object-cover" />
          ) : "Foto Santri"}
        </div>
      </section>
      {(Object.keys(KATEGORI_MAPEL_LABEL) as KategoriMapel[]).map((kategori) => {
        const rows = isi.nilai.filter((row) => row.mapel.kategori === kategori);
        return <section className="mb-5" key={kategori}>
          <h2 className="mb-2 text-sm font-bold">{KATEGORI_MAPEL_LABEL[kategori]}</h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead><tr><th>No.</th><th className="text-left">Mata Pelajaran / Kitab</th><th>KKM</th><th>Harian</th><th>UTS</th><th>UAS</th><th>Akhir</th><th>Predikat</th><th>Ketuntasan</th></tr></thead>
              <tbody>{rows.length ? rows.map((row, index) => <tr key={row.id}><td>{index + 1}</td><td className="text-left"><span className="font-semibold">{row.mapel.namaMapel}</span><span className="block text-[10px]">{row.mapel.pengampu.namaLengkap}</span>{row.catatanGuru && <span className="mt-1 block whitespace-pre-wrap text-[10px]">{row.catatanGuru}</span>}</td><td>{row.mapel.kkm}</td><td>{row.nilaiHarian}</td><td>{row.nilaiUTS}</td><td>{row.nilaiUAS}</td><td className="font-bold">{row.nilaiAkhir.toFixed(2)}</td><td>{row.predikat}</td><td>{row.tuntas ? "Tuntas" : "Belum tuntas"}</td></tr>) : <tr><td colSpan={9}>Belum ada nilai untuk kategori ini.</td></tr>}</tbody>
            </table>
          </div>
        </section>;
      })}
      <p className="mb-5 text-[10px] text-slate-600">Nilai akhir = (Harian + UTS + UAS) ÷ 3. Predikat A ≥ 90; B ≥ 80; C ≥ 70; D &lt; 70. Ketuntasan mengikuti KKM masing-masing pelajaran.</p>
      <section className="mb-5">
        <h2 className="mb-1 text-sm font-bold">Rekap Kehadiran Semester</h2>
        <p className="mb-2 text-[10px] text-slate-600">{tanggal(isi.periode.mulai)} – {tanggal(isi.periode.selesai)}. Jumlah catatan kegiatan, bukan jumlah hari; mencakup seluruh log absensi pada periode ini.</p>
        <table className="w-full border-collapse text-xs"><thead><tr><th className="text-left">Kegiatan</th><th>Hadir</th><th>Sakit</th><th>Izin</th><th>Alpa</th><th>Total</th></tr></thead><tbody>{(Object.keys(KEGIATAN_RAPOR_LABEL) as JenisKegiatan[]).map((key) => <tr key={key}><td className="text-left">{KEGIATAN_RAPOR_LABEL[key]}</td><td>{isi.absensi[key].HADIR}</td><td>{isi.absensi[key].SAKIT}</td><td>{isi.absensi[key].IZIN}</td><td>{isi.absensi[key].ALPA}</td><td>{isi.absensi[key].total}</td></tr>)}<tr className="font-bold"><td className="text-left">Total</td><td>{isi.totalAbsensi.HADIR}</td><td>{isi.totalAbsensi.SAKIT}</td><td>{isi.totalAbsensi.IZIN}</td><td>{isi.totalAbsensi.ALPA}</td><td>{isi.totalAbsensi.total}</td></tr></tbody></table>
      </section>
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold">Catatan Kedisiplinan · Total {isi.totalPoin} Poin</h2>
        {isi.pelanggaran.length ? <table className="w-full border-collapse text-xs"><thead><tr><th>Tanggal</th><th>Catatan / Kategori</th><th>Poin</th><th>Pembinaan</th></tr></thead><tbody>{isi.pelanggaran.map((row, i) => <tr key={i}><td>{tanggal(row.tanggal)}</td><td className="text-left whitespace-pre-wrap">{row.deskripsi} ({row.kategori})</td><td>{row.poin}</td><td className="text-left whitespace-pre-wrap">{row.tindakan}</td></tr>)}</tbody></table> : <p className="text-xs">Tidak ada catatan pelanggaran pada semester ini.</p>}
      </section>
      <section className="rapor-notes mb-5 border border-slate-300 p-3 text-sm">
        <h2 className="font-bold">Catatan Wali Kelas</h2><p className="mt-1 whitespace-pre-wrap">{rapor.catatanWaliKelas || "—"}</p>
        <h2 className="mt-3 font-bold">Keputusan Kenaikan / Kelulusan</h2><p className="mt-1 whitespace-pre-wrap">{rapor.keputusanKenaikan || "Belum ditetapkan"}</p>
      </section>
      <section className="rapor-signatures text-center text-sm">
        <p className="mb-5 text-right">Pangauban, {rapor.tanggalTerbit ? tanggal(rapor.tanggalTerbit) : "……………………"}</p>
        <div className="grid grid-cols-3 gap-6"><div>Orang Tua / Wali<p className="mt-20">({isi.santri.namaWali})</p></div><div>Wali Kelas<p className="mt-20">(……………………)</p></div><div>Pengasuh<p className="mt-20">(……………………)</p></div></div>
      </section>
      <footer className="mt-6 text-center text-[9px] text-slate-500">{rapor.statusRapor === "DITERBITKAN" ? `Rapor diterbitkan · ${rapor.id}` : "Pratinjau rapor — bukan dokumen resmi"}</footer>
    </article>
  );
}
