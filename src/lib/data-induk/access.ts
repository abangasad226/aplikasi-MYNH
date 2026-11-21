import { Role } from "@prisma/client";
import type { NextRequest } from "next/server";
import { requireRoles } from "@/lib/auth/session";

// Tata usaha dan perubahan data induk hanya untuk Operator.
export const DATA_INDUK_ROLES = [Role.OPERATOR] as const;

export function requireDataIndukOperator(request: NextRequest) {
  return requireRoles(request, DATA_INDUK_ROLES);
}
