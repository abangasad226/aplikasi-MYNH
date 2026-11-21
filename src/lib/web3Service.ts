// Server-only: modul ini memegang private key dan tidak boleh diimpor
// dari Client Component.
import {
  JenisTransaksi,
  MetodePembayaran,
  Web3SyncStatus,
  type TransaksiKeuangan,
} from "@prisma/client";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  keccak256,
  toUtf8Bytes,
  type TransactionResponse,
} from "ethers";

import { prisma } from "./prisma";

export const TREASURY_LEDGER_ABI = [
  "function catatTransaksi(string kodeTransaksi, bytes32 santriIdHash, uint8 jenisTransaksi, uint256 nominalRupiah)",
  "function verifikasiTransaksi(string kodeTransaksi) view returns (bool, (string, bytes32, uint8, uint256, uint256))",
  "function getTotalDanaKategori(uint8 jenisTransaksi) view returns (uint256)",
  "event TransaksiTercatat(string kodeTransaksi, bytes32 indexed santriIdHash, uint8 indexed jenisTransaksi, uint256 nominalRupiah, uint256 timestamp, address indexed dicatatOleh)",
] as const;

export const JENIS_TRANSAKSI_ON_CHAIN: Record<
  JenisTransaksi,
  number | null
> = {
  [JenisTransaksi.BAYAR_SPP]: 1,
  [JenisTransaksi.BAYAR_INFAQ_MAKAN]: 2,
  [JenisTransaksi.TOPUP_JAJAN]: 3,
  [JenisTransaksi.REDIRECT_JAJAN_KE_INFAQ]: 4,
  [JenisTransaksi.JAJAN_KANTIN]: 5,
  [JenisTransaksi.PENARIKAN_TUNAI]: null,
  [JenisTransaksi.REVERSAL_INFAQ_KE_JAJAN]: 6,
};

export type CatatTransaksiInput = {
  kodeTransaksi: string;
  santriId: string;
  jenisTransaksi: JenisTransaksi;
  nominal: bigint;
  metodePembayaran: MetodePembayaran;
  keterangan?: string;
  createdById: string;
};

export type Web3SyncResult = {
  id: string;
  status: Web3SyncStatus;
  txHashWeb3?: string;
  error?: string;
};

export type RetrySummary = {
  processed: number;
  synced: number;
  pending: number;
  failed: number;
  skipped: number;
};

export type KuitansiOnChain = {
  kodeTransaksi: string;
  santriIdHash: string;
  jenisTransaksi: number;
  nominalRupiah: bigint;
  timestamp: bigint;
};

export type VerifikasiKuitansiResult = {
  terverifikasi: boolean;
  record: KuitansiOnChain | null;
};

export class Web3LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Web3LedgerError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Web3LedgerError(`Environment variable ${name} belum diset.`);
  }

  return value;
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];

  if (!raw) {
    return fallback;
  }

  const value = Number.parseInt(raw, 10);

  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function truncate(value: string, maxLength = 1000): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}...`
    : value;
}

function toErrorMessage(error: unknown): string {
  return truncate(error instanceof Error ? error.message : String(error));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Web3LedgerError(`${label} timeout setelah ${timeoutMs} ms.`),
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

// Hash ID internal (cuid acak), bukan NIS berurutan yang mudah ditebak.
export function hashSantriId(santriId: string): string {
  const normalized = santriId.trim();

  if (!normalized) {
    throw new Web3LedgerError("santriId tidak boleh kosong.");
  }

  return keccak256(toUtf8Bytes(normalized));
}

export class Web3Service {
  private provider?: JsonRpcProvider;
  private readContract?: Contract;
  private writeContract?: Contract;
  private queue: Promise<unknown> = Promise.resolve();

  private readonly requestTimeoutMs = readPositiveInt(
    "WEB3_REQUEST_TIMEOUT_MS",
    7_000,
  );
  private readonly confirmTimeoutMs = readPositiveInt(
    "WEB3_CONFIRM_TIMEOUT_MS",
    15_000,
  );
  private readonly maxAttempts = readPositiveInt("WEB3_MAX_ATTEMPTS", 10);
  private readonly retryBatchSize = readPositiveInt(
    "WEB3_RETRY_BATCH_SIZE",
    10,
  );

  private runSerial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);

    this.queue = run.then(
      () => undefined,
      () => undefined,
    );

    return run;
  }

  private getProvider(): JsonRpcProvider {
    if (!this.provider) {
      this.provider = new JsonRpcProvider(requireEnv("RPC_URL"));
    }

    return this.provider;
  }

  private getReadContract(): Contract {
    if (!this.readContract) {
      this.readContract = new Contract(
        requireEnv("PESANTREN_TREASURY_ADDRESS"),
        TREASURY_LEDGER_ABI,
        this.getProvider(),
      );
    }

    return this.readContract;
  }

  private getWriteContract(): Contract {
    if (!this.writeContract) {
      const signer = new Wallet(
        requireEnv("BENDAHARA_PRIVATE_KEY"),
        this.getProvider(),
      );

      this.writeContract = new Contract(
        requireEnv("PESANTREN_TREASURY_ADDRESS"),
        TREASURY_LEDGER_ABI,
        signer,
      );
    }

    return this.writeContract;
  }

  private async isRecordedOnChain(kodeTransaksi: string): Promise<boolean> {
    const result = await withTimeout(
      this.getReadContract().getFunction("verifikasiTransaksi")(
        kodeTransaksi,
      ),
      this.requestTimeoutMs,
      "verifikasiTransaksi",
    );

    return Boolean(result[0]);
  }

  private async markSynced(
    id: string,
    txHash?: string,
    note?: string,
  ): Promise<Web3SyncResult> {
    const updated = await prisma.transaksiKeuangan.update({
      where: { id },
      data: {
        web3Status: Web3SyncStatus.SYNCED,
        ...(txHash ? { txHashWeb3: txHash } : {}),
        web3SyncedAt: new Date(),
        web3LastError: note ?? null,
      },
      select: { txHashWeb3: true },
    });

    return {
      id,
      status: Web3SyncStatus.SYNCED,
      txHashWeb3: updated.txHashWeb3 ?? undefined,
      ...(note ? { error: note } : {}),
    };
  }

  private async markPending(
    id: string,
    error: string,
    txHash?: string,
  ): Promise<Web3SyncResult> {
    const message = truncate(error);

    await prisma.transaksiKeuangan.update({
      where: { id },
      data: {
        web3Status: Web3SyncStatus.PENDING,
        web3LastError: message,
        ...(txHash ? { txHashWeb3: txHash } : {}),
      },
    });

    return {
      id,
      status: Web3SyncStatus.PENDING,
      txHashWeb3: txHash,
      error: message,
    };
  }

  private async markFailed(
    id: string,
    error: string,
  ): Promise<Web3SyncResult> {
    const message = truncate(error);

    await prisma.transaksiKeuangan.update({
      where: { id },
      data: {
        web3Status: Web3SyncStatus.FAILED,
        web3LastError: message,
      },
    });

    return { id, status: Web3SyncStatus.FAILED, error: message };
  }

  private async markNotRequired(id: string): Promise<Web3SyncResult> {
    await prisma.transaksiKeuangan.update({
      where: { id },
      data: {
        web3Status: Web3SyncStatus.NOT_REQUIRED,
        web3LastError: null,
        web3SyncedAt: null,
      },
    });

    return { id, status: Web3SyncStatus.NOT_REQUIRED };
  }

  private async attemptSync(
    record: TransaksiKeuangan,
  ): Promise<Web3SyncResult> {
    if (record.web3Status === Web3SyncStatus.SYNCED) {
      return {
        id: record.id,
        status: Web3SyncStatus.SYNCED,
        txHashWeb3: record.txHashWeb3 ?? undefined,
      };
    }

    if (record.web3Status === Web3SyncStatus.NOT_REQUIRED) {
      return { id: record.id, status: Web3SyncStatus.NOT_REQUIRED };
    }

    const jenisTransaksi = JENIS_TRANSAKSI_ON_CHAIN[record.jenisTransaksi];

    if (jenisTransaksi === null) {
      return this.markNotRequired(record.id);
    }

    if (record.web3Attempts >= this.maxAttempts) {
      return this.markFailed(
        record.id,
        record.web3LastError ?? "Batas percobaan sinkronisasi tercapai.",
      );
    }

    await prisma.transaksiKeuangan.update({
      where: { id: record.id },
      data: { web3Attempts: { increment: 1 } },
    });

    try {
      const provider = this.getProvider();

      if (record.txHashWeb3) {
        const receipt = await withTimeout(
          provider.getTransactionReceipt(record.txHashWeb3),
          this.requestTimeoutMs,
          "getTransactionReceipt",
        );

        if (receipt) {
          return receipt.status === 1
            ? this.markSynced(record.id, record.txHashWeb3)
            : this.markFailed(
                record.id,
                `Transaksi on-chain revert (${record.txHashWeb3}).`,
              );
        }

        const confirmed = await withTimeout(
          provider.waitForTransaction(
            record.txHashWeb3,
            1,
            this.confirmTimeoutMs,
          ),
          this.confirmTimeoutMs + 1_000,
          "waitForTransaction",
        );

        if (confirmed?.status === 1) {
          return this.markSynced(record.id, record.txHashWeb3);
        }

        return this.markPending(
          record.id,
          "Transaksi sudah terkirim, menunggu konfirmasi on-chain.",
          record.txHashWeb3,
        );
      }

      if (await this.isRecordedOnChain(record.kodeTransaksi)) {
        return this.markSynced(
          record.id,
          undefined,
          "Sudah tercatat on-chain; hash transaksi tidak tersedia.",
        );
      }

      const tx = (await withTimeout(
        this.getWriteContract().getFunction("catatTransaksi")(
          record.kodeTransaksi,
          hashSantriId(record.santriId),
          jenisTransaksi,
          record.nominal,
        ) as Promise<TransactionResponse>,
        this.requestTimeoutMs,
        "catatTransaksi",
      )) as TransactionResponse;

      await prisma.transaksiKeuangan.update({
        where: { id: record.id },
        data: {
          txHashWeb3: tx.hash,
          web3LastError: null,
        },
      });

      try {
        const receipt = await withTimeout(
          tx.wait(1),
          this.confirmTimeoutMs,
          "konfirmasi transaksi",
        );

        if (!receipt || receipt.status !== 1) {
          return this.markFailed(
            record.id,
            `Transaksi on-chain revert (${tx.hash}).`,
          );
        }

        return this.markSynced(record.id, tx.hash);
      } catch (error) {
        return this.markPending(
          record.id,
          `Terkirim (${tx.hash}), menunggu konfirmasi: ${toErrorMessage(error)}`,
          tx.hash,
        );
      }
    } catch (error) {
      const message = toErrorMessage(error);

      try {
        if (await this.isRecordedOnChain(record.kodeTransaksi)) {
          return this.markSynced(
            record.id,
            record.txHashWeb3 ?? undefined,
            "Tercatat on-chain setelah terjadi error pengiriman.",
          );
        }
      } catch {
        // RPC masih tidak tersedia; pertahankan status PENDING.
      }

      return this.markPending(
        record.id,
        message,
        record.txHashWeb3 ?? undefined,
      );
    }
  }

  /**
   * Menulis jejak audit dan menjadwalkan sinkronisasi on-chain.
   * Mutasi saldo/tagihan tetap menjadi tanggung jawab service domain.
   */
  async catatTransaksiDenganFallback(
    input: CatatTransaksiInput,
  ): Promise<TransaksiKeuangan> {
    if (input.nominal <= 0n) {
      throw new Web3LedgerError("Nominal transaksi harus lebih dari 0.");
    }

    const kodeTransaksi = input.kodeTransaksi.trim();

    if (!kodeTransaksi) {
      throw new Web3LedgerError("kodeTransaksi tidak boleh kosong.");
    }

    const jenisTransaksi = JENIS_TRANSAKSI_ON_CHAIN[input.jenisTransaksi];

    const record = await prisma.transaksiKeuangan.create({
      data: {
        kodeTransaksi,
        santriId: input.santriId,
        jenisTransaksi: input.jenisTransaksi,
        nominal: input.nominal,
        metodePembayaran: input.metodePembayaran,
        keterangan: input.keterangan,
        createdById: input.createdById,
        web3Status:
          jenisTransaksi === null
            ? Web3SyncStatus.NOT_REQUIRED
            : Web3SyncStatus.PENDING,
      },
    });

    if (jenisTransaksi !== null) {
      this.enqueueSync(record.id);
    }

    return record;
  }

  /**
   * Menjadwalkan sinkronisasi record yang sudah dibuat di dalam transaksi DB
   * keuangan. Dipanggil setelah commit agar transaksi yang rollback tidak
   * pernah meninggalkan jejak on-chain.
   */
  catatTransaksi(transaksiId: string): void {
    this.enqueueSync(transaksiId);
  }

  enqueueSync(transaksiId: string): void {
    void this.runSerial(async () => {
      const record = await prisma.transaksiKeuangan.findUnique({
        where: { id: transaksiId },
      });

      if (
        !record ||
        record.web3Status === Web3SyncStatus.SYNCED ||
        record.web3Status === Web3SyncStatus.NOT_REQUIRED
      ) {
        return;
      }

      await this.attemptSync(record);
    }).catch((error: unknown) => {
      console.error("[Web3Ledger] Sinkronisasi gagal:", toErrorMessage(error));
    });
  }

  async retryPendingTransactions(
    limit = this.retryBatchSize,
  ): Promise<RetrySummary> {
    return this.runSerial(async () => {
      const effectiveLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);

      const records = await prisma.transaksiKeuangan.findMany({
        where: {
          web3Status: {
            in: [Web3SyncStatus.PENDING, Web3SyncStatus.FAILED],
          },
          web3Attempts: { lt: this.maxAttempts },
        },
        orderBy: { createdAt: "asc" },
        take: effectiveLimit,
      });

      const summary: RetrySummary = {
        processed: 0,
        synced: 0,
        pending: 0,
        failed: 0,
        skipped: 0,
      };

      for (const record of records) {
        summary.processed += 1;
        const result = await this.attemptSync(record);

        if (result.status === Web3SyncStatus.SYNCED) {
          summary.synced += 1;
        } else if (result.status === Web3SyncStatus.PENDING) {
          summary.pending += 1;
        } else if (result.status === Web3SyncStatus.FAILED) {
          summary.failed += 1;
        } else {
          summary.skipped += 1;
        }
      }

      return summary;
    });
  }

  async verifikasiKuitansi(
    kodeTransaksi: string,
  ): Promise<VerifikasiKuitansiResult> {
    const result = await withTimeout(
      this.getReadContract().getFunction("verifikasiTransaksi")(
        kodeTransaksi,
      ),
      this.requestTimeoutMs,
      "verifikasiTransaksi",
    );

    if (!result[0]) {
      return { terverifikasi: false, record: null };
    }

    const record = result[1] as [
      string,
      string,
      bigint,
      bigint,
      bigint,
    ];

    return {
      terverifikasi: true,
      record: {
        kodeTransaksi: String(record[0]),
        santriIdHash: String(record[1]),
        jenisTransaksi: Number(record[2]),
        nominalRupiah: BigInt(record[3]),
        timestamp: BigInt(record[4]),
      },
    };
  }

  async getTotalDanaKategori(jenisTransaksi: number): Promise<bigint> {
    const total = await withTimeout(
      this.getReadContract().getFunction("getTotalDanaKategori")(
        jenisTransaksi,
      ),
      this.requestTimeoutMs,
      "getTotalDanaKategori",
    );

    return BigInt(total as bigint);
  }
}

const globalForWeb3 = globalThis as unknown as {
  web3Service?: Web3Service;
};

export const web3Service = globalForWeb3.web3Service ?? new Web3Service();

if (process.env.NODE_ENV !== "production") {
  globalForWeb3.web3Service = web3Service;
}

export function catatTransaksiDenganFallback(
  input: CatatTransaksiInput,
): Promise<TransaksiKeuangan> {
  return web3Service.catatTransaksiDenganFallback(input);
}

export function retryPendingTransactions(
  limit?: number,
): Promise<RetrySummary> {
  return web3Service.retryPendingTransactions(limit);
}

export function verifikasiKuitansi(
  kodeTransaksi: string,
): Promise<VerifikasiKuitansiResult> {
  return web3Service.verifikasiKuitansi(kodeTransaksi);
}

export function getTotalDanaKategori(
  jenisTransaksi: number,
): Promise<bigint> {
  return web3Service.getTotalDanaKategori(jenisTransaksi);
}
