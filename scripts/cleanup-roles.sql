UPDATE "User" SET role = 'BENDAHARA' WHERE role::text IN ('SUPER_ADMIN', 'OPERATOR_PESANTREN');
UPDATE "GuruDanTendik" SET jabatan = 'STAF_TATA_USAHA' WHERE jabatan::text = 'OPERATOR_EMIS';
