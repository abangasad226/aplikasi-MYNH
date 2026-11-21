// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PesantrenTreasuryLedger
/// @notice Buku besar audit immutable untuk transaksi keuangan pesantren.
/// @dev Kategori 1-4 adalah dana masuk; kategori 5 (JAJAN_KANTIN) adalah belanja;
///      kategori 6 (REVERSAL_INFAQ_KE_JAJAN) adalah pengembalian dana infaq.
contract PesantrenTreasuryLedger is AccessControl, ReentrancyGuard {
    bytes32 public constant BENDAHARA_ROLE = keccak256("BENDAHARA_ROLE");
    uint8 public constant MAX_JENIS_TRANSAKSI = 6;

    struct AuditRecord {
        string kodeTransaksi;
        bytes32 santriIdHash;
        uint8 jenisTransaksi;
        uint256 nominalRupiah;
        uint256 timestamp;
    }

    mapping(string => AuditRecord) private _auditRecords;
    mapping(string => bool) private _recorded;
    mapping(uint8 => uint256) private _totalDanaKategori;

    event TransaksiTercatat(
        string kodeTransaksi,
        bytes32 indexed santriIdHash,
        uint8 indexed jenisTransaksi,
        uint256 nominalRupiah,
        uint256 timestamp,
        address indexed dicatatOleh
    );

    error AlamatAdminTidakValid();
    error KodeTransaksiKosong();
    error SantriIdHashKosong();
    error NominalHarusLebihDariNol();
    error JenisTransaksiTidakValid(uint8 jenisTransaksi);
    error DuplikatKodeTransaksi(string kodeTransaksi);

    constructor(address adminYayasan) {
        if (adminYayasan == address(0)) revert AlamatAdminTidakValid();

        // OpenZeppelin v5 tidak memberi DEFAULT_ADMIN_ROLE otomatis ke deployer.
        _grantRole(DEFAULT_ADMIN_ROLE, adminYayasan);
    }

    /// @notice Mencatat satu transaksi keuangan ke ledger permanen.
    /// @dev Hanya akun dengan BENDAHARA_ROLE yang dapat memanggil fungsi ini.
    function catatTransaksi(
        string calldata kodeTransaksi,
        bytes32 santriIdHash,
        uint8 jenisTransaksi,
        uint256 nominalRupiah
    ) external onlyRole(BENDAHARA_ROLE) nonReentrant {
        if (bytes(kodeTransaksi).length == 0) revert KodeTransaksiKosong();
        if (santriIdHash == bytes32(0)) revert SantriIdHashKosong();
        if (nominalRupiah == 0) revert NominalHarusLebihDariNol();
        if (jenisTransaksi == 0 || jenisTransaksi > MAX_JENIS_TRANSAKSI) {
            revert JenisTransaksiTidakValid(jenisTransaksi);
        }
        if (_recorded[kodeTransaksi]) {
            revert DuplikatKodeTransaksi(kodeTransaksi);
        }

        _recorded[kodeTransaksi] = true;
        _auditRecords[kodeTransaksi] = AuditRecord({
            kodeTransaksi: kodeTransaksi,
            santriIdHash: santriIdHash,
            jenisTransaksi: jenisTransaksi,
            nominalRupiah: nominalRupiah,
            timestamp: block.timestamp
        });

        _totalDanaKategori[jenisTransaksi] += nominalRupiah;

        emit TransaksiTercatat(
            kodeTransaksi,
            santriIdHash,
            jenisTransaksi,
            nominalRupiah,
            block.timestamp,
            _msgSender()
        );
    }

    /// @notice Memverifikasi keaslian kuitansi digital berdasarkan kode transaksi.
    function verifikasiTransaksi(
        string calldata kodeTransaksi
    ) external view returns (bool terverifikasi, AuditRecord memory record) {
        record = _auditRecords[kodeTransaksi];
        terverifikasi = _recorded[kodeTransaksi];
    }

    /// @notice Mengembalikan akumulasi nominal per kategori transaksi.
    function getTotalDanaKategori(
        uint8 jenisTransaksi
    ) external view returns (uint256) {
        if (jenisTransaksi == 0 || jenisTransaksi > MAX_JENIS_TRANSAKSI) {
            revert JenisTransaksiTidakValid(jenisTransaksi);
        }

        return _totalDanaKategori[jenisTransaksi];
    }
}
