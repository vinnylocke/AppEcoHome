import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch pending tasks due today or earlier
    // We grab the date string in YYYY-MM-DD format to match your 'date' column
    const today = new Date().toISOString().split("T")[0];

    const { data: pendingTasks, error: taskError } = await supabase
      .from("tasks")
      .select("id, home_id, title")
      .eq("status", "Pending")
      .lte("due_date", today);

    if (taskError) throw taskError;

    if (!pendingTasks || pendingTasks.length === 0) {
      return new Response(JSON.stringify({ message: "No tasks due today." }), {
        status: 200,
      });
    }

    // 2. Group the tasks by the Home they belong to
    const tasksByHome = pendingTasks.reduce((acc: any, task) => {
      // Your schema allows null home_id, so we safely skip those for now
      if (task.home_id) {
        if (!acc[task.home_id]) acc[task.home_id] = [];
        acc[task.home_id].push(task);
      }
      return acc;
    }, {});

    const homeIds = Object.keys(tasksByHome);
    if (homeIds.length === 0) {
      return new Response(
        JSON.stringify({ message: "No home-linked tasks found." }),
        { status: 200 },
      );
    }

    // 3. Find ALL users that live in these homes!
    const { data: homeMembers, error: memberError } = await supabase
      .from("home_members")
      .select("user_id, home_id")
      .in("home_id", homeIds);

    if (memberError) throw memberError;

    // 4. Create a notification for EVERY person in the home
    const notificationsToInsert = [];

    for (const member of homeMembers) {
      const homeTasks = tasksByHome[member.home_id];
      if (!homeTasks || homeTasks.length === 0) continue;

      const title = "🌿 Good Morning!";
      // We use your 'title' column here
      const body =
        homeTasks.length === 1
          ? `Your home has a pending task: ${homeTasks[0].title}.`
          : `Your home has ${homeTasks.length} plant care tasks waiting for you today!`;

      notificationsToInsert.push({
        user_id: member.user_id,
        home_id: member.home_id,
        title: title,
        body: body,
        type: "daily_batch",
        data: { route: "/schedule" },
        is_read: false,
      });
    }

    if (notificationsToInsert.length === 0) {
      return new Response(
        JSON.stringify({ message: "No notifications to send." }),
        { status: 200 },
      );
    }

    // 5. Insert into notifications, triggering our push webhook
    const { error: insertError } = await supabase
      .from("notifications")
      .insert(notificationsToInsert);

    if (insertError) throw insertError;

    console.log(
      `Successfully sent home-based batch notifications to ${notificationsToInsert.length} users.`,
    );
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Batch Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
