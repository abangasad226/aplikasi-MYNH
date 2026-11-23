
import { useEffect, useState } from "react";

import { Field, SelectInput } from "./form-fields";

type Wilayah = { code: string; name: string };
type Level = "provinces" | "regencies" | "districts" | "villages";

async function getWilayah(level: Level, parent?: string): Promise<Wilayah[]> {
  const query = parent ? `?parent=${encodeURIComponent(parent)}` : "";
  const response = await fetch(`/api/wilayah/${level}${query}`);
  if (!response.ok) throw new Error("Daftar wilayah gagal dimuat.");
  const result: unknown = await response.json();
  if (!result || typeof result !== "object" || !("data" in result) || !Array.isArray(result.data)) {
    throw new Error("Format daftar wilayah tidak valid.");
  }
  return result.data as Wilayah[];
}

function matching(items: Wilayah[], name: string) {
  return items.find((item) => item.name.localeCompare(name.trim(), "id", { sensitivity: "base" }) === 0);
}

export function AddressSelectors({
  provinsi,
  kabupatenKota,
  kecamatan,
  desaKelurahan,
  onChange,
}: {
  provinsi: string;
  kabupatenKota: string;
  kecamatan: string;
  desaKelurahan: string;
  onChange: (field: "provinsi" | "kabupatenKota" | "kecamatan" | "desaKelurahan", value: string) => void;
}) {
  const [provinces, setProvinces] = useState<Wilayah[]>([]);
  const [regencies, setRegencies] = useState<Wilayah[]>([]);
  const [districts, setDistricts] = useState<Wilayah[]>([]);
  const [villages, setVillages] = useState<Wilayah[]>([]);
  const [provinceCode, setProvinceCode] = useState("");
  const [regencyCode, setRegencyCode] = useState("");
  const [districtCode, setDistrictCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const provinceItems = await getWilayah("provinces");
        if (!active) return;
        setProvinces(provinceItems);
        const province = matching(provinceItems, provinsi);
        if (!province) return;
        setProvinceCode(province.code);

        const regencyItems = await getWilayah("regencies", province.code);
        if (!active) return;
        setRegencies(regencyItems);
        const regency = matching(regencyItems, kabupatenKota);
        if (!regency) return;
        setRegencyCode(regency.code);

        const districtItems = await getWilayah("districts", regency.code);
        if (!active) return;
        setDistricts(districtItems);
        const district = matching(districtItems, kecamatan);
        if (!district) return;
        setDistrictCode(district.code);

        const villageItems = await getWilayah("villages", district.code);
        if (!active) return;
        setVillages(villageItems);
      } catch {
        if (active) setError("Pilihan wilayah belum dapat dimuat. Periksa koneksi lalu muat ulang formulir.");
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  async function loadChildren(level: Level, parent: string, setItems: (items: Wilayah[]) => void) {
    try {
      setError("");
      setItems(await getWilayah(level, parent));
    } catch {
      setError("Pilihan wilayah belum dapat dimuat. Periksa koneksi lalu coba lagi.");
      setItems([]);
    }
  }

  return (
    <>
      <Field label="Provinsi" htmlFor="provinsi" required>
        <SelectInput id="provinsi" required value={provinceCode} onChange={(event) => {
          const item = provinces.find((option) => option.code === event.target.value);
          setProvinceCode(item?.code ?? "");
          setRegencyCode(""); setDistrictCode("");
          setRegencies([]); setDistricts([]); setVillages([]);
          onChange("provinsi", item?.name ?? "");
          onChange("kabupatenKota", ""); onChange("kecamatan", ""); onChange("desaKelurahan", "");
          if (item) void loadChildren("regencies", item.code, setRegencies);
        }}>
          <option value="">— Pilih provinsi terlebih dahulu —</option>
          {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Kabupaten / Kota" htmlFor="kabupatenKota" required>
        <SelectInput id="kabupatenKota" required disabled={!provinceCode} value={regencyCode} onChange={(event) => {
          const item = regencies.find((option) => option.code === event.target.value);
          setRegencyCode(item?.code ?? ""); setDistrictCode("");
          setDistricts([]); setVillages([]);
          onChange("kabupatenKota", item?.name ?? ""); onChange("kecamatan", ""); onChange("desaKelurahan", "");
          if (item) void loadChildren("districts", item.code, setDistricts);
        }}>
          <option value="">— Pilih kabupaten / kota —</option>
          {regencies.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Kecamatan" htmlFor="kecamatan" required>
        <SelectInput id="kecamatan" required disabled={!regencyCode} value={districtCode} onChange={(event) => {
          const item = districts.find((option) => option.code === event.target.value);
          setDistrictCode(item?.code ?? ""); setVillages([]);
          onChange("kecamatan", item?.name ?? ""); onChange("desaKelurahan", "");
          if (item) void loadChildren("villages", item.code, setVillages);
        }}>
          <option value="">— Pilih kecamatan —</option>
          {districts.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </SelectInput>
      </Field>
      <Field label="Desa / Kelurahan" htmlFor="desaKelurahan" required>
        <SelectInput id="desaKelurahan" required disabled={!districtCode} value={matching(villages, desaKelurahan)?.code ?? ""} onChange={(event) => {
          const item = villages.find((option) => option.code === event.target.value);
          onChange("desaKelurahan", item?.name ?? "");
        }}>
          <option value="">— Pilih desa / kelurahan —</option>
          {villages.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </SelectInput>
      </Field>
      {error ? <p role="alert" className="sm:col-span-2 text-xs text-rose-700">{error}</p> : null}
    </>
  );
}
