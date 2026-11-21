import { HDNodeWallet } from "ethers";

const DERIVATION_PREFIX = "m/44'/60'/0'/0";

// Hanya untuk server/script. Jangan pernah diimpor oleh Client Component.
export function deriveCustodialWallet(index: number, mnemonic?: string): HDNodeWallet {
  const phrase = mnemonic ?? process.env.CUSTODIAL_MASTER_MNEMONIC;

  if (!phrase) {
    throw new Error("CUSTODIAL_MASTER_MNEMONIC belum dikonfigurasi.");
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new Error("walletIndex harus bilangan bulat >= 0.");
  }

  return HDNodeWallet.fromPhrase(
    phrase,
    undefined,
    `${DERIVATION_PREFIX}/${index}`,
  );
}
