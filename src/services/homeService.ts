import { supabase } from "../lib/supabase";
import { Home } from "../types";

export const createHome = async (
  userId: string,
  name: string,
): Promise<{ id: string; name: string }> => {
  // Call the database function we just created
  const { data: homeId, error } = await supabase.rpc("create_home_bundle", {
    user_id_input: userId,
    home_name_input: name,
  });

  if (error) {
    throw new Error(`Failed to create home: ${error.message}`);
  }

  // Since it was atomic, we know if we have a homeId,
  // the member and profile steps also succeeded.
  return {
    id: homeId,
    name: name,
  };
};

export const joinHome = async (
  userId: string,
  homeId: string,
): Promise<void> => {
  const { error } = await supabase.rpc("join_home_bundle", {
    target_home_id: homeId,
    target_user_id: userId,
  });

  if (error) throw new Error(`Could not join home: ${error.message}`);
};

export const leaveHome = async (
  userId: string,
  homeId: string,
): Promise<void> => {
  const { error } = await supabase.rpc("leave_home_bundle", {
    target_home_id: homeId,
    target_user_id: userId,
  });

  if (error) throw new Error(`Could not leave home: ${error.message}`);
};

export const getHome = async (homeId: string): Promise<Home | null> => {
  const { data, error } = await supabase
    .from("homes")
    .select(
      `
      id, 
      name, 
      home_members ( user_id )
    `,
    )
    .eq("id", homeId)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    name: data.name,
    // Map the array of objects into a simple array of IDs
    memberIds: data.home_members.map((m: any) => m.user_id),
  };
};

export const getHomesForUser = async (userId: string): Promise<Home[]> => {
  const { data, error } = await supabase
    .from("homes")
    .select(
      `
      id,
      name,
      home_members!inner ( user_id )
    `,
    )
    .eq("home_members.user_id", userId);

  if (error) {
    console.error("Error fetching homes:", error.message);
    return [];
  }

  return data.map((home: any) => ({
    id: home.id,
    name: home.name,
    memberIds: home.home_members.map((m: any) => m.user_id),
  }));
};
