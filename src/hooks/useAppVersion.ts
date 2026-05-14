import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useAppVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("app_config")
      .select("value")
      .eq("key", "app_version")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value?.major != null) {
          const { major, minor } = data.value;
          setVersion(
            `Rhozly OS ${String(major).padStart(2, "0")}.${String(minor).padStart(4, "0")}`,
          );
        }
      });
  }, []);

  return version;
}
