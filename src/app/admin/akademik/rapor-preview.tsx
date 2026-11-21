"use client";

import { useState, type FormEvent } from "react";
import { LockKeyhole, Printer, RefreshCw, RotateCcw, Save, Send } from "lucide-react";
import { RaporDocument } from "@/components/rapor-document";
import { Alert, Badge, Button, Card, ErrorBanner, Modal } from "@/components/ui";
import type { PeriodeAkademik, RaporDetail, StatusRapor } from "@/lib/akademik-types";
import { apiFetch, toErrorMessage } from "@/lib/client-api";
import { Field, LoadingState, confirmDiscard, inputClass, useApiResource, usePanelActivity, type PanelActivity } from "./akademik-ui";

interface PreviewProps extends PeriodeAkademik, PanelActivity {
  santriId: string;
  onSaved: (detail: RaporDetail) => void;
}

export function RaporPreview({ santriId, semester, tahunAjaran, onSaved, ...activity }: PreviewProps) {
  const [revision, setRevision] = useState(0);
  const query = new URLSearchParams({ santriId, semester, tahunAjaran });
  const resource = useApiResource<{ item: RaporDetail }>(`/api/admin/akademik/rapor/preview?${query.toString()}`, revision);
  if (resource.loading) return <LoadingState label="Menyusun nilai, absensi, dan kedisiplinan semester…" />;
  if (resource.error) return <ErrorBanner title="Pratinjau rapor tidak tersedia" message={resource.error} onRetry={() => setRevision((value) => value + 1)} />;
  if (!resource.data) return null;
  const detail = resource.data.item;
  // A save is only possible for a preview belonging to this exact selection.
  if (detail.isi.santri.id !== santriId || detail.semester !== semester || detail.tahunAjaran !== tahunAjaran) {
    return <ErrorBanner title="Periode rapor tidak sesuai" message="Data yang diterima tidak sesuai dengan santri atau periode yang dipilih. Muat ulang pratinjau sebelum menyimpan." onRetry={() => setRevision((value) => value + 1)} />;
  }
  return <RaporEditor key={revision} initial={detail} onSaved={onSaved} onReload={() => setRevision((value) => value + 1)} {...activity} />;
}

function RaporEditor({ initial, onSaved, onReload, ...activity }: {
  initial: RaporDetail;
  onSaved: (detail: RaporDetail) => void;
  onReload: () => void;
} & PanelActivity) {
  const [rapor, setRapor] = useState(initial);
  const [notes, setNotes] = useState(initial.catatanWaliKelas);
  const [decision, setDecision] = useState(initial.keputusanKenaikan);
  const [busy, setBusy] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<StatusRapor | null>(null);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const published = rapor.statusRapor === "DITERBITKAN";
  const dirty = notes !== rapor.catatanWaliKelas || decision !== rapor.keputusanKenaikan;
  const hasGrades = rapor.isi.nilai.length > 0;
  const canPublish = hasGrades && decision.trim().length > 0;
  usePanelActivity(busy, dirty, activity);

  async function persist(statusRapor: StatusRapor, withdrawal = false) {
    if (busy || (published && !withdrawal) || (withdrawal && (!published || statusRapor !== "DRAFT"))) return;
    const catatanWaliKelas = withdrawal ? rapor.catatanWaliKelas : notes.trim();
    const keputusanKenaikan = withdrawal ? rapor.keputusanKenaikan : decision.trim();
    setError(null);
    setSuccess(null);
    if (statusRapor === "DITERBITKAN" && (!hasGrades || !keputusanKenaikan)) {
      setError("Penerbitan memerlukan minimal satu nilai mapel dan keputusan kenaikan / hasil semester yang sudah diisi.");
      return;
    }
    if (catatanWaliKelas.length > 4000 || keputusanKenaikan.length > 200) {
      setError("Catatan wali kelas maksimal 4.000 karakter dan keputusan kenaikan maksimal 200 karakter.");
      return;
    }
    setBusy(true);
    setPendingStatus(statusRapor);
    try {
      const { item } = await apiFetch<{ item: RaporDetail }>("/api/admin/akademik/rapor", {
        method: "PUT",
        body: JSON.stringify({ santriId: rapor.isi.santri.id, semester: rapor.semester, tahunAjaran: rapor.tahunAjaran, catatanWaliKelas, keputusanKenaikan, statusRapor }),
      });
      setRapor(item);
      setNotes(item.catatanWaliKelas);
      setDecision(item.keputusanKenaikan);
      setWithdrawOpen(false);
      setSuccess(withdrawal ? "Rapor ditarik ke DRAFT dan tidak lagi ditampilkan kepada wali santri. Nilai dan catatan kini dapat diedit." : statusRapor === "DITERBITKAN" ? "Rapor berhasil diterbitkan kepada wali santri. Nilai dan catatan kini dikunci." : "Draft rapor berhasil disimpan. Draft belum ditampilkan kepada wali santri.");
      onSaved(item);
    } catch (caught) {
      setError(toErrorMessage(caught));
    } finally {
      setBusy(false);
      setPendingStatus(null);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const status = submitter?.value === "DITERBITKAN" ? "DITERBITKAN" : "DRAFT";
    void persist(status);
  }

  const preview: RaporDetail = published ? rapor : { ...rapor, catatanWaliKelas: notes, keputusanKenaikan: decision };

  return (
    <div className="space-y-4">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><div className="mb-2 flex flex-wrap gap-2"><Badge tone={published ? "emerald" : "amber"}>{published ? "DITERBITKAN" : "DRAFT"}</Badge>{!rapor.id ? <Badge>Belum disimpan</Badge> : null}{dirty ? <Badge tone="amber">Perubahan belum disimpan</Badge> : null}</div><h4 className="text-lg font-semibold">Rapor {rapor.isi.santri.name}</h4><p className="mt-1 text-xs leading-5 text-slate-500">NIS {rapor.isi.santri.nis} · Kelas {rapor.isi.santri.kelas} · {rapor.semester === "GANJIL" ? "Ganjil" : "Genap"} {rapor.tahunAjaran}</p></div>
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => { if (confirmDiscard(dirty)) onReload(); }}><RefreshCw aria-hidden="true" size={15} />Muat ulang</Button>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4"><div><p className="text-xs text-slate-500">Mapel bernilai</p><p className="mt-1 text-xl font-bold tabular-nums">{rapor.isi.nilai.length}</p></div><div><p className="text-xs text-slate-500">Pelanggaran</p><p className="mt-1 text-xl font-bold tabular-nums">{rapor.isi.pelanggaran.length}</p></div><div><p className="text-xs text-slate-500">Poin kedisiplinan</p><p className="mt-1 text-xl font-bold tabular-nums">{rapor.isi.totalPoin}</p></div></div>
      </Card>
      {success ? <Alert tone="emerald" title="Berhasil">{success}</Alert> : null}
      {error && !withdrawOpen ? <ErrorBanner title="Rapor belum diperbarui" message={error} /> : null}
      {published ? <Alert tone="emerald" icon={LockKeyhole} title="Rapor sudah diterbitkan">Rapor tersedia untuk wali santri. Nilai, catatan wali kelas, dan keputusan kenaikan tidak dapat diubah langsung. Gunakan “Tarik ke Draft” terlebih dahulu.</Alert> : <Alert tone="amber" title="DRAFT — belum diterbitkan">Rapor ini belum ditampilkan kepada wali santri. Periksa nilai, rekap kehadiran, dan kedisiplinan sebelum menerbitkan.</Alert>}
      {!hasGrades ? <Alert tone="amber" title="Belum ada nilai semester">Draft tetap dapat disimpan, tetapi belum dapat diterbitkan. Lengkapi minimal satu nilai di tab Input Nilai Massal, lalu muat ulang pratinjau.</Alert> : null}
      <Card className="p-4 sm:p-5">
        <form onSubmit={submit} className="space-y-4">
          <h4 className="font-semibold">Catatan & keputusan wali kelas</h4>
          <fieldset disabled={busy || published} className="space-y-4">
            <Field label="Catatan wali kelas" hint="Opsional, maksimal 4.000 karakter."><textarea rows={4} maxLength={4000} value={notes} onChange={(event) => { setNotes(event.target.value); setSuccess(null); setError(null); }} className={`${inputClass} resize-y`} placeholder="Tuliskan perkembangan, apresiasi, atau arahan untuk santri…" /></Field>
            <Field label="Keputusan kenaikan / hasil semester" hint="Wajib sebelum diterbitkan. Untuk semester ganjil, dapat diisi “Melanjutkan ke semester genap”. Maksimal 200 karakter."><input maxLength={200} value={decision} onChange={(event) => { setDecision(event.target.value); setSuccess(null); setError(null); }} className={inputClass} placeholder="Contoh: Naik ke kelas VIII / Melanjutkan ke semester genap" /></Field>
          </fieldset>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {published ? <Button variant="amber" disabled={busy} onClick={() => { setError(null); setWithdrawOpen(true); }}><RotateCcw aria-hidden="true" size={16} />Tarik ke Draft</Button> : <><Button type="submit" name="statusRapor" value="DRAFT" variant="secondary" disabled={busy} loading={busy && pendingStatus === "DRAFT"}><Save aria-hidden="true" size={16} />Simpan draft</Button><Button type="submit" name="statusRapor" value="DITERBITKAN" disabled={busy || !canPublish} loading={busy && pendingStatus === "DITERBITKAN"}><Send aria-hidden="true" size={16} />Terbitkan rapor</Button></>}
          </div>
          {!published ? <p className="text-xs leading-5 text-slate-500">{!decision.trim() ? "Isi keputusan kenaikan / hasil semester untuk mengaktifkan penerbitan. " : ""}Penerbitan menyimpan perubahan, menampilkan rapor kepada wali santri, dan mengunci seluruh nilai pada semester ini.</p> : null}
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <div><h4 className="font-semibold">Pratinjau rapor semester</h4><p className="mt-1 text-xs leading-5 text-slate-500">Nilai, absensi, dan kedisiplinan dalam satu dokumen.</p></div>
          {rapor.id ? <a href={`/rapor/${encodeURIComponent(rapor.id)}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><Printer aria-hidden="true" size={16} />Cetak / Unduh PDF<span className="sr-only"> (tab baru)</span></a> : <Button variant="secondary" size="sm" disabled title="Simpan draft terlebih dahulu untuk mencetak"><Printer aria-hidden="true" size={16} />Cetak / Unduh PDF</Button>}
          <p className="w-full text-xs leading-5 text-slate-500">{!rapor.id ? "Simpan draft terlebih dahulu agar tautan cetak tersedia. " : "Tautan cetak membuka versi tersimpan di tab baru. "}Gunakan menu Cetak pada halaman tersebut, lalu pilih “Simpan sebagai PDF / Save as PDF” di browser.{dirty ? <span className="block font-semibold text-amber-700">Pratinjau di bawah memuat catatan yang belum disimpan; cetak tetap menggunakan versi terakhir yang tersimpan.</span> : null}</p>
        </div>
        <div className="overflow-x-auto bg-white p-3 sm:p-5"><RaporDocument rapor={preview} /></div>
      </Card>
      <Modal open={withdrawOpen} onClose={() => { if (!busy) setWithdrawOpen(false); }} title="Tarik rapor ke draft?" description={`${rapor.isi.santri.name} · ${rapor.semester === "GANJIL" ? "Ganjil" : "Genap"} ${rapor.tahunAjaran}`} footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setWithdrawOpen(false)}>Batal</Button><Button variant="amber" loading={busy} onClick={() => void persist("DRAFT", true)}>Ya, tarik ke draft</Button></div>}>
        <p className="text-sm leading-6 text-slate-600">Rapor akan dihapus dari tampilan wali santri. Nilai, catatan, dan keputusan kenaikan dapat diedit kembali. Terbitkan ulang setelah perbaikan agar wali dapat melihat rapor kembali.</p>
        {error ? <ErrorBanner className="mt-4" title="Penarikan belum berhasil" message={error} /> : null}
      </Modal>
    </div>
  );
}
