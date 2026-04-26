import { supabase } from "../lib/supabase";

export const BlueprintService = {
  async generateBlueprintTasks(
    blueprintId: string,
    startDate?: string,
  ): Promise<void> {
    const body: Record<string, string> = { blueprint_id: blueprintId };
    if (startDate) body.start_date = startDate;
    const { error } = await supabase.functions.invoke("generate-tasks", {
      body,
    });
    if (error) throw error;
  },

  async generateHomeTasks(homeId: string): Promise<void> {
    const { error } = await supabase.functions.invoke("generate-tasks", {
      body: { homeId },
    });
    if (error) throw error;
  },
};
