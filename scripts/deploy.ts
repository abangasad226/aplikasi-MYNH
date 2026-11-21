import { ethers } from "hardhat";
import type { ContractTransactionResponse } from "ethers";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();

  if (!deployer) {
    throw new Error("Tidak ada signer deployment yang tersedia.");
  }

  const adminAddress =
    process.env.ADMIN_YAYASAN_ADDRESS?.trim() || deployer.address;
  const bendaharaAddress =
    process.env.BENDAHARA_ADDRESS?.trim() || deployer.address;

  if (!ethers.isAddress(adminAddress)) {
    throw new Error(`ADMIN_YAYASAN_ADDRESS tidak valid: ${adminAddress}`);
  }

  if (
    !ethers.isAddress(bendaharaAddress) ||
    bendaharaAddress === ethers.ZeroAddress
  ) {
    throw new Error(`BENDAHARA_ADDRESS tidak valid: ${bendaharaAddress}`);
  }

  console.log("Deployer        :", deployer.address);
  console.log("Admin yayasan   :", adminAddress);
  console.log("Bendahara       :", bendaharaAddress);

  const TreasuryLedger = await ethers.getContractFactory(
    "PesantrenTreasuryLedger",
  );
  const ledger = await TreasuryLedger.deploy(adminAddress);
  const deploymentTx = ledger.deploymentTransaction();

  await ledger.waitForDeployment();

  const ledgerAddress = await ledger.getAddress();
  console.log("Contract        :", ledgerAddress);
  console.log("Deploy tx       :", deploymentTx?.hash ?? "-");

  const bendaharaRole = await ledger.getFunction("BENDAHARA_ROLE")();
  const alreadyGranted = await ledger.getFunction("hasRole")(
    bendaharaRole,
    bendaharaAddress,
  );

  if (alreadyGranted) {
    console.log("BENDAHARA_ROLE  : sudah aktif");
  } else if (deployer.address.toLowerCase() !== adminAddress.toLowerCase()) {
    console.warn(
      "Deployer bukan admin yayasan. Grant BENDAHARA_ROLE harus dilakukan oleh akun admin/multisig.",
    );
  } else {
    const grantTx = (await ledger.getFunction("grantRole")(
      bendaharaRole,
      bendaharaAddress,
    )) as ContractTransactionResponse;
    await grantTx.wait();
    console.log("BENDAHARA_ROLE  : diberikan (tx:", grantTx.hash + ")");
  }

  console.log("\nTambahkan konfigurasi berikut ke .env:");
  console.log(`PESANTREN_TREASURY_ADDRESS="${ledgerAddress}"`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
