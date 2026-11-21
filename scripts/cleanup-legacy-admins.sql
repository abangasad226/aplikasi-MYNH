UPDATE "SystemSetting" s SET "updatedById" = b.id FROM "User" b
WHERE b.email = 'bendahara@pesantren.test'
  AND s."updatedById" IN (SELECT id FROM "User" WHERE email IN ('admin@pesantren.test', 'operator@pesantren.test'));
UPDATE "TransaksiKeuangan" t SET "createdById" = b.id FROM "User" b
WHERE b.email = 'bendahara@pesantren.test'
  AND t."createdById" IN (SELECT id FROM "User" WHERE email IN ('admin@pesantren.test', 'operator@pesantren.test'));
UPDATE "LogPelanggaran" l SET "dicatatOlehId" = b.id FROM "User" b
WHERE b.email = 'bendahara@pesantren.test'
  AND l."dicatatOlehId" IN (SELECT id FROM "User" WHERE email IN ('admin@pesantren.test', 'operator@pesantren.test'));
DELETE FROM "User" u
WHERE u.email IN ('admin@pesantren.test', 'operator@pesantren.test')
  AND NOT EXISTS (SELECT 1 FROM "SystemSetting" s WHERE s."updatedById" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "TransaksiKeuangan" t WHERE t."createdById" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "LogPelanggaran" l WHERE l."dicatatOlehId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "Santri" s WHERE s."waliId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "MerchantKantin" m WHERE m."pemilikUserId" = u.id)
  AND NOT EXISTS (SELECT 1 FROM "GuruDanTendik" g WHERE g."userId" = u.id);
