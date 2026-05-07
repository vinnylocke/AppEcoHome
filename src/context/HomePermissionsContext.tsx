import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import type { Role, PermissionKey, PermissionSet } from "../lib/permissions";
import { resolvePermissions } from "../lib/permissions";
import type { HomeMemberWithProfile } from "../types";

interface HomePermissionsResult {
  role: Role | null;
  permissions: PermissionSet | null;
  can: (key: PermissionKey) => boolean;
  isLoading: boolean;
  homeMembers: HomeMemberWithProfile[];
}

const HomePermissionsContext = createContext<HomePermissionsResult>({
  role: null,
  permissions: null,
  can: () => false,
  isLoading: true,
  homeMembers: [],
});

export function usePermissions(): HomePermissionsResult {
  return useContext(HomePermissionsContext);
}

interface Props {
  homeId: string | null | undefined;
  userId: string | null | undefined;
  children: React.ReactNode;
}

export function HomePermissionsProvider({ homeId, userId, children }: Props) {
  const [role, setRole] = useState<Role | null>(null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [homeMembers, setHomeMembers] = useState<HomeMemberWithProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!homeId || !userId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    const load = async () => {
      const [myRow, allRows] = await Promise.all([
        supabase
          .from("home_members")
          .select("role, permissions")
          .eq("home_id", homeId)
          .eq("user_id", userId)
          .single(),
        supabase
          .from("home_members")
          .select("id, home_id, user_id, role, permissions, created_at")
          .eq("home_id", homeId),
      ]);

      if (myRow.data) {
        setRole(myRow.data.role as Role);
        setOverrides(myRow.data.permissions ?? {});
      }

      if (allRows.data && allRows.data.length > 0) {
        const userIds = allRows.data.map((m: any) => m.user_id);
        const { data: profiles } = await supabase
          .from("user_profiles")
          .select("uid, display_name, email")
          .in("uid", userIds);

        const profileMap = Object.fromEntries(
          (profiles ?? []).map((p: any) => [p.uid, p]),
        );

        const members: HomeMemberWithProfile[] = allRows.data.map((m: any) => ({
          id: m.id,
          home_id: m.home_id,
          user_id: m.user_id,
          role: m.role,
          permissions: m.permissions ?? {},
          created_at: m.created_at,
          display_name: profileMap[m.user_id]?.display_name ?? null,
          email: profileMap[m.user_id]?.email ?? null,
        }));
        setHomeMembers(members);
      }

      setIsLoading(false);
    };

    load().catch(() => setIsLoading(false));
  }, [homeId, userId]);

  const permissions = useMemo<PermissionSet | null>(() => {
    if (!role) return null;
    return resolvePermissions(role, overrides as Partial<PermissionSet>);
  }, [role, overrides]);

  const can = useMemo<(key: PermissionKey) => boolean>(() => {
    if (role === 'owner') return () => true;
    if (!permissions) return () => false;
    return (key: PermissionKey) => permissions[key] === true;
  }, [role, permissions]);

  const value = useMemo<HomePermissionsResult>(
    () => ({ role, permissions, can, isLoading, homeMembers }),
    [role, permissions, can, isLoading, homeMembers]
  );

  return (
    <HomePermissionsContext.Provider value={value}>
      {children}
    </HomePermissionsContext.Provider>
  );
}
