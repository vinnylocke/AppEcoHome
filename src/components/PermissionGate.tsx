import React from "react";
import { usePermissions } from "../context/HomePermissionsContext";
import type { PermissionKey } from "../lib/permissions";

interface Props {
  require: PermissionKey;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export default function PermissionGate({ require, fallback = null, children }: Props) {
  const { can } = usePermissions();
  return can(require) ? <>{children}</> : <>{fallback}</>;
}
